export interface AppConfig {
  appId: string;
  key: string;
  secret: string;
  webhooks?: WebhookConfig[];
}

export interface WebhookConfig {
  url: string;
  events: ('channel_occupied' | 'channel_vacated' | 'member_added' | 'member_removed' | 'client_event')[];
  secret?: string;
}

export interface PusherMessage {
  event: string;
  channel?: string;
  data?: any;
}

export interface SubscribeData {
  channel: string;
  auth?: string;
  channel_data?: string;
}

export interface PresenceUserData {
  user_id: string;
  user_info?: Record<string, any>;
}

export interface PresenceChannelState {
  ids: string[];
  hash: Record<string, Record<string, any>>;
  count: number;
}

export interface WebSocketAttachment {
  socketId: string;
  appId: string;
  channels: Set<string>;
  presenceData?: Record<string, PresenceUserData>; // channel -> presence info
}

export interface TriggerEventPayload {
  name: string;
  data: string | object;
  channels?: string[];
  channel?: string;
  socket_id?: string;
  info?: string;
}

export interface BatchTriggerPayload {
  batch: TriggerEventPayload[];
}

export interface ChannelInfo {
  occupied: boolean;
  user_count?: number;
  subscription_count?: number;
}

export interface ChannelsListResponse {
  channels: Record<string, { user_count?: number }>;
}

export interface UsersListResponse {
  users: Array<{ id: string }>;
}
