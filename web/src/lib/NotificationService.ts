import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import type { NotificationTypeKey } from './notificationTypes';

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
    }
  ): Promise<void> {
    const enabled = await this.isEnabled(userId, typeKey);
    if (!enabled) return;

    await Promise.allSettled([
      this.sendEmail(userId, typeKey, options.email, options.subject, options.htmlContent),
      this.sendPush(userId, typeKey, options.pushTitle, options.pushBody, options.pushData),
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
