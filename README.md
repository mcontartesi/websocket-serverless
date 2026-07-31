# WebSocket Serverless

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%26%20Durable%20Objects-orange?logo=cloudflare)](https://workers.cloudflare.com/)
[![Pusher Protocol](https://img.shields.io/badge/Pusher%20Protocol-v7%20Compatible-blue?logo=pusher)](https://pusher.com/docs/channels/library_auth_reference/pusher-type-signatures/)
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mcontartesi/websocket-serverless)

WebSocket Serverless is a fully open-source, serverless real-time messaging server compatible with the Pusher Protocol v7. Built natively for Cloudflare Workers and Cloudflare Durable Objects, it utilizes Cloudflare's WebSockets Hibernation API to deliver high-concurrency real-time channels with zero idle infrastructure costs.

Designed as a modern serverless successor to self-hosted servers like Poxa (Elixir) and standard Pusher Channels, this project allows teams to run private, scalable real-time infrastructure directly on Cloudflare's global edge network.

---

## Table of Contents

- [Key Technical Features](#key-technical-features)
- [One-Click Deployment](#one-click-deployment)
- [Manual Installation & Local Development](#manual-installation--local-development)
- [Architecture & Execution Model](#architecture--execution-model)
- [Client Integration Guides](#client-integration-guides)
  - [JavaScript / TypeScript (Pusher JS)](#1-javascript--typescript-pusher-js)
  - [Laravel Echo (PHP / Laravel)](#2-laravel-echo-php--laravel)
  - [Python Client](#3-python-client)
  - [HTTP REST API Event Trigger](#4-http-rest-api-event-trigger)
- [Authentication & Access Control](#authentication--access-control)
  - [Private & Presence Channel Signatures](#private--presence-channel-signatures)
  - [Admin Console & Cloudflare One Integration](#admin-console--cloudflare-one-integration)
- [REST API Specification](#rest-api-specification)
- [Configuration Reference](#configuration-reference)
- [CI/CD & Automated Versioning](#cicd--automated-versioning)
- [Feature Matrix](#feature-matrix)
- [Community & Governance](#community--governance)
- [Related Projects](#related-projects)
- [Author & License](#author--license)

---

## Key Technical Features

- **Pusher Protocol v7 Wire Standard**: Drop-in backend replacement for Pusher client SDKs across Web, Mobile (Swift/Android), and Backend runtimes.
- **WebSockets Hibernation API**: Leverages Cloudflare Durable Objects hibernation to handle thousands of open TCP/WebSocket connections without incurring ongoing CPU memory charges while sockets are idle.
- **Channel Routing**:
  - **Public Channels**: Unauthenticated broadcast channels.
  - **Private Channels (`private-*`)**: HMAC-SHA256 authenticated channels for protected messaging.
  - **Presence Channels (`presence-*`)**: User tracking with automatic `pusher_internal:member_added` and `pusher_internal:member_removed` event fan-out.
  - **Client Events (`client-*`)**: Direct client-to-client event publishing.
- **Pusher REST API v1**: Complete implementation of publishing endpoints (`/apps/:app_id/events`, `/apps/:app_id/batch_events`, `/apps/:app_id/channels`, `/apps/:app_id/channels/:channel_name/users`).
- **Serverless Webhooks Engine**: Dispatches background HTTP POST payloads for channel occupancy (`channel_occupied`, `channel_vacated`) and presence state transitions.
- **Integrated Admin Dashboard**: Self-hosted glassmorphic web dashboard containing real-time channel metrics, interactive REST event studio, live socket debugging inspector, and code generation tools.
- **Cloudflare One / Cloudflare Access Integration**: Supports zero-trust authentication using `Cf-Access-Jwt-Assertion` headers alongside traditional password authentication.

---

## One-Click Deployment

Deploy directly to your Cloudflare account using the Cloudflare Workers Deploy button:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mcontartesi/websocket-serverless)

---

## Manual Installation & Local Development

### Prerequisites

- Node.js version 18.x or later (LTS recommended)
- Cloudflare Wrangler CLI (`npm install -g wrangler`)
- A Cloudflare account with Durable Objects enabled (Workers Paid plan required for production deployment)

### Setup Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/mcontartesi/websocket-serverless.git
   cd websocket-serverless
   ```

2. Install project dependencies:
   ```bash
   npm install
   ```

3. Start local emulation server:
   ```bash
   npm run dev
   ```
   The local development server will start at `http://localhost:8787`, serving both the HTTP REST API endpoints and the static Admin Dashboard.

4. Execute automated test suite:
   ```bash
   npm test
   ```

5. Deploy to Cloudflare Workers:
   ```bash
   npm run deploy
   ```

---

## Architecture & Execution Model

```
                                  +---------------------------------------+
                                  |     Cloudflare Global Edge Network    |
                                  +-------------------+-------------------+
                                                      |
                                                      v
                                  +-------------------+-------------------+
                                  |     Cloudflare Worker Router          |
                                  |  (HTTP REST API & WS Upgrade Path)    |
                                  +---------+-------------------+---------+
                                            |                   |
                           HTTP REST API / Auth           WebSocket Upgrade
                                            |                   |
                                            v                   v
                             +--------------+---+   +-----------+--------------+
                             |   WebsocketHub   |   |   ChannelDO (Durable     |
                             | Channel Registry |   |  Object + Hibernation)   |
                             +------------------+   +-----------+--------------+
                                                                |
                                                    +-----------+--------------+
                                                    |  Subscribed Sockets      |
                                                    | (Public/Private/Presence)|
                                                    +--------------------------+
```

1. **Worker Router Layer**: Evaluates incoming HTTP requests. REST API calls are authenticated and routed directly to the appropriate Durable Object instance.
2. **Channel Durable Object (`ChannelDO`)**: Each Pusher channel (`app_id:channel_name`) maps to a specific Durable Object instance. Sockets are registered using `ctx.acceptWebSocket()`.
3. **Hibernation Model**: When no active frames are being transmitted, Cloudflare hibernates the Durable Object instance. Sockets remain connected at the edge, incurring zero CPU cost until an event payload arrives or a frame is sent.

For detailed architectural analysis, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Client Integration Guides

### 1. JavaScript / TypeScript (Pusher JS)

Install official `pusher-js` package:

```bash
npm install pusher-js
```

Initialize connection pointing to your deployed Worker domain:

```javascript
import Pusher from 'pusher-js';

const pusher = new Pusher('ws-key', {
  cluster: 'mt1',
  wsHost: 'your-worker.workers.dev',
  wsPort: 443,
  wssPort: 443,
  forceTLS: true,
  disableStats: true,
  enabledTransports: ['ws', 'wss']
});

// Subscribe to a public channel
const channel = pusher.subscribe('orders-channel');

channel.bind('order:created', (data) => {
  console.log('New Order Received:', data);
});
```

### 2. Laravel Echo (PHP / Laravel)

Configure Laravel Echo in `resources/js/bootstrap.js`:

```javascript
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

window.Echo = new Echo({
    broadcaster: 'pusher',
    key: process.env.MIX_PUSHER_APP_KEY || 'ws-key',
    cluster: 'mt1',
    wsHost: process.env.MIX_PUSHER_HOST || 'your-worker.workers.dev',
    wsPort: 443,
    wssPort: 443,
    forceTLS: true,
    disableStats: true,
    enabledTransports: ['ws', 'wss']
});

window.Echo.channel('orders')
    .listen('OrderPlaced', (event) => {
        console.log('Order status updated:', event);
    });
```

### 3. Python Client

Using official `pusher` Python SDK:

```python
import pusher

pusher_client = pusher.Pusher(
    app_id='ws-app',
    key='ws-key',
    secret='ws-secret',
    host='your-worker.workers.dev',
    ssl=True
)

pusher_client.trigger('chat-room', 'message:created', {
    'user': 'Maximiliano',
    'text': 'Serverless real-time messaging configured successfully'
})
```

### 4. HTTP REST API Event Trigger

Publish events via cURL without requiring client SDKs:

```bash
curl -X POST "https://your-worker.workers.dev/apps/ws-app/events" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "notification:send",
    "channel": "user-100",
    "data": {"title": "System Alert", "body": "Maintenance completed"}
  }'
```

---

## Authentication & Access Control

### Private & Presence Channel Signatures

For channels prefixed with `private-` or `presence-`, client subscriptions require valid HMAC-SHA256 signatures generated using your application secret.

- **Private Channel Signature**: `HMAC-SHA256(socket_id + ":" + channel_name, app_secret)`
- **Presence Channel Signature**: `HMAC-SHA256(socket_id + ":" + channel_name + ":" + channel_data, app_secret)`

### Admin Console & Cloudflare One Integration

The built-in Admin Dashboard (`/`) supports two authentication mechanisms:

1. **Password Authentication**: Username (`ADMIN_USERNAME`) and password (`ADMIN_PASSWORD`) authentication configured via environment variables.
2. **Cloudflare One / Cloudflare Access**: Sockets and HTTP requests protected behind Cloudflare Access headers (`Cf-Access-Jwt-Assertion` or `Cf-Access-Authenticated-User-Email`) authenticate automatically without manual password entry.

---

## REST API Specification

| Endpoint | Method | Body Payload / Description |
|---|---|---|
| `/apps/:app_id/events` | `POST` | `{"name": "string", "channel": "string", "data": any}` — Broadcasts event to target channel |
| `/apps/:app_id/batch_events` | `POST` | `{"batch": [{"name": "string", "channel": "string", "data": any}]}` — Batch event trigger |
| `/apps/:app_id/channels` | `GET` | Returns list of occupied channels and member metrics |
| `/apps/:app_id/channels/:channel_name` | `GET` | Returns occupancy metrics for target channel |
| `/apps/:app_id/channels/:channel_name/users` | `GET` | Returns subscriber list for presence channel |
| `/health` | `GET` | Returns server health status and runtime operational metadata |

For detailed wire protocol specs, see [docs/PUSHER_COMPATIBILITY.md](docs/PUSHER_COMPATIBILITY.md).

---

## Configuration Reference

Configuration parameters are declared in `wrangler.jsonc` or environment secrets:

| Variable | Type | Default Value | Description |
|---|---|---|---|
| `DEFAULT_APP_ID` | String | `ws-app` | Primary Pusher Application ID |
| `DEFAULT_APP_KEY` | String | `ws-key` | Public client application key |
| `DEFAULT_APP_SECRET` | String | `ws-secret` | Private HMAC signing secret |
| `ADMIN_USERNAME` | String | `admin` | Admin Console login username |
| `ADMIN_PASSWORD` | String | `ws-admin-secret` | Admin Console login password |

---

## CI/CD & Automated Versioning

The project incorporates three automated GitHub Actions workflows:

- **CI Pipeline (`.github/workflows/ci.yml`)**: Executes TypeScript type checks (`npx tsc --noEmit`) and Vitest test suite on all pushes and pull requests.
- **Automated Versioning (`.github/workflows/release.yml`)**: Uses `semantic-release` to generate semver releases, tags, changelog updates, and GitHub Release entries.
- **Deployment Pipeline (`.github/workflows/deploy.yml`)**: Deploys application updates to Cloudflare Workers using Wrangler Action upon publishing a release.

---

## Feature Matrix

| Feature | Pusher Channels | Poxa (Elixir) | **WebSocket Serverless** |
|---|---|---|---|
| Runtime Infrastructure | Proprietary Cloud | Self-hosted BEAM | **Cloudflare Edge Network** |
| Idle Resource Cost | Monthly Flat Rate | VM CPU/RAM Allocation | **$0 / Zero Idle RAM** |
| Hibernation Engine | No | No | **Yes (DO Hibernation)** |
| Protocol Version | v7 Wire Format | v7 Wire Format | **v7 Wire Format** |
| Zero-Trust Auth | Third-party | Basic Auth | **Native Cloudflare One** |
| CI/CD Pipeline | Proprietary | Manual | **GitHub Actions + SemVer** |

---

## Community & Governance

- [Contributing Guide](CONTRIBUTING.md): Code standards, PR workflow, and commit guidelines.
- [Code of Conduct](CODE_OF_CONDUCT.md): Code of Conduct for contributors.
- [Changelog](CHANGELOG.md): Historical version releases and patch notes.
- [Security Policy](SECURITY.md): Vulnerability reporting procedures.

---

## Related Projects

- [Health Monitor](https://github.com/mcontartesi/health-monitor): 100% Serverless Edge Uptime Monitoring & Status Page solution built for Cloudflare Workers.

---

## Author & License

Created and maintained by **[Maximiliano Contartesi](https://github.com/mcontartesi)**.

- **LinkedIn**: [maxiconta](https://www.linkedin.com/in/maxiconta/)
- **GitHub**: [@mcontartesi](https://github.com/mcontartesi)

Licensed under the **[MIT License](LICENSE)**. Copyright (c) 2026 Maximiliano Contartesi.
