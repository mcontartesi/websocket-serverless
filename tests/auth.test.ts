import { describe, it, expect } from 'vitest';
import {
  hmacSha256Hex,
  verifyPrivateChannelAuth,
  verifyPresenceChannelAuth,
  verifyRestApiSignature,
  generateSocketId,
  checkAdminAuth,
  createAdminSessionToken
} from '../src/services/auth';

describe('Auth & Crypto Service', () => {
  const appKey = 'ws-key';
  const appSecret = 'ws-secret';
  const socketId = '12345.67890';

  it('should generate valid HMAC-SHA256 hex hashes', async () => {
    const hash = await hmacSha256Hex('secret', 'hello world');
    expect(hash).toBeTypeOf('string');
    expect(hash.length).toBe(64); // SHA-256 hex string length
  });

  it('should generate socket_id in format XXXXX.XXXXX', () => {
    const id = generateSocketId();
    expect(id).toMatch(/^\d{6}\.\d{6}$/);
  });

  it('should verify valid private channel auth signature', async () => {
    const channelName = 'private-chat';
    const stringToSign = `${socketId}:${channelName}`;
    const expectedSig = await hmacSha256Hex(appSecret, stringToSign);
    const authString = `${appKey}:${expectedSig}`;

    const isValid = await verifyPrivateChannelAuth(authString, appKey, appSecret, socketId, channelName);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPrivateChannelAuth('wrong:sig', appKey, appSecret, socketId, channelName);
    expect(isInvalid).toBe(false);
  });

  it('should verify valid presence channel auth signature', async () => {
    const channelName = 'presence-room';
    const channelData = JSON.stringify({ user_id: '123', user_info: { name: 'Max' } });
    const stringToSign = `${socketId}:${channelName}:${channelData}`;
    const expectedSig = await hmacSha256Hex(appSecret, stringToSign);
    const authString = `${appKey}:${expectedSig}`;

    const isValid = await verifyPresenceChannelAuth(
      authString,
      appKey,
      appSecret,
      socketId,
      channelName,
      channelData
    );
    expect(isValid).toBe(true);
  });

  it('should verify Pusher REST API request signature', async () => {
    const method = 'POST';
    const path = '/apps/ws-app/events';

    const queryParams: Record<string, string> = {
      auth_key: appKey,
      auth_timestamp: '1600000000',
      auth_version: '1.0'
    };

    const stringToSign = `POST\n${path}\nauth_key=${appKey}&auth_timestamp=1600000000&auth_version=1.0`;
    const sig = await hmacSha256Hex(appSecret, stringToSign);
    queryParams['auth_signature'] = sig;

    const isValid = await verifyRestApiSignature(method, path, queryParams, '', appSecret);
    expect(isValid).toBe(true);
  });

  it('should authenticate via Cloudflare One / Access headers', async () => {
    const req = new Request('http://localhost/api/admin/info', {
      headers: {
        'Cf-Access-Authenticated-User-Email': 'admin@company.com',
        'Cf-Access-Jwt-Assertion': 'mock.jwt.token'
      }
    });

    const result = await checkAdminAuth(req, 'admin', 'secret');
    expect(result.authenticated).toBe(true);
    expect(result.method).toBe('cloudflare_one');
    expect(result.user).toBe('admin@company.com');
  });

  it('should authenticate via password session token', async () => {
    const token = await createAdminSessionToken('admin', 'secret');
    const req = new Request('http://localhost/api/admin/info', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const result = await checkAdminAuth(req, 'admin', 'secret');
    expect(result.authenticated).toBe(true);
    expect(result.method).toBe('password');
    expect(result.user).toBe('admin');
  });
});
