# Pusher Protocol v7 Compatibility Reference

Author: Maximiliano Contartesi  
License: MIT

WebSocket Serverless implements full compatibility with the **Pusher Channels Wire Protocol version 7**.

---

## Wire Protocol Events Matrix

| Wire Event Name | Direction | Payload Structure | Description | Status |
|---|---|---|---|---|
| `pusher:connection_established` | Server -> Client | `{"event":"pusher:connection_established","data":"{\"socket_id\":\"...\",\"activity_timeout\":120}"}` | Sent immediately after WebSocket handshake | Supported |
| `pusher:ping` | Client -> Server | `{"event":"pusher:ping","data":{}}` | Connection heartbeat ping | Supported |
| `pusher:pong` | Server -> Client | `{"event":"pusher:pong","data":{}}` | Heartbeat response from server | Supported |
| `pusher:error` | Server -> Client | `{"event":"pusher:error","data":{"code":4009,"message":"..."}}` | Error notification | Supported |
| `pusher:subscribe` | Client -> Server | `{"event":"pusher:subscribe","data":{"channel":"...","auth":"...","channel_data":"..."}}` | Channel subscription request | Supported |
| `pusher:unsubscribe` | Client -> Server | `{"event":"pusher:unsubscribe","data":{"channel":"..."}}` | Channel unsubscription request | Supported |
| `pusher:subscription_succeeded` | Server -> Client | `{"event":"pusher:subscription_succeeded","channel":"...","data":"{...}"}` | Confirms subscription & returns presence hash | Supported |
| `pusher_internal:member_added` | Server -> Client | `{"event":"pusher_internal:member_added","channel":"...","data":"{\"user_id\":\"...\"}"}` | Broadcasts new occupant in presence channel | Supported |
| `pusher_internal:member_removed` | Server -> Client | `{"event":"pusher_internal:member_removed","channel":"...","data":"{\"user_id\":\"...\"}"}` | Broadcasts member departure in presence channel | Supported |
| `client-*` | Client -> Client | `{"event":"client-event-name","channel":"...","data":{...}}` | Peer-to-peer event messaging | Supported |

---

## HTTP REST API v1 Specification

### 1. Trigger Event
- **Endpoint**: `POST /apps/:app_id/events`
- **Headers**: `Content-Type: application/json`
- **Query Parameters**: `auth_key`, `auth_timestamp`, `auth_version`, `auth_signature`, `body_md5` (optional for authenticated REST calls).
- **Request Body**:
  ```json
  {
    "name": "order:created",
    "channel": "orders",
    "data": { "id": 1024, "amount": 99.50 }
  }
  ```

### 2. Trigger Batch Events
- **Endpoint**: `POST /apps/:app_id/batch_events`
- **Request Body**:
  ```json
  {
    "batch": [
      { "name": "order:created", "channel": "orders", "data": { "id": 101 } },
      { "name": "user:registered", "channel": "users", "data": { "id": 202 } }
    ]
  }
  ```

### 3. List Occupied Channels
- **Endpoint**: `GET /apps/:app_id/channels`
- **Query Parameters**: `filter_by_prefix` (optional filter, e.g. `presence-`)
- **Response**:
  ```json
  {
    "channels": {
      "presence-room-1": { "user_count": 3 },
      "orders": {}
    }
  }
  ```

### 4. Fetch Channel Information
- **Endpoint**: `GET /apps/:app_id/channels/:channel_name`
- **Response**:
  ```json
  {
    "occupied": true,
    "subscription_count": 5,
    "user_count": 3
  }
  ```

### 5. List Presence Users
- **Endpoint**: `GET /apps/:app_id/channels/:channel_name/users`
- **Response**:
  ```json
  {
    "users": [
      { "id": "user-100" },
      { "id": "user-101" }
    ]
  }
  ```
