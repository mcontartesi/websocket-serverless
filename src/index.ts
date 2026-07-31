import { ChannelDO, Env } from './durable-objects/ChannelDO';
import { WebsocketHub } from './durable-objects/WebsocketHub';
import { verifyRestApiSignature, generateSocketId, checkAdminAuth, createAdminSessionToken } from './services/auth';
import { TriggerEventPayload, BatchTriggerPayload } from './types/pusher';

export { ChannelDO, WebsocketHub };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    const appId = env.DEFAULT_APP_ID || 'ws-app';
    const appKey = env.DEFAULT_APP_KEY || 'ws-key';
    const appSecret = env.DEFAULT_APP_SECRET || 'ws-secret';

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Pusher-Key, X-Admin-Token'
        }
      });
    }

    // --- 1. WebSocket Upgrade Route ---
    // Standard Pusher JS client connects to: /app/:app_key?protocol=7&client=js&version=...
    if (path.startsWith('/app/')) {
      const pathKey = path.split('/app/')[1];
      if (pathKey !== appKey) {
        return new Response('Invalid App Key', { status: 404 });
      }

      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade request', { status: 426 });
      }

      const socketId = generateSocketId();
      const channel = url.searchParams.get('channel') || 'global';
      const doId = env.CHANNEL_DO.idFromName(`${appId}:${channel}`);
      const stub = env.CHANNEL_DO.get(doId);

      // Register channel in global hub
      const hubId = env.WEBSOCKET_HUB.idFromName(appId);
      const hubStub = env.WEBSOCKET_HUB.get(hubId);
      ctx.waitUntil(
        hubStub.fetch('http://hub/register_channel', {
          method: 'POST',
          body: JSON.stringify({ channel })
        })
      );

      const targetUrl = new URL(request.url);
      targetUrl.searchParams.set('socket_id', socketId);
      targetUrl.searchParams.set('app_id', appId);
      targetUrl.searchParams.set('channel', channel);

      return stub.fetch(new Request(targetUrl.toString(), request));
    }

    // --- 2. Pusher HTTP REST API Routes ---
    
    // POST /apps/:app_id/events
    const eventsMatch = path.match(/^\/apps\/([^/]+)\/events$/);
    if (eventsMatch && method === 'POST') {
      const targetAppId = eventsMatch[1];
      if (targetAppId !== appId) {
        return Response.json({ error: 'App ID not found' }, { status: 404 });
      }

      const bodyText = await request.text();
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((val, key) => { queryParams[key] = val; });

      // Verify REST API signature if auth params are provided
      if (queryParams['auth_signature']) {
        const isValid = await verifyRestApiSignature(method, path, queryParams, bodyText, appSecret);
        if (!isValid) {
          return Response.json({ error: 'Invalid authentication signature' }, { status: 401 });
        }
      }

      let payload: TriggerEventPayload;
      try {
        payload = JSON.parse(bodyText);
      } catch {
        return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
      }

      const eventName = payload.name || payload.event;
      if (!eventName) {
        return Response.json({ error: 'No event name specified' }, { status: 400 });
      }

      const targetChannels = payload.channels || (payload.channel ? [payload.channel] : []);
      if (targetChannels.length === 0) {
        return Response.json({ error: 'No channel specified' }, { status: 400 });
      }

      // Dispatch event to each channel's Durable Object
      for (const ch of targetChannels) {
        const doId = env.CHANNEL_DO.idFromName(`${appId}:${ch}`);
        const stub = env.CHANNEL_DO.get(doId);
        await stub.fetch('http://channel/broadcast', {
          method: 'POST',
          body: JSON.stringify({
            event: eventName,
            data: payload.data,
            socket_id: payload.socket_id
          })
        });

        const hubId = env.WEBSOCKET_HUB.idFromName(appId);
        const hubStub = env.WEBSOCKET_HUB.get(hubId);
        ctx.waitUntil(
          hubStub.fetch('http://hub/register_channel', {
            method: 'POST',
            body: JSON.stringify({ channel: ch })
          })
        );
      }

      return Response.json({}, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // POST /apps/:app_id/batch_events
    const batchEventsMatch = path.match(/^\/apps\/([^/]+)\/batch_events$/);
    if (batchEventsMatch && method === 'POST') {
      const targetAppId = batchEventsMatch[1];
      if (targetAppId !== appId) {
        return Response.json({ error: 'App ID not found' }, { status: 404 });
      }

      const bodyText = await request.text();
      let payload: BatchTriggerPayload;
      try {
        payload = JSON.parse(bodyText);
      } catch {
        return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
      }

      for (const item of payload.batch || []) {
        const itemEvent = item.name || item.event;
        if (!item.channel || !itemEvent) continue;
        const doId = env.CHANNEL_DO.idFromName(`${appId}:${item.channel}`);
        const stub = env.CHANNEL_DO.get(doId);
        await stub.fetch('http://channel/broadcast', {
          method: 'POST',
          body: JSON.stringify({
            event: itemEvent,
            data: item.data,
            socket_id: item.socket_id
          })
        });
      }

      return Response.json({ batch: [] }, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // GET /apps/:app_id/channels
    const channelsMatch = path.match(/^\/apps\/([^/]+)\/channels$/);
    if (channelsMatch && method === 'GET') {
      const hubId = env.WEBSOCKET_HUB.idFromName(appId);
      const hubStub = env.WEBSOCKET_HUB.get(hubId);
      const filterPrefix = url.searchParams.get('filter_by_prefix') || '';

      const hubRes = await hubStub.fetch(`http://hub/channels?filter_by_prefix=${encodeURIComponent(filterPrefix)}`);
      const hubData: { channels: string[] } = await hubRes.json();

      const responseChannels: Record<string, { user_count?: number }> = {};

      for (const ch of hubData.channels) {
        const doId = env.CHANNEL_DO.idFromName(`${appId}:${ch}`);
        const stub = env.CHANNEL_DO.get(doId);
        const infoRes = await stub.fetch('http://channel/info');
        const info: { occupied: boolean; user_count?: number } = await infoRes.json();

        if (info.occupied) {
          responseChannels[ch] = {};
          if (ch.startsWith('presence-')) {
            responseChannels[ch].user_count = info.user_count || 0;
          }
        }
      }

      return Response.json({ channels: responseChannels }, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // GET /apps/:app_id/channels/:channel_name
    const singleChannelMatch = path.match(/^\/apps\/([^/]+)\/channels\/([^/]+)$/);
    if (singleChannelMatch && method === 'GET') {
      const chName = singleChannelMatch[2];
      const doId = env.CHANNEL_DO.idFromName(`${appId}:${chName}`);
      const stub = env.CHANNEL_DO.get(doId);
      const infoRes = await stub.fetch('http://channel/info');
      const info = await infoRes.json();

      return Response.json(info, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // GET /apps/:app_id/channels/:channel_name/users
    const channelUsersMatch = path.match(/^\/apps\/([^/]+)\/channels\/([^/]+)\/users$/);
    if (channelUsersMatch && method === 'GET') {
      const chName = channelUsersMatch[2];
      if (!chName.startsWith('presence-')) {
        return Response.json({ error: 'Users query only allowed for presence channels' }, { status: 400 });
      }

      const doId = env.CHANNEL_DO.idFromName(`${appId}:${chName}`);
      const stub = env.CHANNEL_DO.get(doId);
      const usersRes = await stub.fetch('http://channel/users');
      const usersData = await usersRes.json();

      return Response.json(usersData, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // --- 3. Server Status & Health Check ---
    if (path === '/health' || path === '/api/status') {
      return Response.json({
        status: 'online',
        server: 'WebSocket Serverless',
        version: '1.0.0',
        author: 'Maximiliano Contartesi',
        protocol: 7,
        runtime: 'Cloudflare Workers & Durable Objects (Hibernation API)'
      }, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    const adminUser = env.ADMIN_USERNAME || 'admin';
    const adminPass = env.ADMIN_PASSWORD || 'ws-admin-secret';

    // POST /api/admin/login
    if (path === '/api/admin/login' && method === 'POST') {
      try {
        const body: { username?: string; password?: string } = await request.json();
        if (body.username === adminUser && body.password === adminPass) {
          const token = await createAdminSessionToken(adminUser, adminPass);
          return Response.json({
            success: true,
            token,
            user: adminUser,
            method: 'password'
          }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }
      } catch {}
      return Response.json({ success: false, error: 'Invalid username or password' }, { status: 401 });
    }

    // GET /api/admin/check-auth
    if (path === '/api/admin/check-auth' && method === 'GET') {
      const authResult = await checkAdminAuth(request, adminUser, adminPass);
      return Response.json(authResult, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // GET /api/admin/info (Protected Endpoint)
    if (path === '/api/admin/info') {
      const authResult = await checkAdminAuth(request, adminUser, adminPass);
      if (!authResult.authenticated) {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
      }

      return Response.json({
        appId,
        appKey,
        appSecret,
        cluster: 'cloudflare-serverless',
        authMethod: authResult.method,
        authUser: authResult.user
      }, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // --- 4. Fallback to Static Admin UI Assets ---
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('WebSocket Serverless Engine Running', { status: 200 });
  }
};
