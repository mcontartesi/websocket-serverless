# WebSocket Serverless ⚡

> **100% Serverless, Open-Source Pusher-Compatible WebSocket Server** built natively for **Cloudflare Workers** and **Durable Objects** using the WebSockets Hibernation API.

Inspired by [edgurgel/poxa](https://github.com/edgurgel/poxa) and [Pusher](https://pusher.com/). Created by **Maximiliano Contartesi**. Published under the **MIT License**.

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%26%20Durable%20Objects-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![Pusher Protocol](https://img.shields.io/badge/Pusher%20Protocol-v7%20Compatible-00B4D8?logo=pusher)](https://pusher.com/docs/channels/library_auth_reference/pusher-type-signatures/)
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mcontartesi/websocket-serverless)

---

## 🌟 Highlights & Features

- ⚡ **100% Serverless Architecture**: Zero server management, zero idle cost. Runs entirely on Cloudflare's global edge network across 300+ cities.
- 🔐 **Admin Auth & Cloudflare One Integration**: Built-in Admin authentication with username/password and native seamless support for **Cloudflare Access / Cloudflare One**.
- 💤 **Durable Objects Hibernation API**: Uses Cloudflare's WebSockets Hibernation API so connected sockets do not consume active execution memory while idle.
- 🔄 **Pusher Protocol v7 Compatible**: Drop-in replacement for Pusher Channels. Works with official client SDKs: `pusher-js`, `laravel-echo`, `pusher-python`, `pusher-http-php`, `pusher-rest-go`, `pusher-swift`, etc.
- 📢 **Full Channel Support**:
  - **Public Channels**: Open real-time pub/sub channels.
  - **Private Channels** (`private-*`): HMAC-SHA256 authenticated client channels.
  - **Presence Channels** (`presence-*`): Real-time member tracking with automatic `pusher_internal:member_added` and `pusher_internal:member_removed` event broadcasts.
  - **Client Events** (`client-*`): Peer-to-peer client-initiated event messaging.
- 🤖 **Automated CI/CD & Versioning**: Complete GitHub Actions pipelines for automated testing, semantic release (`v1.x.x`), and Cloudflare Worker deployments.
- 🛠️ **Pusher Server REST API v1**: Complete REST API implementation (`/apps/:app_id/events`, `/apps/:app_id/batch_events`, `/apps/:app_id/channels`, `/apps/:app_id/channels/:channel_name/users`).
- 🪝 **Serverless Webhooks**: Automatic background webhook delivery for `channel_occupied`, `channel_vacated`, `member_added`, and `member_removed` events.
- 🎨 **Built-in Admin Dashboard**: Beautiful glassmorphic browser console with live connection monitoring, interactive event broadcast studio, channel inspector, and code integration snippets.
- 🚀 **One-Click Deploy**: Deploy directly to your Cloudflare account in seconds.

---

## 🚀 One-Click Deployment to Cloudflare

Click the button below to deploy your own private, scalable WebSocket Serverless cluster to Cloudflare Workers:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/maxicontartesi/websocket-serverless)

### Manual Deployment via Wrangler

1. **Clone the repository**:
   ```bash
   git clone https://github.com/mcontartesi/websocket-serverless.git
   cd websocket-serverless
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Deploy to Cloudflare Workers**:
   ```bash
   npm run deploy
   ```

---

## 🤖 GitHub Actions & Semantic Release

This repository includes pre-configured GitHub Actions workflows:

- **CI Pipeline (`.github/workflows/ci.yml`)**: Automatically runs TypeScript type checks and Vitest unit/integration tests on every push & pull request.
- **Semantic Versioning (`.github/workflows/release.yml`)**: Uses `semantic-release` to generate semver versions, git tags, CHANGELOG notes, and GitHub Releases on `main` branch pushes.
- **Automatic Deployment (`.github/workflows/deploy.yml`)**: Automatically deploys new releases to Cloudflare Workers using Wrangler Action with `CLOUDFLARE_API_TOKEN`.

---

## 💻 Local Development & Testing

Start the local emulation server powered by Wrangler and Miniflare:

```bash
npm run dev
```

Open your browser at `http://localhost:8787` to access the **WebSocket Serverless Admin Console**.

Run the automated test suite (Unit & Integration tests):

```bash
npm test
```

---

## 🏗️ Architecture

```
                          ┌────────────────────────────────────────────────────────┐
                          │                Cloudflare Edge Network                 │
                          └───────────────────────────┬────────────────────────────┘
                                                      │
                            ┌─────────────────────────┴────────────────────────┐
                            │      Cloudflare Worker (Router & REST API)       │
                            └───────┬───────────────────────────────┬──────────┘
                                    │                               │
                      HTTP REST API / Auth               WebSockets Connection
                                    │                               │
                                    ▼                               ▼
                     ┌──────────────────────────┐    ┌──────────────────────────┐
                     │ WebsocketHub / Config KV │    │   ChannelDO (Durable    │
                     │  (App Key Auth & Apps)   │    │  Object with Hibernation)│
                     └──────────────────────────┘    └──────────────┬───────────┘
                                                                    │
                                                      ┌─────────────┴────────────┐
                                                      │ Public, Private, Presence│
                                                      │ Websocket Channels       │
                                                      └──────────────────────────┘
```

For in-depth architectural details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🔌 Integration Examples

### 1. JavaScript / TypeScript (`pusher-js`)

```js
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
const channel = pusher.subscribe('my-channel');

channel.bind('my-event', (data) => {
  console.log('Received event:', data);
});
```

### 2. Laravel Echo Setup

```js
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

window.Echo = new Echo({
  broadcaster: 'pusher',
  key: 'ws-key',
  cluster: 'mt1',
  wsHost: 'your-worker.workers.dev',
  wsPort: 443,
  wssPort: 443,
  forceTLS: true,
  disableStats: true,
  enabledTransports: ['ws', 'wss']
});

window.Echo.channel('orders')
  .listen('OrderPlaced', (e) => {
    console.log('New Order:', e);
  });
```

### 3. Python (`pusher`)

```python
import pusher

pusher_client = pusher.Pusher(
  app_id='ws-app',
  key='ws-key',
  secret='ws-secret',
  host='your-worker.workers.dev',
  ssl=True
)

pusher_client.trigger('my-channel', 'my-event', {'message': 'Hello from Python'})
```

### 4. cURL REST API Trigger

```bash
curl -X POST "https://your-worker.workers.dev/apps/ws-app/events" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-event",
    "channel": "my-channel",
    "data": {"message": "Hello Serverless World"}
  }'
```

---

## 📖 Feature Comparison

| Feature | Pusher Channels | Poxa (Elixir) | **WebSocket Serverless (Cloudflare)** |
|---|---|---|---|
| Infrastructure | Proprietary Cloud | Custom BEAM Server | 100% Serverless Edge |
| Idle Cost | Monthly Tier | Server Idle CPU/RAM | **$0 / Zero Idle Memory** |
| Auth / Cloudflare One | Third-party Auth | Basic Auth | **Native Cloudflare One / Access** |
| CI/CD & Versioning | Proprietary | Manual | **GitHub Actions + Semantic Release** |
| Hibernation | No | No | **Yes (DO Hibernation API)** |
| REST API v1 | Yes | Yes | **Yes** |
| Presence Tracking | Yes | Yes | **Yes** |
| Webhooks | Yes | Yes | **Yes** |
| Admin Dashboard | Web Dashboard | Basic Web UI | **Modern Glassmorphic Console** |
| Deploy | Managed Service | Docker / OTP Release | **1-Click Workers Deploy** |

See [docs/PUSHER_COMPATIBILITY.md](docs/PUSHER_COMPATIBILITY.md) for full protocol matrix.

---

## 🌐 Open Source Community & Governance

We believe in open, transparent, and collaborative software development.

- 📘 [Contributing Guide](https://github.com/mcontartesi/websocket-serverless/blob/main/CONTRIBUTING.md): Guidelines for opening issues, submitting Pull Requests, and code conventions.
- 📜 [Code of Conduct](https://github.com/mcontartesi/websocket-serverless/blob/main/CODE_OF_CONDUCT.md): Standards of conduct for participants in the WebSocket Serverless community.
- 📋 [Changelog](https://github.com/mcontartesi/websocket-serverless/blob/main/CHANGELOG.md): Version history, release notes, and breaking changes.
- 🛡️ [Security Policy](https://github.com/mcontartesi/websocket-serverless/blob/main/SECURITY.md): Guidelines for reporting security vulnerabilities responsibly.

---

## 🔗 Related Open-Source Cloudflare Projects

Check out other 100% serverless edge tools built for Cloudflare:

- 🏥 **[Health Monitor](https://github.com/mcontartesi/health-monitor)**: A 100% Serverless Edge Uptime Monitoring, Health Checks & Status Page solution built natively for Cloudflare Workers.

---

## 👤 Author & Maintainer

Created and maintained with ❤️ by [Maximiliano Contartesi](https://github.com/mcontartesi).

- 💼 **LinkedIn**: [maxiconta](https://www.linkedin.com/in/maxiconta/)
- 🐙 **GitHub**: [@mcontartesi](https://github.com/mcontartesi)

---

## 📜 License

[MIT License](LICENSE) — Copyright (c) 2026 Maximiliano Contartesi. Feel free to use, modify, and distribute in open-source and commercial projects.
