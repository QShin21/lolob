import http, { type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { checkProof, teamKey, teamProof, TeamCipher } from './collaboration-crypto';
import { isLoopback, lanAddresses, validToken } from './security';
import { record, str, ValidationError } from './state';
import type { TeamSnapshot, TeamSource, TeamRequest } from '../shared/collaboration';

const MAX_BUFFER = 8 * 1024 * 1024;
const MAX_PACKET = 2 * 1024 * 1024;
const json = (value: unknown) => Buffer.concat([Buffer.from([0]), Buffer.from(JSON.stringify(value))]);
const media = (id: string, data: Buffer) => Buffer.concat([Buffer.from([1, id.length]), Buffer.from(id), data]);
type Peer = { socket: WebSocket; cipher: TeamCipher; id: string; alive: boolean };
type Cached = { chunks: Buffer[]; size: number; complete: boolean };
export class TeamCollaboration {
  private listener?: http.Server;
  private remoteWss?: WebSocketServer;
  private client?: WebSocket;
  private peers = new Map<string, Peer>();
  private viewers = new Map<WebSocket, string>();
  private localWss = new WebSocketServer({ noServer: true, maxPayload: MAX_PACKET, perMessageDeflate: false });
  private cache = new Map<string, Cached>();
  private reconnect?: ReturnType<typeof setTimeout>;
  private closed = false;
  private generation = 0;
  private attempts = new Map<string, { at: number; count: number }>();
  private remoteSend?: (value: Buffer) => void;
  private autoQueue: Promise<unknown> = Promise.resolve();
  private failoverPending = false;
  private ready = new Map<string, number>();
  private localToken = randomBytes(24).toString('base64url');
  private state: TeamSnapshot = { mode: 'idle', connected: false, self: 'host', name: '', addresses: [], localToken: '', sources: [], requests: [], scenes: [], activeSource: 'host', autoApprove: false };
  private heartbeat = setInterval(() => this.tick(), 3000);
  constructor(private scenes: () => { id: string; name: string }[], private apply: (request: TeamRequest, source?: TeamSource) => Promise<void>) {}
  snapshot(): TeamSnapshot { return { ...structuredClone(this.state), localToken: this.localToken, scenes: this.state.mode === 'client' ? this.state.scenes : this.scenes() }; }
  private source(id: string) { return this.state.sources.find(s => s.id === id); }
  private publish() {
    const snapshot = this.snapshot();
    for (const [ws, kind] of this.viewers) if (kind === '$control') this.sendLocal(ws, json({ type: 'state', state: snapshot }));
    if (this.state.mode === 'host') for (const peer of this.peers.values()) this.sendPeer(peer, json({ type: 'state', state: { ...snapshot, localToken: '', code: undefined, self: peer.id } }));
  }
  private sendLocal(ws: WebSocket, data: Buffer) { if (ws.readyState !== WebSocket.OPEN) return; if (ws.bufferedAmount > MAX_BUFFER) ws.close(1013, '接收速度过慢，请重新连接'); else ws.send(data); }
  private sendPeer(peer: Peer, data: Buffer) { if (peer.socket.readyState !== WebSocket.OPEN) return; if (peer.socket.bufferedAmount > MAX_BUFFER) peer.socket.close(1013); else peer.socket.send(peer.cipher.seal(data)); }
  private localCommand(id: string, value: unknown) {
    const packet = json(value);
    if (id === this.state.self) for (const [ws, kind] of this.viewers) { if (kind === '$control') this.sendLocal(ws, packet); }
    else if (this.state.mode === 'host') { const peer = this.peers.get(id); if (peer) this.sendPeer(peer, packet); }
  }
  private resetStream(id: string, mime: string) {
    this.ready.delete(id);
    this.cache.set(id, { chunks: [], size: 0, complete: true });
    const event = json({ type: 'stream', id, mime });
    for (const [ws, kind] of this.viewers) if (kind === id) this.sendLocal(ws, event);
    if (this.state.mode === 'host') for (const peer of this.peers.values()) if (peer.id !== id) this.sendPeer(peer, event);
  }
  private forwardMedia(id: string, data: Buffer) {
    const source = this.source(id); if (!source?.sharing) return;
    source.lastFrame = Date.now();
    const cached = this.cache.get(id);
    if (cached?.complete) { if (cached.size + data.length <= MAX_BUFFER) { cached.chunks.push(data); cached.size += data.length; } else { cached.complete = false; cached.chunks = []; } }
    const packet = media(id, data);
    for (const [ws, kind] of this.viewers) if (kind === id) this.sendLocal(ws, packet);
    if (this.state.mode === 'host') for (const peer of this.peers.values()) if (peer.id !== id) this.sendPeer(peer, packet);
  }
  private receive(id: string, packet: Buffer) {
    if (packet[0] === 1) { if (packet.length > MAX_PACKET) throw new ValidationError('画面数据过大'); this.forwardMedia(id, packet.subarray(1)); return; }
    if (packet[0] !== 0 || packet.length > 16384) throw new ValidationError('协作消息无效');
    const value = record(JSON.parse(packet.subarray(1).toString()));
    if (value.type === 'share') {
      const source = this.source(id); if (!source) return;
      const mime = str(value.mime, 100); if (!/^video\/webm;codecs=(vp8|vp9)(,opus)?$/.test(mime)) throw new ValidationError('画面编码无效');
      source.sharing = true; source.kind = value.kind === 'program' ? 'program' : 'game'; source.mime = mime;
      this.resetStream(id, mime); this.publish();
    } else if (value.type === 'stop') { this.stopStream(id); }
    else if (value.type === 'watch') { const target = str(value.id, 40); this.localCommand(target, { type: 'restart' }); }
    else if (value.type === 'request') {
      if(id!=='host'&&value.scene&&(!this.source('host')?.sharing||Date.now()-(this.source('host')?.lastFrame??0)>5000))throw new ValidationError('主控端预览已中断，请等待主控端重新共享画面');
      if (this.state.requests.filter(r => r.actorId === id && r.status === 'pending').length >= 5) throw new ValidationError('请先等待已有切换请求处理');
      const scene = value.scene === undefined ? undefined : str(value.scene, 100), source = value.source === undefined ? undefined : str(value.source, 40);
      if (scene && !this.scenes().some(s => s.id === scene) || source && source!=='host'&&!this.source(source)?.sharing || !scene && !source || scene&&source) throw new ValidationError('请选择可用节目或画面');
      const request: TeamRequest = { id: randomUUID(), actor: this.source(id)?.name ?? '协作者', actorId: id, scene, source, status: 'pending', at: Date.now() };
      this.state.requests.unshift(request); this.state.requests = this.state.requests.slice(0, 100); this.publish();
      if (this.state.autoApprove) this.autoQueue=this.autoQueue.catch(()=>{}).then(()=>this.decide(request.id,true)).catch(()=>{});
    } else throw new ValidationError('协作操作无效');
  }
  private stopStream(id: string) {
    this.ready.delete(id);
    const source = this.source(id); if (source) { source.sharing = false; delete source.lastFrame; }
    this.cache.delete(id);
    const packet = json({ type: 'ended', id });
    for (const [ws, kind] of this.viewers) if (kind === id) this.sendLocal(ws, packet);
    if (this.state.mode === 'host') for (const peer of this.peers.values()) this.sendPeer(peer, packet);
    this.publish();
    if(this.state.mode==='host'&&this.state.activeSource===id&&id!=='host')void this.fallback();
  }
  private async fallback(){
    if(this.failoverPending||this.closed)return;this.failoverPending=true;
    try{await this.apply({id:randomUUID(),actor:'协作保护',actorId:'host',source:'host',status:'pending',at:Date.now()},this.source('host'));this.state.activeSource='host';this.state.error='协作画面中断，已恢复主控端游戏画面';}
    catch{this.state.error='协作画面中断，自动恢复失败，请在主控端恢复游戏画面';}
    finally{this.failoverPending=false;this.publish();}
  }
  async host(input: unknown) {
    const value = record(input), port = Number(value.port ?? 3890);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ValidationError('协作端口需在 1–65535 之间');
    await this.stop(); this.closed = false;
    const code = randomBytes(24).toString('base64url'), key = teamKey(code);
    const listener = http.createServer((_req, res) => { res.writeHead(404); res.end(); });
    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PACKET + 28, perMessageDeflate: false });
    this.listener = listener; this.remoteWss = wss;
    const generation=this.generation;
    listener.on('upgrade', (req, socket, head) => {
      const address = req.socket.remoteAddress ?? '', previous = this.attempts.get(address);
      if (req.url !== '/team' || this.peers.size >= 8 || wss.clients.size >= 16 || previous && Date.now() - previous.at < 60000 && previous.count >= 12) { socket.destroy(); return; }
      this.attempts.set(address, { at: Date.now(), count: previous && Date.now() - previous.at < 60000 ? previous.count + 1 : 1 });
      if (this.attempts.size > 500) this.attempts.delete(this.attempts.keys().next().value!);
      wss.handleUpgrade(req, socket, head, ws => {
        ws.on('error', () => {});
        const nonce = randomBytes(32).toString('base64url'), timeout = setTimeout(() => ws.terminate(), 6000);
        ws.send(JSON.stringify({ protocol: 1, nonce }));
        ws.once('message', (raw, binary) => {
          clearTimeout(timeout);
          try {
            if (binary || raw.toString().length > 2048) throw new Error();
            const auth = record(JSON.parse(raw.toString()));
            if (!checkProof(key, nonce, auth.proof)) throw new Error();
            const id = randomUUID(), peer: Peer = { id, socket: ws, cipher: new TeamCipher(key), alive: true };
            this.peers.set(id, peer); this.state.sources.push({ id, name: str(auth.name ?? '协作者', 60), online: true, sharing: false, kind: 'game' });
            ws.on('pong', () => { peer.alive = true; });
            ws.on('message', (data, isBinary) => { try { if (!isBinary) throw new Error(); this.receive(id, peer.cipher.open(Buffer.from(data as Buffer))); } catch(error) { if(error instanceof ValidationError)this.sendPeer(peer,json({type:'error',message:error.message}));else ws.close(1008, '协作消息无效'); } });
            ws.once('close', () => { if(this.generation!==generation)return;this.peers.delete(id); this.stopStream(id); this.state.sources = this.state.sources.filter(s => s.id !== id); for (const r of this.state.requests) if (r.actorId === id && r.status === 'pending') { r.status = 'rejected'; r.detail = '协作者已离线'; } this.publish(); });
            this.publish();
          } catch { ws.close(1008, '配对验证失败'); }
        });
      });
    });
    try { await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(port, '::', () => { listener.removeListener('error', reject); resolve(); }); }); }
    catch { await this.stop(); throw new ValidationError('协作端口无法监听，请选择其他端口并检查端口占用'); }
    listener.on('error', () => { this.state.error = '协作监听中断，请重新建立协作'; this.publish(); });
    const name = str(value.name ?? '主控端', 60);
    this.state = { ...this.state, mode: 'host', connected: true, self: 'host', name, port, code, addresses: lanAddresses(), sources: [{ id: 'host', name, online: true, sharing: false, kind: 'game' }], requests: [], activeSource: 'host', autoApprove: value.autoApprove === true, error: undefined };
    this.publish(); return this.snapshot();
  }
  async join(input: unknown) {
    const value = record(input), address = str(value.address, 300).trim();
    let url: URL;
    try { url = new URL(address.includes('://') ? address : `ws://${address}`); } catch { throw new ValidationError('请输入主控端 IP:端口，IPv6 使用 [地址]:端口'); }
    if (!['ws:', 'wss:'].includes(url.protocol) || !url.hostname || !url.port || url.username || url.password || url.search || url.hash || !['/', '/team'].includes(url.pathname)) throw new ValidationError('请输入主控端 IP:端口');
    url.pathname = '/team';
    const code = str(value.code, 100).trim(); if (!/^[A-Za-z0-9_-]{32}$/.test(code)) throw new ValidationError('请粘贴完整配对码');
    const name = str(value.name ?? '协作者', 60), key = teamKey(code);
    await this.stop(); this.closed = false;
    const generation = this.generation;
    this.state = { ...this.state, mode: 'client', connected: false, self: '', name, addresses: [], sources: [], requests: [], error: '正在连接主控端' };
    const connect = () => {
      if (this.closed || this.generation !== generation) return;
      const ws = new WebSocket(url, { maxPayload: MAX_PACKET + 28, handshakeTimeout: 6000, perMessageDeflate: false }); this.client = ws;
      const cipher = new TeamCipher(key); let authenticated = false, lastMessage = Date.now();
      const authTimeout = setTimeout(() => { if (!authenticated) ws.terminate(); }, 7000);
      ws.on('error', () => {});
      ws.on('ping', () => { lastMessage = Date.now(); });
      const watchdog = setInterval(() => { if (Date.now() - lastMessage > 15000) ws.terminate(); }, 3000);
      ws.on('message', (raw, binary) => {
        try {
          lastMessage = Date.now();
          if (!binary) { if (authenticated || raw.toString().length > 1024) throw new Error(); const challenge = record(JSON.parse(raw.toString())); if (challenge.protocol !== 1 || typeof challenge.nonce !== 'string' || challenge.nonce.length !== 43) throw new Error(); ws.send(JSON.stringify({ proof: teamProof(key, challenge.nonce), name })); return; }
          const packet = cipher.open(Buffer.from(raw as Buffer));
          if (packet[0] === 1) { const length = packet[1], id = packet.subarray(2, 2 + length).toString(); this.forwardMedia(id, packet.subarray(2 + length)); return; }
          const event = record(JSON.parse(packet.subarray(1).toString()));
          if (event.type === 'state') {
            authenticated = true; clearTimeout(authTimeout); this.remoteSend = data => { if (ws.readyState !== WebSocket.OPEN) throw new ValidationError('主控端连接已中断'); if (ws.bufferedAmount > MAX_BUFFER) { ws.close(1013); return; } ws.send(cipher.seal(data)); };
            this.state = { ...(event.state as TeamSnapshot), mode: 'client', connected: true, name, code: undefined, error: undefined, addresses: [] }; this.publish();
          } else if (event.type === 'stream') { this.resetStream(String(event.id), String(event.mime)); }
          else if (event.type === 'restart') { this.localCommand(this.state.self, event); }
          else if (event.type === 'ended') { this.stopStream(String(event.id)); }
          else if (event.type === 'error') { this.state.error=str(event.message,300);this.publish(); }
        } catch { ws.close(1008, '协作验证失败'); }
      });
      ws.once('close', code => {
        clearTimeout(authTimeout); clearInterval(watchdog);
        if (this.closed || this.generation !== generation) return;
        this.remoteSend = undefined; this.cache.clear(); this.state.connected = false; this.state.error = code === 1008 ? '配对失败，请核对配对码后重新加入' : '连接中断，正在重新连接';
        for (const source of this.state.sources) { source.online = false; source.sharing = false; } this.publish();
        for (const [viewer, kind] of this.viewers) if (kind !== '$control') this.sendLocal(viewer, json({ type: 'ended', id: kind }));
        if (code !== 1008) this.reconnect = setTimeout(connect, 2000);
      });
    };
    connect(); this.publish(); return this.snapshot();
  }
  request(input: unknown) { if (!this.state.connected) throw new ValidationError('请先连接协作'); const packet = json({ ...record(input), type: 'request' }); if (this.state.mode === 'client') this.remoteSend?.(packet); else this.receive('host', packet); }
  private deciding = false;
  async decide(id: string, approve: boolean) {
    if (this.state.mode !== 'host') throw new ValidationError('请求由主控端处理');
    const request = this.state.requests.find(r => r.id === id); if (!request || request.status !== 'pending') throw new ValidationError('请求已处理或已失效');
    if (this.deciding) throw new ValidationError('正在应用其他切换请求');
    if (!approve) { request.status = 'rejected'; request.detail = '主控端已拒绝'; this.publish(); return; }
    this.deciding = true;
    try { const source = request.source ? this.source(request.source) : undefined; if (request.source && request.source!=='host'&&(!source?.sharing || !source.lastFrame || Date.now() - source.lastFrame > 5000)) throw new ValidationError('协作者画面已中断，请等待重新共享'); await this.apply(request, source); if (request.source) this.state.activeSource = request.source; request.status = 'applied'; request.detail = '主控端已应用，请核对 PGM'; }
    catch (e) { request.status = 'failed'; request.detail = e instanceof Error ? e.message : '节目应用失败'; }
    finally { this.deciding = false; this.publish(); }
  }
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (!isLoopback(req.socket.remoteAddress) || !validToken(url.searchParams.get('token'), this.localToken)) { socket.destroy(); return; }
    const id = url.searchParams.get('id') ?? '$control';
    this.localWss.handleUpgrade(req, socket, head, ws => {
      ws.on('error', () => {}); this.viewers.set(ws, id); ws.once('close', () => { this.viewers.delete(ws); if (id === '$control') { const active = [...this.viewers.values()].includes('$control'); if (!active) { if (this.state.mode === 'client') this.remoteSend?.(json({ type: 'stop' })); else this.stopStream(this.state.self); } } });
      if (id === '$control') this.sendLocal(ws, json({ type: 'state', state: this.snapshot() }));
      else { const source = this.source(id), cached = this.cache.get(id); if (source?.sharing && cached?.complete && cached.chunks.length) { this.sendLocal(ws, json({ type: 'stream', id, mime: source.mime })); for (const chunk of cached.chunks) this.sendLocal(ws, media(id, chunk)); } else if (this.state.mode === 'client') this.remoteSend?.(json({ type: 'watch', id })); else this.localCommand(id, { type: 'restart' }); }
      ws.on('message', (raw, binary) => { try { if (!binary) throw new Error(); const packet = Buffer.from(raw as Buffer);if(id!=='$control'){if(packet[0]!==0||packet.length>256)throw new Error();const event=JSON.parse(packet.subarray(1).toString());if(event.type==='ready'&&url.searchParams.get('output')==='1')this.ready.set(id,Date.now());return;} if (this.state.mode === 'client') this.remoteSend?.(packet); else if (this.state.mode === 'host') this.receive('host', packet); } catch { ws.close(1008); } });
    });
  }
  private tick() {
    const source=this.source(this.state.activeSource);
    if(this.state.mode==='host'&&this.state.activeSource!=='host'&&(!source?.sharing||!source.lastFrame||Date.now()-source.lastFrame>5000))void this.fallback();
    for (const peer of this.peers.values()) { if (!peer.alive) { peer.socket.terminate(); continue; } peer.alive = false; peer.socket.ping(); }
    if (this.state.mode === 'host') this.publish();
  }
  async waitReady(id:string){const deadline=Date.now()+10000;while(Date.now()<deadline){if(Date.now()-(this.ready.get(id)??0)<1500)return;if(!this.source(id)?.sharing)throw new ValidationError('协作画面已停止');await new Promise(resolve=>setTimeout(resolve,100));}throw new ValidationError('协作画面解码超时，请预监后重新切入');}
  async stop() {
    this.closed = true; this.generation++; clearTimeout(this.reconnect); this.remoteSend = undefined;
    this.client?.terminate(); this.client = undefined;
    for (const peer of this.peers.values()) peer.socket.terminate(); this.peers.clear();
    this.remoteWss?.close(); this.remoteWss = undefined;
    if (this.listener) { const listener = this.listener; this.listener = undefined; await new Promise<void>(resolve => listener.close(() => resolve())); }
    this.cache.clear(); this.state = { ...this.state, mode: 'idle', connected: false, self: 'host', name: '', port: undefined, code: undefined, error: undefined, sources: [], requests: [], addresses: [], activeSource: 'host' };
    for (const [ws, kind] of this.viewers) if (kind !== '$control') this.sendLocal(ws, json({ type: 'ended', id: kind }));
    this.publish();
  }
  async close() { clearInterval(this.heartbeat); await this.stop(); for (const ws of this.viewers.keys()) ws.terminate(); this.localWss.close(); }
}
