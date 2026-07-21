import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import type { NotificationTypeKey } from './notificationTypes';

export type NotificationLang = 'en' | 'ar';

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set. Check Vercel environment variables.');
  }
  return new Resend(apiKey);
}

export class NotificationService {
  private static _supabase: ReturnType<typeof createClient> | null = null;

  private static get supabase() {
    if (!this._supabase) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error('Supabase env vars missing in NotificationService');
      this._supabase = createClient(url, key);
    }
    return this._supabase;
  }

  /**
   * Check if a user has enabled notifications for a specific type
   */
  static async isEnabled(userId: string, typeKey: NotificationTypeKey): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('user_notification_preferences')
        .select('preferences')
        .eq('user_id', userId)
        .single() as { data: { preferences: Record<string, boolean> } | null, error: unknown };

      if (error || !data) {
        return true;
      }

      return data.preferences[typeKey] !== false;
    } catch (err) {
      console.error('Error checking notification preference:', err);
      return true;
    }
  }

  /**
   * Resolve the recipient's preferred notification language (CORE-11).
   * users.notification_language ('en'|'ar'|null) → 'en'. Fails open to 'en'.
   * (No org-level default_language column exists yet; add it to the chain here
   * and in w5-6-notif-language.sql if one is introduced.)
   */
  static async getRecipientLanguage(userId: string): Promise<NotificationLang> {
    try {
      const { data } = await this.supabase
        .from('users')
        .select('notification_language')
        .eq('id', userId)
        .maybeSingle() as { data: { notification_language?: string | null } | null };
      return data?.notification_language === 'ar' ? 'ar' : 'en';
    } catch (err) {
      console.error('Error resolving notification language:', err);
      return 'en'; // ponytail: fail open to en, never block a notification on this
    }
  }

  /**
   * Send email and push notifications if user preferences allow
   */
  static async notify(
    userId: string,
    typeKey: NotificationTypeKey,
    options: {
      email: string;
      subject: string;
      htmlContent: string;
      pushTitle: string;
      pushBody: string;
      pushData?: Record<string, string>;
      // CORE-11: optional per-language variants. When present, the recipient's
      // notification_language picks the variant; the top-level fields above are
      // the fallback (used as-is when `localized` is omitted — existing callers
      // are unchanged and pay no extra DB round-trip).
      localized?: Partial<Record<NotificationLang, {
        subject: string;
        htmlContent: string;
        pushTitle: string;
        pushBody: string;
      }>>;
    }
  ): Promise<void> {
    const enabled = await this.isEnabled(userId, typeKey);
    if (!enabled) return;

    let { subject, htmlContent, pushTitle, pushBody } = options;
    if (options.localized) {
      const lang = await this.getRecipientLanguage(userId);
      const v = options.localized[lang] ?? options.localized.en;
      if (v) ({ subject, htmlContent, pushTitle, pushBody } = v);
    }

    await Promise.allSettled([
      this.sendEmail(userId, typeKey, options.email, subject, htmlContent),
      this.sendPush(userId, typeKey, pushTitle, pushBody, options.pushData),
    ]);
  }

  private static async sendEmail(
    userId: string,
    typeKey: NotificationTypeKey,
    email: string,
    subject: string,
    html: string
  ): Promise<void> {
    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@serviqfm.com';
      const fromName = process.env.RESEND_FROM_NAME || 'ServIQ-FM';

      console.log(`[Email] Initializing Resend client...`);
      const client = getResend();

      console.log(`[Email] Sending to ${email} from ${fromName} <${fromEmail}>`);

      const response = await client.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: email,
        subject,
        html,
      });

      if (response.error) {
        const errorMsg = `Resend API error: ${JSON.stringify(response.error)}`;
        console.error(`[Email] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      console.log(`[Email] ✓ Sent successfully to ${email}. ID: ${response.data?.id}`);
      await this.logNotification(userId, typeKey, 'email', 'sent');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Email] ✗ Failed for ${userId} (${email}): ${errorMsg}`);
      await this.logNotification(userId, typeKey, 'email', 'failed', errorMsg);
    }
  }

  private static async sendPush(
    userId: string,
    typeKey: NotificationTypeKey,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<void> {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'
      // /api/push now requires auth. This is a server-to-server call (no cookies),
      // so authenticate with the internal secret. NotificationService only runs
      // server-side (it uses SUPABASE_SERVICE_ROLE_KEY), so the secret is available.
      const internalSecret = process.env.PUSH_INTERNAL_SECRET || process.env.CRON_SECRET;
      const response = await fetch(`${appUrl}/api/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(internalSecret ? { Authorization: `Bearer ${internalSecret}` } : {}),
        },
        body: JSON.stringify({ userId, title, body, data }),
      });

      if (!response.ok) {
        throw new Error(`Push API failed: ${response.statusText}`);
      }

      await this.logNotification(userId, typeKey, 'push', 'sent');
    } catch (error) {
      console.error(`Push notification failed for user ${userId}:`, error);
      await this.logNotification(userId, typeKey, 'push', 'failed', String(error));
    }
  }

  /**
   * Insert an in-app alert-center row (CORE-15). Separate from email/push: this is
   * the feed the header bell reads. `dedupeKey` makes the insert once-only per user
   * (CORE-16 escalation cron relies on the UNIQUE (user_id, dedupe_key) constraint in
   * docs/superpowers/sql/w5-01-notif-dedupe-constraint.sql) — a duplicate is swallowed.
   * Returns true if a new row was written, false on duplicate/failure.
   */
  static async insertInApp(
    userId: string,
    organisationId: string,
    typeKey: NotificationTypeKey,
    opts: {
      title: string;
      body?: string;
      link?: string;
      dedupeKey?: string;
      // CORE-11: optional per-language title/body. title/body above are the fallback.
      localized?: Partial<Record<NotificationLang, { title: string; body?: string }>>;
    }
  ): Promise<boolean> {
    try {
      let { title, body } = opts;
      if (opts.localized) {
        const lang = await this.getRecipientLanguage(userId);
        const v = opts.localized[lang] ?? opts.localized.en;
        if (v) ({ title, body } = v);
      }
      // upsert ON CONFLICT DO NOTHING: a re-notify (same user+dedupe_key) is a
      // no-op HTTP 200 instead of a 409, so the hourly crons don't spam the log.
      // Needs a real UNIQUE constraint on (user_id, dedupe_key) — PostgREST can't
      // target the partial index (docs/superpowers/sql/w5-01-notif-dedupe-constraint.sql).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (this.supabase.from('user_notifications') as any).upsert({
        user_id: userId,
        organisation_id: organisationId,
        type_key: typeKey,
        title,
        body: body ?? null,
        link: opts.link ?? null,
        dedupe_key: opts.dedupeKey ?? null,
      }, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
      // 23505 = unique_violation: kept as a race guard (a concurrent insert can
      // still 409 between the conflict check and write). Not an error.
      if (error) {
        if ((error as { code?: string }).code === '23505') return false;
        console.error('Failed to insert in-app notification:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to insert in-app notification:', err);
      return false;
    }
  }

  private static async logNotification(
    userId: string,
    typeKey: NotificationTypeKey,
    channel: 'email' | 'push',
    status: 'sent' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.supabase.from('notification_log') as any).insert({
        user_id: userId,
        type_key: typeKey,
        channel,
        status,
        error_message: errorMessage,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to log notification:', error);
    }
  }
}
