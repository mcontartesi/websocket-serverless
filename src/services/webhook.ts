import { hmacSha256Hex } from './auth';
import { WebhookConfig } from '../types/pusher';

export interface WebhookEventPayload {
  name: 'channel_occupied' | 'channel_vacated' | 'member_added' | 'member_removed' | 'client_event';
  channel: string;
  user_id?: string;
  event?: string;
  data?: any;
  socket_id?: string;
}

export async function dispatchWebhooks(
  webhooks: WebhookConfig[],
  appKey: string,
  appSecret: string,
  events: WebhookEventPayload[]
): Promise<void> {
  if (!webhooks || webhooks.length === 0 || events.length === 0) return;

  const now = Date.now();

  for (const hook of webhooks) {
    const matchingEvents = events.filter(e => hook.events.includes(e.name));
    if (matchingEvents.length === 0) continue;

    const payload = JSON.stringify({
      time_ms: now,
      events: matchingEvents
    });

    const secret = hook.secret || appSecret;
    const signature = await hmacSha256Hex(secret, payload);

    try {
      // Non-blocking fetch execution in serverless environment
      fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Pusher-Key': appKey,
          'X-Pusher-Signature': signature
        },
        body: payload
      }).catch(err => {
        console.error(`[Poxa Webhook Error] Failed to deliver to ${hook.url}:`, err);
      });
    } catch (e) {
      console.error(`[Poxa Webhook Dispatch Error]`, e);
    }
  }
}
