import WebSocket from 'ws';
import type { Express, Request } from 'express';
import { randomUUID } from 'node:crypto';
import { initialTwitchAudienceState, type TwitchAudienceDisplay, type TwitchAudienceQuestion, type TwitchAudienceState } from '../shared/twitch-audience';

interface Socket {
  on(event: 'message' | 'close' | 'error', listener: (...args: any[]) => void): unknown;
  close(): void;
}
interface Credentials { clientId: string; accessToken: string; broadcasterId: string }
interface TwitchDependencies { fetch?: typeof fetch; socket?: (url: string) => Socket; now?: () => number }
const text = (v: unknown, max = 200): string => typeof v === 'string' ? v.slice(0, max) : '';
const count = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
const iso = (v: unknown): string | undefined => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : undefined;
const obj = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v : {};

export function twitchQuestion(value: unknown, kind: 'poll' | 'prediction', eventType?: string): TwitchAudienceQuestion | undefined {
  const q = obj(value), values = kind === 'poll' ? q.choices : q.outcomes;
  if (!text(q.id) || !text(q.title) || !Array.isArray(values)) return;
  const startedAt = iso(q.started_at ?? q.created_at);
  const seconds = count(q.duration ?? q.prediction_window);
  const endsAt = iso(q.ends_at ?? q.locks_at) ?? (startedAt && seconds ? new Date(Date.parse(startedAt) + seconds * 1000).toISOString() : undefined);
  const status = text(q.status).toUpperCase() || (eventType?.endsWith('.end') ? 'COMPLETED' : eventType?.endsWith('.lock') ? 'LOCKED' : 'ACTIVE');
  return { id: text(q.id), title: text(q.title, 140), status, startedAt, endsAt, winningChoiceId: text(q.winning_outcome_id) || undefined,
    choices: values.slice(0, 10).map((v: unknown) => { const c = obj(v); return { id: text(c.id), title: text(c.title, 80), votes: count(kind === 'poll' ? c.total_votes ?? c.votes : c.users), ...(kind === 'prediction' ? { points: count(c.channel_points) } : {}) }; }) };
}

/** Read-only Twitch integration. OAuth secrets remain in memory and are never part of public snapshots. */
export class TwitchAudienceService {
  private state = initialTwitchAudienceState();
  private credentials?: Credentials;
  private socket?: Socket;
  private pendingSocket?: Socket;
  private keepalive?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private validationTimer?: ReturnType<typeof setInterval>;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private voters = new Set<string>();
  private messages = new Set<string>();
  private epoch = 0;
  private retry = 0;
  private fetcher: typeof fetch;
  private socketFactory: (url: string) => Socket;
  private now: () => number;
  constructor(dependencies: TwitchDependencies = {}) {
    this.fetcher = dependencies.fetch ?? fetch;
    this.socketFactory = dependencies.socket ?? (url => new WebSocket(url, { maxPayload: 512 * 1024 }));
    this.now = dependencies.now ?? Date.now;
  }
  snapshot(): TwitchAudienceState {
    if (this.state.chatVote?.status === 'ACTIVE' && Date.parse(this.state.chatVote.endsAt!) <= this.now()) this.state.chatVote.status = 'COMPLETED';
    return structuredClone(this.state);
  }
  private touch() { this.state.updatedAt = new Date(this.now()).toISOString(); }
  disconnect() {
    this.epoch++; this.credentials = undefined;
    clearTimeout(this.keepalive); clearTimeout(this.reconnectTimer); clearTimeout(this.expiryTimer); clearInterval(this.validationTimer);
    const current = this.socket, pending = this.pendingSocket; this.socket = undefined; this.pendingSocket = undefined;
    current?.close(); pending?.close(); this.messages.clear(); this.voters.clear();
    this.state = initialTwitchAudienceState(); return this.snapshot();
  }
  private fail(detail: string) { this.disconnect(); this.state.status = 'error'; this.state.detail = detail; this.touch(); }
  private async request(path: string, init: RequestInit = {}): Promise<any> {
    const credentials = this.credentials; if (!credentials) throw new Error('请先连接 Twitch');
    const response = await this.fetcher(`https://api.twitch.tv/helix/${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Client-Id': credentials.clientId, Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' } });
    if (!response.ok) {
      if (response.status === 401) { if (this.credentials === credentials) this.fail('Twitch 授权已失效，请重新输入有效令牌'); throw new Error('Twitch 授权已失效'); }
      throw new Error(response.status === 403 ? 'Twitch 当前账户或权限无法读取此功能' : response.status === 429 ? 'Twitch 请求频率已达限制，请稍后刷新' : `Twitch 接口返回 ${response.status}`);
    }
    return response.json();
  }
  private async validate(): Promise<any> {
    const credentials = this.credentials; if (!credentials) throw new Error('请先连接 Twitch');
    const response = await this.fetcher('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${credentials.accessToken}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Twitch 令牌验证失败，请检查授权');
    const data = obj(await response.json());
    if (data.client_id !== credentials.clientId || !/^\d+$/.test(text(data.user_id)) || !Array.isArray(data.scopes)) throw new Error('Client ID 与用户令牌不匹配');
    if (credentials.broadcasterId && data.user_id !== credentials.broadcasterId) throw new Error('请使用目标频道主播本人的用户令牌');
    if (count(data.expires_in) <= 0) throw new Error('Twitch 令牌已到期');
    return data;
  }
  async connect(input: unknown) {
    const value = obj(input), clientId = text(value.clientId, 128).trim(), accessToken = text(value.accessToken, 4096).trim().replace(/^oauth:/i, ''), broadcasterId = text(value.broadcasterId, 30).trim();
    if (!/^[a-zA-Z0-9]{5,128}$/.test(clientId) || !/^[a-zA-Z0-9_-]{10,4096}$/.test(accessToken) || broadcasterId && !/^\d+$/.test(broadcasterId)) throw new Error('请填写有效的 Client ID、用户令牌和频道用户 ID');
    this.disconnect(); const epoch = this.epoch;
    this.credentials = { clientId, accessToken, broadcasterId }; this.state.status = 'connecting'; this.state.detail = '正在验证 Twitch 授权';
    try {
      const identity = await this.validate(); if (epoch !== this.epoch) return this.snapshot();
      this.credentials.broadcasterId = identity.user_id;
      const scopes: string[] = identity.scopes;
      this.state.capabilities = { polls: scopes.some(s => ['channel:read:polls', 'channel:manage:polls'].includes(s)), predictions: scopes.some(s => ['channel:read:predictions', 'channel:manage:predictions'].includes(s)), chat: scopes.includes('user:read:chat') };
      if (!Object.values(this.state.capabilities).some(Boolean)) throw new Error('令牌需要 channel:read:polls、channel:read:predictions 或 user:read:chat 中至少一项权限');
      this.state.channel = { id: identity.user_id, login: text(identity.login) };
      this.state.detail = '已验证授权，正在连接 EventSub'; this.touch();
      this.expiryTimer = setTimeout(() => this.fail('Twitch 令牌已到期，请重新连接'), Math.min(count(identity.expires_in) * 1000, 2147483647)); this.expiryTimer.unref?.();
      this.validationTimer = setInterval(() => void this.validate().catch(() => { if (epoch === this.epoch) this.fail('Twitch 授权验证失败，连接已结束'); }), 55 * 60 * 1000); this.validationTimer.unref?.();
      await this.refresh(); if (epoch !== this.epoch) return this.snapshot();
      this.openSocket('wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30', false);
      return this.snapshot();
    } catch (error) { if (epoch === this.epoch) this.fail(error instanceof Error && !/fetch|network/i.test(error.message) ? error.message : 'Twitch 网络连接失败'); throw new Error(this.state.detail); }
  }
  async refresh() {
    if (!this.credentials) throw new Error('请先连接 Twitch');
    const epoch = this.epoch, id = this.credentials.broadcasterId;
    const requests = (['poll', 'prediction'] as const).filter(kind => this.state.capabilities[kind === 'poll' ? 'polls' : 'predictions']).map(async kind => {
      try { const data = await this.request(`${kind === 'poll' ? 'polls' : 'predictions'}?broadcaster_id=${encodeURIComponent(id)}&first=1`); return { kind, value: twitchQuestion(data.data?.[0], kind) }; }
      catch (error) { return { kind, error: error instanceof Error ? error.message : '读取 Twitch 数据失败' }; }
    });
    const result = await Promise.all(requests); if (epoch !== this.epoch) return this.snapshot();
    this.state.warnings = result.flatMap(r => 'error' in r && r.error ? [r.error] : []);
    for (const r of result) if ('value' in r) this.state[r.kind] = r.value;
    this.touch(); return this.snapshot();
  }
  private openSocket(url: string, migrating: boolean) {
    if (!this.credentials) return;
    let parsed: URL; try { parsed = new URL(url); } catch { this.fail('Twitch 重连地址无效'); return; }
    if (parsed.protocol !== 'wss:' || parsed.hostname !== 'eventsub.wss.twitch.tv' || parsed.port || parsed.username || parsed.password) { this.fail('Twitch 重连地址无效'); return; }
    const epoch = this.epoch, ws = this.socketFactory(url);
    if (migrating) { this.pendingSocket?.close(); this.pendingSocket = ws; } else this.socket = ws;
    let timeoutSeconds = 30, welcomed = false;
    const welcomeTimer = setTimeout(() => ws.close(), 15000); welcomeTimer.unref?.();
    const heartbeat = () => {
      if (ws !== this.socket) return;
      clearTimeout(this.keepalive);
      this.keepalive = setTimeout(() => ws.close(), (welcomed ? timeoutSeconds + 5 : 15) * 1000); this.keepalive.unref?.();
    };
    heartbeat();
    ws.on('message', (raw: unknown) => {
      if (epoch !== this.epoch || ws !== this.socket && ws !== this.pendingSocket) return;
      let message: any; try { message = JSON.parse(String(raw)); } catch { return; }
      const type = message.metadata?.message_type, session = message.payload?.session;
      if (type === 'session_welcome') {
        if (welcomed || !text(session?.id)) return;
        clearTimeout(welcomeTimer);
        welcomed = true; timeoutSeconds = Math.max(10, Math.min(600, count(session.keepalive_timeout_seconds) || 30));
        if (migrating) { const old = this.socket; this.socket = ws; this.pendingSocket = undefined; old?.close(); }
        heartbeat();
        void (migrating ? Promise.resolve() : this.subscribe(text(session.id))).then(() => {
          if (epoch === this.epoch && ws === this.socket) { this.retry = 0; this.state.status = 'connected'; this.state.detail = 'Twitch 事件订阅已连接'; this.touch(); }
        }).catch(() => { if (epoch === this.epoch && ws === this.socket) this.fail('Twitch 事件订阅失败，请检查频道及读取权限'); });
      } else if (type === 'session_reconnect' && typeof session?.reconnect_url === 'string' && ws === this.socket) {
        this.openSocket(session.reconnect_url, true);
      } else if (type === 'revocation') { this.fail('Twitch 撤销了事件订阅，请检查账户授权'); }
      else { heartbeat(); if (type === 'notification') this.notification(message); }
    });
    ws.on('close', () => {
      clearTimeout(welcomeTimer);
      if (epoch !== this.epoch) return;
      if (ws === this.pendingSocket) { this.pendingSocket = undefined; if (!this.socket && this.credentials) this.openSocket('wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30', false); return; }
      if (ws !== this.socket) return;
      this.socket = undefined; clearTimeout(this.keepalive);
      if (this.pendingSocket || !this.credentials) return;
      this.state.status = 'connecting'; this.state.detail = 'Twitch 连接中断，正在重连'; this.touch();
      this.reconnectTimer = setTimeout(() => this.openSocket('wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30', false), Math.min(30000, 1000 * 2 ** Math.min(this.retry++, 5))); this.reconnectTimer.unref?.();
    });
    ws.on('error', () => { if (epoch === this.epoch && ws === this.socket) { this.state.detail = 'Twitch 网络连接异常，等待重连'; ws.close(); } });
  }
  private async subscribe(sessionId: string) {
    const id = this.credentials?.broadcasterId; if (!id) return;
    const types: string[] = [];
    if (this.state.capabilities.polls) types.push('channel.poll.begin', 'channel.poll.progress', 'channel.poll.end');
    if (this.state.capabilities.predictions) types.push('channel.prediction.begin', 'channel.prediction.progress', 'channel.prediction.lock', 'channel.prediction.end');
    if (this.state.capabilities.chat) types.push('channel.chat.message');
    await Promise.all(types.map(type => this.request('eventsub/subscriptions', { method: 'POST', body: JSON.stringify({ type, version: '1', condition: { broadcaster_user_id: id, ...(type === 'channel.chat.message' ? { user_id: id } : {}) }, transport: { method: 'websocket', session_id: sessionId } }) })));
  }
  private notification(message: any) {
    const event = obj(message.payload?.event), type = text(message.payload?.subscription?.type), id = text(message.metadata?.message_id);
    if (event.broadcaster_user_id !== this.state.channel?.id || !id || this.messages.has(id)) return;
    this.messages.add(id); if (this.messages.size > 2000) this.messages.delete(this.messages.values().next().value!);
    if (type.startsWith('channel.poll.')) this.state.poll = twitchQuestion(event, 'poll', type);
    if (type.startsWith('channel.prediction.')) this.state.prediction = twitchQuestion(event, 'prediction', type);
    if (type === 'channel.chat.message') {
      const vote = this.snapshot().chatVote, user = text(event.chatter_user_id), raw = text(event.message?.text).trim().toLocaleLowerCase();
      if (!vote || vote.status !== 'ACTIVE' || !user || this.voters.has(user)) return;
      const sent = Date.parse(text(message.metadata?.message_timestamp)); if (!Number.isFinite(sent) || sent < Date.parse(vote.startedAt!)) return;
      const choice = /^[1-8]$/.test(raw) ? vote.choices[Number(raw) - 1] : vote.choices.find(c => raw === c.title.toLocaleLowerCase());
      if (!choice) return;
      this.voters.add(user); const stored = this.state.chatVote!.choices.find(c => c.id === choice.id)!;
      stored.votes++; this.state.chatVote!.totalVoters++; this.touch();
    }
    this.touch();
  }
  display(value: unknown) {
    if (!['hidden', 'poll', 'prediction', 'chat-vote'].includes(String(value))) throw new Error('请选择有效的观众互动图形');
    this.state.display = value as TwitchAudienceDisplay; this.touch(); return this.snapshot();
  }
  startVote(input: unknown) {
    if (this.state.status !== 'connected' || !this.state.capabilities.chat) throw new Error('聊天投票需要连接具有 user:read:chat 权限的 Twitch 频道');
    const data = obj(input), title = text(data.title, 140).trim();
    const options = Array.isArray(data.options) ? data.options.map((v: unknown) => text(v, 60).trim()) : [];
    const seconds = data.durationSeconds;
    if (!title || options.length < 2 || options.length > 8 || options.some((o: string) => !o) || new Set(options.map((o: string) => o.toLocaleLowerCase())).size !== options.length || !Number.isInteger(seconds) || seconds < 10 || seconds > 3600) throw new Error('填写题目、2—8 个不同选项及 10—3600 秒投票时长');
    this.voters.clear();
    this.state.chatVote = { id: randomUUID(), title, status: 'ACTIVE', startedAt: new Date(this.now()).toISOString(), endsAt: new Date(this.now() + seconds * 1000).toISOString(), totalVoters: 0,
      choices: options.map((title: string, index: number) => ({ id: String(index + 1), title, votes: 0 })) };
    this.touch(); return this.snapshot();
  }
  endVote() { if (this.state.chatVote) this.state.chatVote.status = 'COMPLETED'; this.touch(); return this.snapshot(); }
}

export function mountTwitchAudienceRoutes(app: Express, options: { authorize: (req: Request) => void; service?: TwitchAudienceService }) {
  const service = options.service ?? new TwitchAudienceService();
  let queue: Promise<unknown> = Promise.resolve();
  app.get('/api/twitch-audience', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(service.snapshot()); });
  app.post('/api/twitch-audience', (req, res, next) => {
    try { options.authorize(req); } catch (error) { next(error); return; }
    queue = queue.catch(() => {}).then(async () => {
      try {
        const data = obj(req.body); let result: TwitchAudienceState;
        switch (data.op) {
          case 'connect': result = await service.connect(data); break;
          case 'disconnect': result = service.disconnect(); break;
          case 'refresh': result = await service.refresh(); break;
          case 'display': result = service.display(data.display); break;
          case 'start-vote': result = service.startVote(data); break;
          case 'end-vote': result = service.endVote(); break;
          default: throw new Error('未知的 Twitch 互动操作');
        }
        res.setHeader('Cache-Control', 'no-store'); res.json(result);
      } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Twitch 互动操作失败' }); }
    });
  });
  return service;
}
