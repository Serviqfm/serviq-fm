import { createClient } from '@supabase/supabase-js';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { makeIpRateLimiter } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// DV-10: cap client-initiated pushes per IP. Internal server-to-server calls
// (NotificationService, cron) present the shared secret and bypass this.
const rateLimit = makeIpRateLimiter(30);

function getExpoClient() {
  return new Expo({
    accessToken: process.env.EXPO_ACCESS_TOKEN,
  });
}

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  try {
    const { userId, title, body, data } = await request.json();

    if (!userId || !title || !body) {
      return Response.json(
        { error: 'Missing required fields: userId, title, body' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // --- Auth: either an internal server-to-server secret (NotificationService)
    // or a logged-in session whose org matches the target user's org. ---
    const internalSecret = process.env.PUSH_INTERNAL_SECRET || process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization') ?? '';
    const isInternal = Boolean(internalSecret) && authHeader === `Bearer ${internalSecret}`;

    if (!isInternal) {
      const limited = rateLimit(request);
      if (limited) return limited;

      const serverSupabase = await createServerSupabaseClient();
      const { data: { user: caller } } = await serverSupabase.auth.getUser();
      if (!caller) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { data: callerProfile } = await serverSupabase
        .from('users')
        .select('organisation_id')
        .eq('id', caller.id)
        .single();
      if (!callerProfile?.organisation_id) {
        return Response.json({ error: 'No organisation' }, { status: 403 });
      }

      // The target user must belong to the caller's organisation.
      const { data: targetUser } = await supabase
        .from('users')
        .select('organisation_id')
        .eq('id', userId)
        .maybeSingle();
      if (!targetUser || targetUser.organisation_id !== callerProfile.organisation_id) {
        return Response.json({ error: 'User not found' }, { status: 404 });
      }
    }

    // DV-05: read the Expo token from users.push_token (the single store the mobile
    // app writes) — user_devices was never populated and is retired.
    const { data: userRow, error: tokenError } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', userId)
      .maybeSingle();

    if (tokenError || !userRow?.push_token) {
      return Response.json(
        { error: 'No push token registered for user', sent: 0 },
        { status: 404 }
      );
    }

    const pushTokens = [userRow.push_token]
      .filter(token => token && Expo.isExpoPushToken(token));

    if (pushTokens.length === 0) {
      return Response.json(
        { error: 'No valid push tokens found', sent: 0 },
        { status: 400 }
      );
    }

    // Build push messages
    const messages: ExpoPushMessage[] = pushTokens.map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: data || {},
    }));

    // Send via Expo (deferred to runtime)
    const expo = getExpoClient();
    const chunks = expo.chunkPushNotifications(messages);
    const results = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        results.push(...ticketChunk);
      } catch (error) {
        console.error('Expo push error:', error);
      }
    }

    // Count successes
    const successCount = results.filter(r => r.status === 'ok').length;

    return Response.json({
      sent: successCount,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error('Push API error:', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        sent: 0,
      },
      { status: 500 }
    );
  }
}
