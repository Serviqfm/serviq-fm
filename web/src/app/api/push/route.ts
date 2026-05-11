import { createClient } from '@supabase/supabase-js';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { userId, title, body, data } = await request.json();

    if (!userId || !title || !body) {
      return Response.json(
        { error: 'Missing required fields: userId, title, body' },
        { status: 400 }
      );
    }

    // Fetch device tokens for user
    const { data: deviceData, error: deviceError } = await supabase
      .from('user_devices')
      .select('push_token')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (deviceError || !deviceData || deviceData.length === 0) {
      return Response.json(
        { error: 'No active devices found for user', sent: 0 },
        { status: 404 }
      );
    }

    const pushTokens = deviceData
      .map((d: any) => d.push_token)
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

    // Send via Expo
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
