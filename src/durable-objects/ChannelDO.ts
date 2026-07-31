import { DurableObject } from 'cloudflare:workers';
import {
  PusherMessage,
  SubscribeData,
  PresenceUserData,
  WebSocketAttachment,
  ChannelsListResponse,
  UsersListResponse
} from '../types/pusher';
import { verifyPrivateChannelAuth, verifyPresenceChannelAuth } from '../services/auth';
import { dispatchWebhooks } from '../services/webhook';

export interface Env {
  CHANNEL_DO: DurableObjectNamespace;
  WEBSOCKET_HUB: DurableObjectNamespace;
  ASSETS?: Fetcher;
  DEFAULT_APP_ID?: string;
  DEFAULT_APP_KEY?: string;
  DEFAULT_APP_SECRET?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}

export class ChannelDO extends DurableObject<Env> {
  private appId: string = '';
  private channelName: string = '';

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  /**
   * Main HTTP interface for Worker REST API -> ChannelDO operations
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle WebSocket upgrade request
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const socketId = url.searchParams.get('socket_id') || '';
      const appId = url.searchParams.get('app_id') || '';
      this.appId = appId;
      this.channelName = url.searchParams.get('channel') || '';

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      const attachment: WebSocketAttachment = {
        socketId,
        appId,
        channels: new Set(),
        presenceData: {}
      };

      this.ctx.acceptWebSocket(server, [socketId]);
      server.serializeAttachment(attachment);

      // Send pusher:connection_established
      const welcome: PusherMessage = {
        event: 'pusher:connection_established',
        data: JSON.stringify({
          socket_id: socketId,
          activity_timeout: 120
        })
      };
      server.send(JSON.stringify(welcome));

      return new Response(null, { status: 101, webSocket: client });
    }

    // REST API Internal Dispatcher
    if (request.method === 'POST' && path === '/broadcast') {
      const payload: { event: string; data: any; socket_id?: string } = await request.json();
      await this.broadcastEvent(payload.event, payload.data, payload.socket_id);
      return Response.json({ success: true });
    }

    if (request.method === 'GET' && path === '/info') {
      const sockets = this.ctx.getWebSockets();
      const presenceUsers = this.getPresenceUsers();
      return Response.json({
        occupied: sockets.length > 0,
        subscription_count: sockets.length,
        user_count: presenceUsers.length
      });
    }

    if (request.method === 'GET' && path === '/users') {
      const users = this.getPresenceUsers();
      return Response.json({ users: users.map(u => ({ id: u.user_id })) });
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Hibernation API WebSocket Message Handler
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;

    let msg: PusherMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    const attachment = ws.deserializeAttachment() as WebSocketAttachment;
    if (!attachment) return;

    switch (msg.event) {
      case 'pusher:ping':
        ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
        break;

      case 'pusher:subscribe':
        await this.handleSubscribe(ws, attachment, msg.data);
        break;

      case 'pusher:unsubscribe':
        await this.handleUnsubscribe(ws, attachment, msg.data);
        break;

      default:
        // Handle client-* events
        if (msg.event.startsWith('client-')) {
          await this.handleClientEvent(ws, attachment, msg);
        }
        break;
    }
  }

  /**
   * Hibernation API WebSocket Close Handler
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment;
    if (!attachment) return;

    const isLastConnectionInChannel = this.ctx.getWebSockets().length <= 1;

    for (const channelName of attachment.channels) {
      if (channelName.startsWith('presence-')) {
        if (attachment.presenceData && attachment.presenceData[channelName]) {
          const presenceUserData = attachment.presenceData[channelName];

          // Check if user still has other active sockets in this channel
          const remainingUsers = this.getPresenceUsers().filter(u => u.user_id === presenceUserData.user_id);
          if (remainingUsers.length <= 1) {
            this.broadcastToSockets({
              event: 'pusher_internal:member_removed',
              channel: channelName,
              data: JSON.stringify({ user_id: presenceUserData.user_id })
            });
          }
        }
      }
    }

    if (isLastConnectionInChannel && this.channelName) {
      const appSecret = this.env.DEFAULT_APP_SECRET || 'ws-secret';
      const appKey = this.env.DEFAULT_APP_KEY || 'ws-key';
      dispatchWebhooks([], appKey, appSecret, [
        { name: 'channel_vacated', channel: this.channelName }
      ]);
    }
  }

  async webSocketError(ws: WebSocket, error: any) {
    console.error('[ChannelDO WebSocket Error]', error);
  }

  // --- Helpers ---

  private async handleSubscribe(ws: WebSocket, attachment: WebSocketAttachment, data: SubscribeData) {
    const channelName = data.channel;
    const appKey = this.env.DEFAULT_APP_KEY || 'ws-key';
    const appSecret = this.env.DEFAULT_APP_SECRET || 'ws-secret';

    // Channel Authentication logic
    if (channelName.startsWith('private-')) {
      const valid = await verifyPrivateChannelAuth(
        data.auth || '',
        appKey,
        appSecret,
        attachment.socketId,
        channelName
      );
      if (!valid) {
        ws.send(JSON.stringify({
          event: 'pusher:error',
          data: { code: 4009, message: `Connection is unauthorized for channel ${channelName}` }
        }));
        return;
      }
    } else if (channelName.startsWith('presence-')) {
      const valid = await verifyPresenceChannelAuth(
        data.auth || '',
        appKey,
        appSecret,
        attachment.socketId,
        channelName,
        data.channel_data
      );
      if (!valid) {
        ws.send(JSON.stringify({
          event: 'pusher:error',
          data: { code: 4009, message: `Connection is unauthorized for presence channel ${channelName}` }
        }));
        return;
      }
    }

    const isFirstConnection = this.ctx.getWebSockets().length === 1;
    attachment.channels.add(channelName);

    let presenceUserData: PresenceUserData | undefined;
    if (channelName.startsWith('presence-') && data.channel_data) {
      try {
        const parsed = JSON.parse(data.channel_data);
        presenceUserData = {
          user_id: String(parsed.user_id),
          user_info: parsed.user_info || {}
        };
        if (!attachment.presenceData) attachment.presenceData = {};
        attachment.presenceData[channelName] = presenceUserData;
      } catch (e) {
        console.error('Failed to parse presence channel_data', e);
      }
    }

    ws.serializeAttachment(attachment);

    // 1. Send pusher:subscription_succeeded to client
    if (channelName.startsWith('presence-')) {
      const presenceUsers = this.getPresenceUsers();
      const hash: Record<string, any> = {};
      const ids: string[] = [];

      for (const user of presenceUsers) {
        ids.push(user.user_id);
        hash[user.user_id] = user.user_info || {};
      }

      ws.send(JSON.stringify({
        event: 'pusher:subscription_succeeded',
        channel: channelName,
        data: JSON.stringify({
          presence: {
            ids,
            hash,
            count: ids.length
          }
        })
      }));

      // 2. Broadcast pusher_internal:member_added to other sockets
      if (presenceUserData) {
        this.broadcastToSockets({
          event: 'pusher_internal:member_added',
          channel: channelName,
          data: JSON.stringify({
            user_id: presenceUserData.user_id,
            user_info: presenceUserData.user_info
          })
        }, attachment.socketId);
      }
    } else {
      ws.send(JSON.stringify({
        event: 'pusher:subscription_succeeded',
        channel: channelName,
        data: {}
      }));
    }

    // Webhook for channel_occupied
    if (isFirstConnection) {
      dispatchWebhooks([], appKey, appSecret, [
        { name: 'channel_occupied', channel: channelName }
      ]);
    }
  }

  private async handleUnsubscribe(ws: WebSocket, attachment: WebSocketAttachment, data: { channel: string }) {
    const channelName = data.channel;
    attachment.channels.delete(channelName);

    if (channelName.startsWith('presence-')) {
      if (attachment.presenceData && attachment.presenceData[channelName]) {
        const presenceUserData = attachment.presenceData[channelName];
        delete attachment.presenceData[channelName];
        this.broadcastToSockets({
          event: 'pusher_internal:member_removed',
          channel: channelName,
          data: JSON.stringify({ user_id: presenceUserData.user_id })
        });
      }
    }

    ws.serializeAttachment(attachment);

    if (this.ctx.getWebSockets().length === 0) {
      const appKey = this.env.DEFAULT_APP_KEY || 'ws-key';
      const appSecret = this.env.DEFAULT_APP_SECRET || 'ws-secret';
      dispatchWebhooks([], appKey, appSecret, [
        { name: 'channel_vacated', channel: channelName }
      ]);
    }
  }

  private async handleClientEvent(ws: WebSocket, attachment: WebSocketAttachment, msg: PusherMessage) {
    if (!msg.channel) return;

    // Client events only allowed on private or presence channels
    if (!msg.channel.startsWith('private-') && !msg.channel.startsWith('presence-')) {
      return;
    }

    if (!attachment.channels.has(msg.channel)) return;

    // Broadcast to all sockets EXCEPT sender
    this.broadcastToSockets({
      event: msg.event,
      channel: msg.channel,
      data: msg.data
    }, attachment.socketId);
  }

  private async broadcastEvent(event: string, data: any, excludeSocketId?: string) {
    this.broadcastToSockets({
      event,
      channel: this.channelName,
      data: typeof data === 'string' ? data : JSON.stringify(data)
    }, excludeSocketId);
  }

  private broadcastToSockets(msg: PusherMessage, excludeSocketId?: string) {
    const sockets = this.ctx.getWebSockets();
    const messageStr = JSON.stringify(msg);

    for (const ws of sockets) {
      const attachment = ws.deserializeAttachment() as WebSocketAttachment;
      if (excludeSocketId && attachment?.socketId === excludeSocketId) {
        continue;
      }
      try {
        ws.send(messageStr);
      } catch (e) {
        console.error('Failed to send to socket', e);
      }
    }
  }

  private getPresenceUsers(): PresenceUserData[] {
    const sockets = this.ctx.getWebSockets();
    const usersMap = new Map<string, PresenceUserData>();

    for (const ws of sockets) {
      const attachment = ws.deserializeAttachment() as WebSocketAttachment;
      if (attachment && attachment.presenceData) {
        const values = Object.values(attachment.presenceData);
        for (const pData of values) {
          if (pData?.user_id) {
            usersMap.set(pData.user_id, pData);
          }
        }
      }
    }

    return Array.from(usersMap.values());
  }
}
