# Architecture & Technical Design Document

Author: Maximiliano Contartesi  
License: MIT

## System Overview

WebSocket Serverless is designed to provide high-concurrency real-time WebSocket messaging using Cloudflare's serverless edge computing platform. 

Traditional WebSocket server architectures (such as Node.js Socket.io clusters or Erlang/Elixir OTP nodes) require persistent virtual machines or container instances. These instances consume CPU memory and network bandwidth continuously while maintaining idle TCP connection state.

WebSocket Serverless addresses this problem by utilizing Cloudflare Workers alongside Cloudflare Durable Objects and the WebSockets Hibernation API. This design guarantees that idle connections incur zero CPU memory consumption while preserving real-time delivery performance.

---

## Technical Architecture Breakdown

```
Incoming WebSockets Connection / HTTP REST API
                     │
                     ▼
  Cloudflare Edge Worker (Request Router)
                     │
                     ├───> HTTP REST API ───> Signature Verification (Crypto API)
                     │                              │
                     │                              ▼
                     └───> WebSocket Upgrade ───> Durable Object Routing
                                                    │
                                                    ▼
                                          ChannelDO Instance
                                                    │
                                                    ▼
                                        ctx.acceptWebSocket(ws)
                                                    │
                                                    ▼
                                      Socket Hibernates (0 Memory)
                                                    │
                                  ┌─────────────────┴─────────────────┐
                                  │ Incoming Broadcast / REST Payload │
                                  └─────────────────┬─────────────────┘
                                                    │
                                                    ▼
                                    Durable Object Wakes (Milliseconds)
                                                    │
                                                    ▼
                                        Fan-Out to Channel Sockets
```

### 1. Edge Worker Router (`src/index.ts`)

The Cloudflare Worker acts as the entry gateway for incoming traffic:

- **HTTP REST API Endpoints**: Intercepts REST requests directed to `/apps/:app_id/events`, `/apps/:app_id/batch_events`, `/apps/:app_id/channels`, and `/api/admin/*`.
- **WebSocket Upgrade Requests**: Validates path parameters (`/app/:app_key`) and proxies the HTTP Upgrade request to the target `ChannelDO` Durable Object instance.
- **Static Asset Serving**: Serves the embedded Admin Dashboard via `env.ASSETS` static asset bindings.

### 2. Durable Objects Engine (`ChannelDO.ts`)

Every Pusher channel (`app_id:channel_name`) maps to a distinct Durable Object ID generated via `env.CHANNEL_DO.idFromName(`${appId}:${channelName}`)`.

- **Isolation**: Memory and subscription state for one channel are completely isolated from other channels.
- **Global Scaling**: Cloudflare automatically instantiates Durable Objects close to user traffic or regional clusters, ensuring low latency.
- **Hibernation Mechanics**:
  - Connections are accepted using `this.ctx.acceptWebSocket(ws, tags)`.
  - Channel attachments and socket metadata (`socketId`, `presenceData`, `channels`) are saved on the WebSocket connection using `ws.serializeAttachment()`.
  - When sockets are idle, the runtime unloads the JavaScript execution state from RAM.
  - When a message arrives or a socket disconnects, the runtime invokes `webSocketMessage()` or `webSocketClose()` within milliseconds.

### 3. Application Directory (`WebsocketHub.ts`)

The `WebsocketHub` Durable Object maintains an index of currently active and occupied channels across the application. When REST queries arrive at `/apps/:app_id/channels`, the Worker queries `WebsocketHub` to return channel occupancy data.

---

## Security Model

### HMAC-SHA256 Signature Verification

Private (`private-*`) and Presence (`presence-*`) channels require signature verification to prevent unauthorized subscription:

1. **Private Channels**:
   `stringToSign = socket_id + ":" + channel_name`
   `expectedSignature = HMAC-SHA256(stringToSign, app_secret)`

2. **Presence Channels**:
   `stringToSign = socket_id + ":" + channel_name + ":" + channel_data`
   `expectedSignature = HMAC-SHA256(stringToSign, app_secret)`

Signatures are validated using the native `Web Crypto API` (`crypto.subtle`) in Cloudflare Workers.

### Cloudflare One & Access Authentication

For administrative endpoints (`/api/admin/*`), WebSocket Serverless supports Cloudflare Access headers (`Cf-Access-Jwt-Assertion` and `Cf-Access-Authenticated-User-Email`). When requests pass through Cloudflare Access policies, the engine authenticates the administrator automatically without prompting for credentials.

---

## Webhook Dispatcher

When channels transition between states (`channel_occupied` when subscriber count increases from 0 to 1, `channel_vacated` when subscriber count drops to 0, `member_added`, `member_removed`), the engine generates an HTTP POST request to configured webhook endpoints.

Webhook payloads are signed with an `X-Pusher-Signature` header calculated using HMAC-SHA256 over the request body.
