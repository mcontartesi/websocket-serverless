import { Hono } from 'hono';
import { ChannelDO, type Env } from './durable-objects/ChannelDO';
import { WebsocketHub } from './durable-objects/WebsocketHub';
import { checkAdminAuth, createAdminSessionToken, generateSocketId, verifyRestApiSignature } from './services/auth';
import type { BatchTriggerPayload, TriggerEventPayload } from './types/pusher';

export { ChannelDO, WebsocketHub };

const app = new Hono<{ Bindings: Env }>();

// CORS preflight
app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Pusher-Key, X-Admin-Token',
      },
    });
  }
  c.header('Access-Control-Allow-Origin', '*');
  await next();
});

// Helper for default env vars
const getEnv = (env: Env) => ({
  appId: env.DEFAULT_APP_ID || 'ws-app',
  appKey: env.DEFAULT_APP_KEY || 'ws-key',
  appSecret: env.DEFAULT_APP_SECRET || 'ws-secret',
  adminUser: env.ADMIN_USERNAME || 'admin',
  adminPass: env.ADMIN_PASSWORD || 'ws-admin-secret',
});

// --- 1. WebSocket Upgrade Route ---
app.get('/app/:app_key', async (c) => {
  const { appId, appKey } = getEnv(c.env);
  const pathKey = c.req.param('app_key');

  if (pathKey !== appKey) {
    return c.text('Invalid App Key', 404);
  }

  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
    return c.text('Expected WebSocket upgrade request', 426);
  }

  const socketId = generateSocketId();
  const channel = c.req.query('channel') || 'global';
  const doId = c.env.CHANNEL_DO.idFromName(`${appId}:${channel}`);
  const stub = c.env.CHANNEL_DO.get(doId);

  // Register channel in global hub
  const hubId = c.env.WEBSOCKET_HUB.idFromName(appId);
  const hubStub = c.env.WEBSOCKET_HUB.get(hubId);
  c.executionCtx.waitUntil(
    hubStub.fetch('http://hub/register_channel', {
      method: 'POST',
      body: JSON.stringify({ channel }),
    }),
  );

  const targetUrl = new URL(c.req.url);
  targetUrl.searchParams.set('socket_id', socketId);
  targetUrl.searchParams.set('app_id', appId);
  targetUrl.searchParams.set('channel', channel);

  return stub.fetch(new Request(targetUrl.toString(), c.req.raw));
});

// --- 2. Pusher HTTP REST API Routes ---
app.post('/apps/:app_id/events', async (c) => {
  const { appId, appSecret } = getEnv(c.env);
  const targetAppId = c.req.param('app_id');

  if (targetAppId !== appId) {
    return c.json({ error: 'App ID not found' }, 404);
  }

  const bodyText = await c.req.text();
  const queryParams: Record<string, string> = {};
  new URL(c.req.url).searchParams.forEach((val, key) => {
    queryParams[key] = val;
  });

  if (queryParams['auth_signature']) {
    const isValid = await verifyRestApiSignature('POST', new URL(c.req.url).pathname, queryParams, bodyText, appSecret);
    if (!isValid) {
      return c.json({ error: 'Invalid authentication signature' }, 401);
    }
  }

  let payload: TriggerEventPayload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const eventName = payload.name || payload.event;
  if (!eventName) {
    return c.json({ error: 'No event name specified' }, 400);
  }

  const targetChannels = payload.channels || (payload.channel ? [payload.channel] : []);
  if (targetChannels.length === 0) {
    return c.json({ error: 'No channel specified' }, 400);
  }

  for (const ch of targetChannels) {
    const doId = c.env.CHANNEL_DO.idFromName(`${appId}:${ch}`);
    const stub = c.env.CHANNEL_DO.get(doId);
    await stub.fetch('http://channel/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        event: eventName,
        data: payload.data,
        socket_id: payload.socket_id,
      }),
    });

    const hubId = c.env.WEBSOCKET_HUB.idFromName(appId);
    const hubStub = c.env.WEBSOCKET_HUB.get(hubId);
    c.executionCtx.waitUntil(
      hubStub.fetch('http://hub/register_channel', {
        method: 'POST',
        body: JSON.stringify({ channel: ch }),
      }),
    );
  }

  return c.json({});
});

app.post('/apps/:app_id/batch_events', async (c) => {
  const { appId } = getEnv(c.env);
  const targetAppId = c.req.param('app_id');

  if (targetAppId !== appId) {
    return c.json({ error: 'App ID not found' }, 404);
  }

  const bodyText = await c.req.text();
  let payload: BatchTriggerPayload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  for (const item of payload.batch || []) {
    const itemEvent = item.name || item.event;
    if (!item.channel || !itemEvent) continue;
    const doId = c.env.CHANNEL_DO.idFromName(`${appId}:${item.channel}`);
    const stub = c.env.CHANNEL_DO.get(doId);
    await stub.fetch('http://channel/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        event: itemEvent,
        data: item.data,
        socket_id: item.socket_id,
      }),
    });
  }

  return c.json({ batch: [] });
});

app.get('/apps/:app_id/channels', async (c) => {
  const { appId } = getEnv(c.env);
  const hubId = c.env.WEBSOCKET_HUB.idFromName(appId);
  const hubStub = c.env.WEBSOCKET_HUB.get(hubId);
  const filterPrefix = c.req.query('filter_by_prefix') || '';

  const hubRes = await hubStub.fetch(`http://hub/channels?filter_by_prefix=${encodeURIComponent(filterPrefix)}`);
  const hubData: { channels: string[] } = await hubRes.json();

  const responseChannels: Record<string, { user_count?: number }> = {};

  for (const ch of hubData.channels) {
    const doId = c.env.CHANNEL_DO.idFromName(`${appId}:${ch}`);
    const stub = c.env.CHANNEL_DO.get(doId);
    const infoRes = await stub.fetch('http://channel/info');
    const info: { occupied: boolean; user_count?: number } = await infoRes.json();

    if (info.occupied) {
      responseChannels[ch] = {};
      if (ch.startsWith('presence-')) {
        responseChannels[ch].user_count = info.user_count || 0;
      }
    }
  }

  return c.json({ channels: responseChannels });
});

app.get('/apps/:app_id/channels/:channel_name', async (c) => {
  const { appId } = getEnv(c.env);
  const chName = c.req.param('channel_name');
  const doId = c.env.CHANNEL_DO.idFromName(`${appId}:${chName}`);
  const stub = c.env.CHANNEL_DO.get(doId);
  const infoRes = await stub.fetch('http://channel/info');
  const info = await infoRes.json();

  return c.json(info);
});

app.get('/apps/:app_id/channels/:channel_name/users', async (c) => {
  const { appId } = getEnv(c.env);
  const chName = c.req.param('channel_name');
  if (!chName.startsWith('presence-')) {
    return c.json({ error: 'Users query only allowed for presence channels' }, 400);
  }

  const doId = c.env.CHANNEL_DO.idFromName(`${appId}:${chName}`);
  const stub = c.env.CHANNEL_DO.get(doId);
  const usersRes = await stub.fetch('http://channel/users');
  const usersData = await usersRes.json();

  return c.json(usersData);
});

// --- 3. Server Status & Health Check ---
app.get('/health', (c) =>
  c.json({
    status: 'online',
    server: 'WebSocket Serverless',
    version: '1.0.0',
    author: 'Maximiliano Contartesi',
    protocol: 7,
    runtime: 'Cloudflare Workers & Durable Objects (Hibernation API)',
  }),
);

app.get('/api/status', (c) =>
  c.json({
    status: 'online',
    server: 'WebSocket Serverless',
    version: '1.0.0',
    author: 'Maximiliano Contartesi',
    protocol: 7,
    runtime: 'Cloudflare Workers & Durable Objects (Hibernation API)',
  }),
);

// --- 4. Admin API ---
app.post('/api/admin/login', async (c) => {
  const { adminUser, adminPass } = getEnv(c.env);
  try {
    const body: { username?: string; password?: string } = await c.req.json();
    if (body.username === adminUser && body.password === adminPass) {
      const token = await createAdminSessionToken(adminUser, adminPass);
      return c.json({
        success: true,
        token,
        user: adminUser,
        method: 'password',
      });
    }
  } catch {}
  return c.json({ success: false, error: 'Invalid username or password' }, 401);
});

app.get('/api/admin/check-auth', async (c) => {
  const { adminUser, adminPass } = getEnv(c.env);
  const authResult = await checkAdminAuth(c.req.raw, adminUser, adminPass);
  return c.json(authResult);
});

app.get('/api/admin/info', async (c) => {
  const { appId, appKey, appSecret, adminUser, adminPass } = getEnv(c.env);
  const authResult = await checkAdminAuth(c.req.raw, adminUser, adminPass);
  if (!authResult.authenticated) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  return c.json({
    appId,
    appKey,
    appSecret,
    cluster: 'cloudflare-serverless',
    authMethod: authResult.method,
    authUser: authResult.user,
  });
});

// --- 5. Fallback to Static Admin UI Assets ---
app.notFound((c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('WebSocket Serverless Engine Running', 200);
});

export default app;
