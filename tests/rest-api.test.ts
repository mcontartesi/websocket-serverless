import { describe, expect, it } from 'vitest';
import worker from '../src/index';

describe('Worker REST API & Health Check', () => {
  const env: any = {
    DEFAULT_APP_ID: 'ws-app',
    DEFAULT_APP_KEY: 'ws-key',
    DEFAULT_APP_SECRET: 'ws-secret',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'ws-admin-secret',
  };
  const ctx: any = { waitUntil: () => {} };

  it('should return health check status 200 OK', async () => {
    const req = new Request('http://localhost/health');
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);

    const body: any = await res.json();
    expect(body.status).toBe('online');
    expect(body.server).toBe('WebSocket Serverless');
    expect(body.author).toBe('Maximiliano Contartesi');
  });

  it('should authenticate admin and return info endpoint', async () => {
    // Cloudflare Access header auth
    const req = new Request('http://localhost/api/admin/info', {
      headers: {
        'Cf-Access-Authenticated-User-Email': 'admin@company.com',
      },
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);

    const body: any = await res.json();
    expect(body.appId).toBe('ws-app');
    expect(body.appKey).toBe('ws-key');
    expect(body.authMethod).toBe('cloudflare_one');
  });

  it('should reject unauthenticated request to /api/admin/info', async () => {
    const req = new Request('http://localhost/api/admin/info');
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(401);
  });

  it('should reject invalid App ID on /events endpoint', async () => {
    const req = new Request('http://localhost/apps/invalid-app/events', {
      method: 'POST',
      body: JSON.stringify({ name: 'event', channel: 'ch1', data: {} }),
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(404);
  });
});
