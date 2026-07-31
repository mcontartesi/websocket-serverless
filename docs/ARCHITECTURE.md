# Architecture & Design Document — WebSocket Serverless

Author: **Maximiliano Contartesi**  
License: **MIT**

## Overview

WebSocket Serverless is engineered from the ground up to bring open-source Pusher protocol real-time messaging into the serverless era using Cloudflare's edge network.

Unlike traditional WebSocket servers (like Poxa in Elixir or Socket.io in Node.js) that require persistent virtual machines or long-running Docker containers with constant memory allocation, WebSocket Serverless relies on **Cloudflare Durable Objects with the WebSockets Hibernation API**.

---

## Technical Deep Dive: Durable Objects Hibernation

```
Incoming Client WebSocket Request
             │
             ▼
Cloudflare Edge Worker (Router)
             │
             ▼
  Durable Object (ChannelDO)
             │
 ┌───────────┴───────────┐
 │ Accept WebSocket      │
 │ (ctx.acceptWebSocket) │
 └───────────┬───────────┘
             │
             ▼
    WebSocket Hibernates 💤
(No CPU / RAM charged while idle)
             │
 ┌───────────┴───────────┐
 │ Event message arrives │
 └───────────┬───────────┘
             │
             ▼
  Wakes DO Instantly ⚡
  (webSocketMessage/Close)
```

1. **State Isolation**: Each Pusher channel (`app_id:channel_name`) maps to a unique Durable Object instance created via `env.CHANNEL_DO.idFromName()`.
2. **Hibernation Memory Model**: Sockets are accepted via `ctx.acceptWebSocket(server, tags)`. State (such as `socket_id` and subscribed channels) is stored using `ws.serializeAttachment()`. When no frames are actively transmitting, the underlying Durable Object enters hibernation state.
3. **Instant Wakeup**: When an incoming REST payload or client frame arrives, Cloudflare automatically resumes execution of the specific Durable Object within milliseconds.

---

## Authentication & Security

- **Admin Console & Cloudflare One**: Protected via Admin credentials or native **Cloudflare Access / Cloudflare One** headers (`Cf-Access-Jwt-Assertion` and `Cf-Access-Authenticated-User-Email`).
- **Private Channels (`private-*`)**: Sockets attempting to subscribe must present a signature computed as:
  `HMAC-SHA256(socket_id + ":" + channel_name, app_secret)`
- **Presence Channels (`presence-*`)**: Sockets present a signature computed as:
  `HMAC-SHA256(socket_id + ":" + channel_name + ":" + channel_data, app_secret)`
- **REST API Authentication**: All REST requests verify signatures against `auth_key`, `auth_timestamp`, `auth_version`, and optional `body_md5`.

---

## Webhooks Engine

When channels transition between occupied state (`0 -> 1` subscriber) and vacated state (`1 -> 0` subscribers), or when members join/leave presence channels, WebSocket Serverless automatically dispatches asynchronous HTTP POST webhooks signed with `X-Pusher-Signature` headers.
