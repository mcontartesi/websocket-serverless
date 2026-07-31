import { DurableObject } from 'cloudflare:workers';
import { Env } from './ChannelDO';

export class WebsocketHub extends DurableObject<Env> {
  private activeChannels: Set<string> = new Set();

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<string[]>('active_channels');
      if (stored) {
        this.activeChannels = new Set(stored);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST' && path === '/register_channel') {
      const { channel }: { channel: string } = await request.json();
      this.activeChannels.add(channel);
      await this.ctx.storage.put('active_channels', Array.from(this.activeChannels));
      return Response.json({ success: true });
    }

    if (request.method === 'POST' && path === '/unregister_channel') {
      const { channel }: { channel: string } = await request.json();
      this.activeChannels.delete(channel);
      await this.ctx.storage.put('active_channels', Array.from(this.activeChannels));
      return Response.json({ success: true });
    }

    if (request.method === 'GET' && path === '/channels') {
      const filterPrefix = url.searchParams.get('filter_by_prefix') || '';
      let channelsList = Array.from(this.activeChannels);
      if (filterPrefix) {
        channelsList = channelsList.filter(c => c.startsWith(filterPrefix));
      }
      return Response.json({ channels: channelsList });
    }

    return new Response('Not found', { status: 404 });
  }
}
