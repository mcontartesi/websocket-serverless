/**
 * Authentication and Cryptographic Signatures for Pusher Protocol v7
 * Works natively in Cloudflare Workers using Web Crypto API
 */

export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function md5Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const msgData = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('MD5', msgData);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validates private channel subscription token.
 * Auth format: "key:signature" where signature = HMAC-SHA256(socket_id + ":" + channel_name)
 */
export async function verifyPrivateChannelAuth(
  authString: string,
  appKey: string,
  appSecret: string,
  socketId: string,
  channelName: string,
): Promise<boolean> {
  if (!authString || !authString.includes(':')) return false;

  const [providedKey, providedSig] = authString.split(':');
  if (providedKey !== appKey) return false;

  const stringToSign = `${socketId}:${channelName}`;
  const expectedSig = await hmacSha256Hex(appSecret, stringToSign);

  return providedSig === expectedSig;
}

/**
 * Validates presence channel subscription token.
 * Auth format: "key:signature" where signature = HMAC-SHA256(socket_id + ":" + channel_name + ":" + channel_data)
 */
export async function verifyPresenceChannelAuth(
  authString: string,
  appKey: string,
  appSecret: string,
  socketId: string,
  channelName: string,
  channelDataStr?: string,
): Promise<boolean> {
  if (!authString || !authString.includes(':')) return false;

  const [providedKey, providedSig] = authString.split(':');
  if (providedKey !== appKey) return false;

  const stringToSign = channelDataStr ? `${socketId}:${channelName}:${channelDataStr}` : `${socketId}:${channelName}`;

  const expectedSig = await hmacSha256Hex(appSecret, stringToSign);

  return providedSig === expectedSig;
}

/**
 * Validates Pusher HTTP REST API signature.
 * Pusher REST authentication requires signing the HTTP request method, path, and sorted query parameters.
 */
export async function verifyRestApiSignature(
  method: string,
  path: string,
  queryParams: Record<string, string>,
  body: string,
  appSecret: string,
): Promise<boolean> {
  const providedSig = queryParams['auth_signature'];
  if (!providedSig) return false;

  const paramsToSign: Record<string, string> = { ...queryParams };
  delete paramsToSign['auth_signature'];

  if (body && body.trim().length > 0 && !paramsToSign['body_md5']) {
    paramsToSign['body_md5'] = await md5Hex(body);
  }

  const sortedKeys = Object.keys(paramsToSign).sort();
  const queryString = sortedKeys
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(paramsToSign[key])}`)
    .join('&');

  const stringToSign = `${method.toUpperCase()}\n${path}\n${queryString}`;
  const expectedSig = await hmacSha256Hex(appSecret, stringToSign);

  return providedSig === expectedSig;
}

/**
 * Generate a random Pusher-compatible Socket ID: e.g. "123456.789012"
 */
export function generateSocketId(): string {
  const rand1 = Math.floor(Math.random() * 900000) + 100000;
  const rand2 = Math.floor(Math.random() * 900000) + 100000;
  return `${rand1}.${rand2}`;
}

export interface AdminAuthResult {
  authenticated: boolean;
  method?: 'cloudflare_one' | 'password';
  user?: string;
}

/**
 * Validates admin session or Cloudflare One (Cloudflare Access) headers.
 */
export async function checkAdminAuth(
  request: Request,
  adminUser: string,
  adminSecret: string,
): Promise<AdminAuthResult> {
  // 1. Cloudflare One / Cloudflare Access Integration
  const cfJwt = request.headers.get('Cf-Access-Jwt-Assertion');
  const cfUserEmail = request.headers.get('Cf-Access-Authenticated-User-Email');

  if (cfJwt || cfUserEmail) {
    return {
      authenticated: true,
      method: 'cloudflare_one',
      user: cfUserEmail || 'Cloudflare One Admin',
    };
  }

  // 2. Standard Admin Token Check (Authorization header or X-Admin-Token)
  const authHeader = request.headers.get('Authorization') || request.headers.get('X-Admin-Token');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const expectedToken = await hmacSha256Hex(adminSecret, `admin-session:${adminUser}`);
    if (token === expectedToken) {
      return {
        authenticated: true,
        method: 'password',
        user: adminUser,
      };
    }
  }

  return { authenticated: false };
}

export async function createAdminSessionToken(adminUser: string, adminSecret: string): Promise<string> {
  return hmacSha256Hex(adminSecret, `admin-session:${adminUser}`);
}
