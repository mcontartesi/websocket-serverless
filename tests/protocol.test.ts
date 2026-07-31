import { describe, it, expect } from 'vitest';
import { PusherMessage } from '../src/types/pusher';

describe('Pusher Protocol Envelopes', () => {
  it('should construct valid pusher:connection_established envelope', () => {
    const socketId = '100.200';
    const msg: PusherMessage = {
      event: 'pusher:connection_established',
      data: JSON.stringify({
        socket_id: socketId,
        activity_timeout: 120
      })
    };

    expect(msg.event).toBe('pusher:connection_established');
    const parsed = JSON.parse(msg.data);
    expect(parsed.socket_id).toBe(socketId);
    expect(parsed.activity_timeout).toBe(120);
  });

  it('should handle client subscription succeeded envelope', () => {
    const channel = 'presence-lobby';
    const msg: PusherMessage = {
      event: 'pusher:subscription_succeeded',
      channel,
      data: JSON.stringify({
        presence: {
          ids: ['user-1', 'user-2'],
          hash: { 'user-1': { name: 'Max' }, 'user-2': { name: 'Alex' } },
          count: 2
        }
      })
    };

    expect(msg.channel).toBe('presence-lobby');
    const parsed = JSON.parse(msg.data);
    expect(parsed.presence.count).toBe(2);
    expect(parsed.presence.ids).toContain('user-1');
  });
});
