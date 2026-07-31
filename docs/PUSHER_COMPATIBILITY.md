# Pusher Protocol v7 Compatibility Matrix — WebSocket Serverless

Author: **Maximiliano Contartesi**

WebSocket Serverless implements full compatibility with the **Pusher Channels Wire Protocol version 7**.

## Supported Protocol Events

| Wire Event Name | Direction | Description | Status |
|---|---|---|---|
| `pusher:connection_established` | Server -> Client | Sends `socket_id` and `activity_timeout` | ✅ Supported |
| `pusher:ping` | Client -> Server | Heartbeat ping from client | ✅ Supported |
| `pusher:pong` | Server -> Client | Heartbeat response to ping | ✅ Supported |
| `pusher:error` | Server -> Client | Connection or auth error notification | ✅ Supported |
| `pusher:subscribe` | Client -> Server | Request to join public, private or presence channel | ✅ Supported |
| `pusher:unsubscribe` | Client -> Server | Request to leave channel | ✅ Supported |
| `pusher:subscription_succeeded` | Server -> Client | Confirms channel join & sends initial presence state | ✅ Supported |
| `pusher_internal:member_added` | Server -> Client | Broadcasts new user join in presence channel | ✅ Supported |
| `pusher_internal:member_removed` | Server -> Client | Broadcasts user departure in presence channel | ✅ Supported |
| `client-*` | Client -> Client | Peer-to-peer event broadcast | ✅ Supported |

## Supported REST API Endpoints

| Endpoint | Method | Description | Status |
|---|---|---|---|
| `/apps/:app_id/events` | `POST` | Trigger an event to one or multiple channels | ✅ Supported |
| `/apps/:app_id/batch_events` | `POST` | Trigger multiple events in a single batch request | ✅ Supported |
| `/apps/:app_id/channels` | `GET` | Fetch list of active channels & user counts | ✅ Supported |
| `/apps/:app_id/channels/:channel_name` | `GET` | Fetch occupancy details for a channel | ✅ Supported |
| `/apps/:app_id/channels/:channel_name/users` | `GET` | Fetch user list for presence channel | ✅ Supported |
