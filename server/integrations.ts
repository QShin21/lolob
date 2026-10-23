import type { Express, Request, Response } from 'express';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { BroadcastState } from '../shared/types';
import { integrationEvents, type DataFeed, type IntegrationConfig, type IntegrationDelivery, type IntegrationEvent, type IntegrationStatus, type WebhookConfig } from '../shared/integrations';
import { productionKey, programState } from '../shared/production';
import { writeDurableState } from './durable-state';
import { isLoopback } from './security';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (message: string): never => { throw new Error(message); };
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max ? v : fail('文本格式或长度无效');
export function integrationUrl(value: unknown): string {
  const raw = text(value, 2000); let url: URL;
  try { url = new URL(raw); } catch { return fail('请输入完整服务地址'); }
  if (url.username || url.password || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) fail('服务地址需使用 HTTPS；本机测试可使用 HTTP，凭据请填写在独立字段');
  return url.href;
}
/** Explicit public data contract: connection settings, control tokens and local files never enter the feed. */
export function liveDataFeed(source: BroadcastState): DataFeed {
  const s = programState(source);
  return structuredClone({ schemaVersion: 1, revision: source.revision, generatedAt: new Date().toISOString(), gameTime: s.gameTime, phase: s.phase,
    match: s.match, teams: s.teams.map(({ id, name, tag, color, logo }) => ({ id, name, tag, color, logo })), players: s.players,
    stats: s.stats, events: s.events, economy: s.economy, draft: s.draft, neutralObjectives: s.neutralObjectives, fightSegment: s.fightSegment,
    programScene: s.programScene, gameClock: s.gameClock });
}
interface Envelope { schemaVersion: 1; id: string; event: IntegrationEvent; at: string; production: string; data: unknown }
interface Pending { hook: WebhookConfig; envelope: Envelope; receipt: IntegrationDelivery; next: number }
export class IntegrationHub {
  private config: IntegrationConfig = { version: 1, keyHash: '', webhooks: [] };
  private previous?: { key: string; phase: string; scene: string; results: Set<string>; time: number; observed: number; clock: string; awaiting: boolean };
  private observedEvents = new Set<string>();
  private pending: Pending[] = []; private deliveries: IntegrationDelivery[] = []; private streams = new Set<Response>();
  private processing = false; private lastStream = 0; private saving = Promise.resolve(); private closed = false;
  constructor(private folder: string, private getState: () => BroadcastState, private fetcher: typeof fetch = fetch) {}
  async initialize() {
    await mkdir(this.folder, { recursive: true });
    try { const c = JSON.parse(await readFile(path.join(this.folder, 'integrations.json'), 'utf8')); if (c.version === 1 && Array.isArray(c.webhooks)) this.config = { version: 1, keyHash: c.keyHash, webhooks: c.webhooks, allowedOrigins: c.allowedOrigins ?? [] }; }
    catch (e: any) { if (e.code !== 'ENOENT') throw new Error('集成配置无法读取，请保留文件并检查 JSON'); }
  }
  private update(work:()=>IntegrationConfig) { const run=this.saving.catch(()=>{}).then(async()=>{const next=work();await writeDurableState(path.join(this.folder,'integrations.json'),next);this.config=next;});this.saving=run;return run; }
  allowsOrigin(origin:unknown) {return typeof origin==='string'&&(this.config.allowedOrigins??[]).includes(origin);}
  status(): IntegrationStatus { return { allowedOrigins:this.config.allowedOrigins??[], webhooks: this.config.webhooks.map(({ secret, ...h }) => h), hasKey: !!this.config.keyHash, deliveries: structuredClone(this.deliveries), pending: this.pending.length }; }
  async rotateKey() { const token = randomBytes(32).toString('base64url'); await this.update(()=>({...this.config,keyHash:sha256(token)})); for (const stream of this.streams) stream.end(); this.streams.clear(); return token; }
  authorized(value: unknown) { if (typeof value !== 'string' || !this.config.keyHash || value.length > 200) return false; const a = Buffer.from(sha256(value)), b = Buffer.from(this.config.keyHash); return a.length === b.length && timingSafeEqual(a, b); }
  async save(input: any) {
    await this.update(()=>{
    if (!input || !Array.isArray(input.webhooks) || input.webhooks.length > 12) fail('最多配置 12 个 Webhook');
    const ids = new Set<string>();
    const webhooks: WebhookConfig[] = input.webhooks.map((h: any): WebhookConfig => {
      const id = text(h.id || randomUUID(), 100); if (ids.has(id)) fail('Webhook ID 重复'); ids.add(id);
      if (typeof h.enabled !== 'boolean' || !Array.isArray(h.events) || h.events.some((e: any) => !integrationEvents.includes(e))) fail('Webhook 事件格式无效');
      const previous = this.config.webhooks.find(v => v.id === id);
      const secret = h.secret === undefined || h.secret === '' ? previous?.secret ?? '' : text(h.secret, 300);
      if (h.enabled && secret.length < 16) fail('启用 Webhook 前请设置至少 16 字符的签名密钥');
      return { id, name: text(h.name, 100), url: integrationUrl(h.url), enabled: h.enabled, events: [...new Set(h.events)] as IntegrationEvent[], secret };
    });
    const allowedOrigins=(input.allowedOrigins??[]) as unknown[];if(!Array.isArray(allowedOrigins)||allowedOrigins.length>20)fail('最多允许20个浏览器来源');const origins=allowedOrigins.map(value=>{const url=new URL(integrationUrl(value));if(url.pathname!=='/'||url.search)fail('浏览器来源只填写协议、主机和端口');return url.origin;});
    return { ...this.config, webhooks, allowedOrigins:[...new Set(origins)] };});
    this.pending = this.pending.filter(job => this.config.webhooks.some(h => h.id === job.hook.id && h.enabled && h.url === job.hook.url && h.secret === job.hook.secret && h.events.includes(job.envelope.event)));
    return this.status();
  }
  private enqueue(event: IntegrationEvent, data: unknown, now: number) {
    const envelope: Envelope = { schemaVersion: 1, id: randomUUID(), event, at: new Date(now).toISOString(), production: productionKey(this.getState()), data: structuredClone(data) };
    for (const hook of this.config.webhooks.filter(h => h.enabled && h.events.includes(event))) {
      const receipt: IntegrationDelivery = { id: envelope.id, name: hook.name, event, at: envelope.at, status: 'queued', attempts: 0 };
      if (this.pending.length >= 200) { receipt.status = 'failed'; receipt.detail = '发送队列已满'; } else this.pending.push({ hook: { ...hook }, envelope, receipt, next: now });
      this.deliveries.unshift(receipt); this.deliveries.length = Math.min(100, this.deliveries.length);
    }
  }
  observe(now = Date.now()) {
    if (this.closed) return;
    const s = this.getState(), key = productionKey(s), p = this.previous;
    if (!p || key !== p.key) this.observedEvents.clear();
    const results = new Set((s.gameResults ?? []).map(r => `${r.id}:${r.winner}:${r.terminalSampleAccepted}`));
    const clock=JSON.stringify([s.gameClock?.sessionId,s.gameClock?.discontinuity]),awaiting=!!s.gameClock?.awaitingLiveSample;
    const continuous=p&&!awaiting&&!p.awaiting&&clock===p.clock&&s.gameTime>=p.time-1&&s.gameTime-p.time<=Math.max(3,(now-p.observed)/1000*Math.max(1,s.gameClock?.speed??1)+3);
    // On startup or replay seek, establish a fresh baseline; historical kills are never broadcast as new.
    if (p && key === p.key && continuous) {
      for (const event of s.events) if (!this.observedEvents.has(event.id) && event.time >= Math.max(p.time - 2,s.gameTime-3) && event.time <= s.gameTime + 1) { this.observedEvents.add(event.id); this.enqueue('game.event', event, now); }
      if (p.phase !== s.phase) this.enqueue('phase.changed', { previous: p.phase, current: s.phase }, now);
      if (p.scene !== s.programScene) this.enqueue('program.changed', { previous: p.scene, current: s.programScene }, now);
    } else if (p && key !== p.key) this.enqueue('game.changed', { match: s.match }, now);
    if (p) for (const result of s.gameResults ?? []) if (!p.results.has(`${result.id}:${result.winner}:${result.terminalSampleAccepted}`)) this.enqueue('result.saved', { id: result.id, winner: result.winner, game: result.game, seriesComplete: result.seriesComplete }, now);
    for (const event of s.events) this.observedEvents.add(event.id);
    while (this.observedEvents.size > 20000) this.observedEvents.delete(this.observedEvents.values().next().value!);
    this.previous = { key, phase: s.phase, scene: s.programScene, results, time: s.gameTime, observed:now, clock, awaiting };
    if (this.streams.size && now - this.lastStream >= 250) { this.lastStream = now; const payload = `event: game-data\ndata: ${JSON.stringify(liveDataFeed(s))}\n\n`; for (const stream of this.streams) { if (stream.writableLength > 1024 * 1024) { stream.end(); this.streams.delete(stream); } else stream.write(payload); } }
  }
  async flush(now = Date.now()) {
    if (this.processing || this.closed) return; this.processing = true;
    try {
      const jobs = this.pending.filter(j => j.next <= now).slice(0, 8);
      await Promise.all(jobs.map(async job => {
        const body = JSON.stringify(job.envelope), timestamp = String(Math.floor(now / 1000)); job.receipt.attempts++;
        try {
          const response = await this.fetcher(job.hook.url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json', 'X-RiftCast-Event': job.envelope.event, 'X-RiftCast-Delivery': job.envelope.id, 'X-RiftCast-Timestamp': timestamp, 'X-RiftCast-Signature': `sha256=${createHmac('sha256', job.hook.secret).update(`${timestamp}.${body}`).digest('hex')}` }, body });
          await response.body?.cancel(); if (!response.ok) throw new Error(`HTTP ${response.status}`);
          job.receipt.status = 'sent'; this.pending = this.pending.filter(v => v !== job);
        } catch (e) {
          job.receipt.detail = e instanceof Error && /^HTTP \d+$/.test(e.message) ? e.message : '连接失败或超时';
          if (job.receipt.attempts >= 3) { job.receipt.status = 'failed'; this.pending = this.pending.filter(v => v !== job); }
          else job.next = now + 1000 * 2 ** job.receipt.attempts;
        }
      }));
    } finally { this.processing = false; }
  }
  stream(response: Response) {
    if (this.streams.size >= 16) { response.status(429).json({ error: '数据订阅已达到 16 路' }); return; }
    response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); response.flushHeaders();
    response.write(`event: game-data\ndata: ${JSON.stringify(liveDataFeed(this.getState()))}\n\n`); this.streams.add(response);
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15000); heartbeat.unref();
    response.on('close', () => { clearInterval(heartbeat); this.streams.delete(response); });
  }
  close() { this.closed = true; for (const stream of this.streams) stream.end(); this.streams.clear(); }
}
export function registerIntegrationRoutes(app: Express, hub: IntegrationHub, getState: () => BroadcastState, authorize: (req: Request) => unknown) {
  const local = (req: Request) => { if (!isLoopback(req.socket.remoteAddress)) fail('集成凭据由导播主机管理'); authorize(req); };
  app.get('/api/integrations', (req, res) => { local(req); res.json(hub.status()); });
  app.post('/api/integrations', async (req, res) => { local(req); res.json(req.body.action === 'rotate-key' ? { token: await hub.rotateKey() } : await hub.save(req.body)); });
  const feed = (req: Request, res: Response) => { const token = req.headers.authorization?.replace(/^Bearer /, '') ?? req.query.key; if (!hub.authorized(token)) { res.status(401).json({ error: '需要有效的数据接口密钥' }); return false; } res.setHeader('Cache-Control', 'no-store'); return true; };
  app.get('/api/integrations/data', (req, res) => { if (feed(req, res)) res.json(liveDataFeed(getState())); });
  app.get('/api/integrations/stream', (req, res) => { if (feed(req, res)) hub.stream(res); });
}
