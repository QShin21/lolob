import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Express, Request } from 'express';
import type { BroadcastState } from '../shared/types';
import { emptyVdoConfig, vdoStatus, type VdoConfig } from '../shared/vdo-ninja';
import { isLoopback } from './security';

export class VdoNinjaService {
  private config: VdoConfig = emptyVdoConfig();
  constructor(private file?: string, private random = () => randomBytes(18).toString('hex')) {}
  async load() {
    if (!this.file) return;
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      if (data.version !== 1 || typeof data.enabled !== 'boolean' || !Array.isArray(data.bindings) || data.bindings.length > 500 || data.bindings.some((b: any) => typeof b.teamId !== 'string' || typeof b.playerId !== 'string' || !/^[A-Za-z0-9]{16,64}$/.test(b.streamId))) throw new Error('远程摄像机配置格式无效');
      this.config = data;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  snapshot(state: BroadcastState) { return vdoStatus(state, this.config); }
  async update(state: BroadcastState, input: unknown) {
    const data = input as { op?: unknown; enabled?: unknown; teamId?: unknown; playerId?: unknown } | undefined;
    const next = structuredClone(this.config);
    if (data?.op === 'generate') {
      for (const team of state.teams.filter(t => [state.match.blueTeamId, state.match.redTeamId].includes(t.id))) for (const member of team.players) {
        if (!member.id || team.players.filter(p => p.id === member.id).length !== 1) continue;
        if (!next.bindings.some(b => b.teamId === team.id && b.playerId === member.id)) next.bindings.push({ teamId: team.id, playerId: member.id, streamId: this.random() });
      }
      if (next.bindings.length > 500) throw new Error('远程选手绑定已达上限，请清除旧配置后重新生成');
    } else if (data?.op === 'enabled' && typeof data.enabled === 'boolean') next.enabled = data.enabled;
    else if (data?.op === 'rotate') {
      const binding = next.bindings.find(b => b.teamId === data.teamId && b.playerId === data.playerId);
      if (!binding) throw new Error('选手邀请尚未生成'); binding.streamId = this.random();
    } else if (data?.op === 'clear') { next.bindings = []; next.enabled = false; }
    else throw new Error('远程选手画面操作无效');
    if (new Set(next.bindings.map(b => b.streamId)).size !== next.bindings.length) throw new Error('摄像机标识重复，请重试生成');
    // Persist before publishing the new configuration so failed saves remain recoverable.
    if (this.file) { await mkdir(path.dirname(this.file), { recursive: true }); await writeFile(`${this.file}.tmp`, JSON.stringify(next), { mode: 0o600 }); await rename(`${this.file}.tmp`, this.file); }
    this.config = next; return this.snapshot(state);
  }
}
export async function mountVdoNinjaRoutes(app: Express, options: { getState: () => BroadcastState; getOutputState?: () => BroadcastState; authorize: (req: Request) => void; file?: string; service?: VdoNinjaService }) {
  const service = options.service ?? new VdoNinjaService(options.file); await service.load();
  let queue = Promise.resolve<unknown>(undefined);
  app.get('/api/vdo-ninja', (req, res, next) => { try {
    res.setHeader('Cache-Control', 'no-store');
    // Seat-less maintenance belongs to the local host, including immediately after restart.
    if(!isLoopback(req.socket.remoteAddress)&&!req.headers['x-seat-token']){res.status(403).json({error:'查看选手邀请需要已授权的主导播席位'});return;}
    options.authorize(req);res.json(service.snapshot(options.getState()));
  } catch (e) { next(e); } });
  app.get('/api/vdo-ninja/feeds', (req, res) => { res.setHeader('Cache-Control', 'no-store'); if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'远程画面链接仅供导播主机输出使用'});return;} const { enabled, feeds } = service.snapshot((options.getOutputState ?? options.getState)()); res.json({ enabled, feeds }); });
  app.post('/api/vdo-ninja', (req, res, next) => {
    try { options.authorize(req); } catch (e) { next(e); return; }
    queue = queue.catch(() => {}).then(async () => { try { options.authorize(req); } catch(e) { next(e);return; } try { res.json(await service.update(options.getState(), req.body)); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : '配置保存失败' }); } });
  });
  return service;
}
