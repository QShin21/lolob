import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { BroadcastState, Champion } from '../shared/types';
import type { ArchiveSource, ArchiveReceipt } from '../shared/tournament-types';
import { writeDurableState } from './durable-state';
import { confirmArchivedWinner, lcuWinner } from './game-results';
import { enrichPostgame } from './postgame-data';

export const archiveSources = ['live', 'eog', 'details', 'timeline'] as const;
const safeId = (id: string) => { if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('归档 ID 无效'); return id; };
export function validArchivePayload(source: ArchiveSource, gameId: string, payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const reported = payload.gameId ?? payload.gameData?.gameId;
  if (reported !== undefined && String(reported) !== gameId) return false;
  if (source === 'live') return Array.isArray(payload.allPlayers) && payload.allPlayers.length > 0;
  if (source === 'timeline') return Array.isArray(payload.frames) && payload.frames.length > 0;
  if (String(reported) !== gameId) return false;
  return source === 'eog' ? Array.isArray(payload.teams) && payload.teams.some((t: any) => Array.isArray(t.players) && t.players.length) : Array.isArray(payload.participants) && payload.participants.length > 0;
}
export class PostgameArchiveStore {
  constructor(private directory: string) {}
  private file(resultId: string, source: ArchiveSource) {
    if (!archiveSources.includes(source)) throw new Error('归档来源无效');
    return path.join(this.directory, safeId(resultId), `${source}.json`);
  }
  async save(resultId: string, source: ArchiveSource, gameId: string, payload: unknown): Promise<ArchiveReceipt> {
    if (!validArchivePayload(source, gameId, payload)) throw new Error('接口未提供此局的完整响应，等待补采');
    const value = { schemaVersion: 1, resultId, gameId, source, capturedAt: new Date().toISOString(), payload };
    const file = this.file(resultId, source); await mkdir(path.dirname(file), { recursive: true });
    await writeDurableState(file, value);
    const bytes = await readFile(file);
    return { status: 'saved', attempts: 1, capturedAt: value.capturedAt, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  async read(resultId: string, source: ArchiveSource): Promise<any | undefined> {
    try { return JSON.parse(await readFile(this.file(resultId, source), 'utf8')); }
    catch (error: any) { if (error.code === 'ENOENT') return undefined; throw error; }
  }
  async all(resultId: string) {
    const entries = await Promise.all(archiveSources.map(async source => [source, await this.read(resultId, source)] as const));
    return Object.fromEntries(entries.filter(([, value]) => value));
  }
}

/** A persistent receipt records retry state. Late responses target their original result ID. */
export class PostgameCollector {
  private jobs = new Map<string, Promise<void>>();
  private polling = false;
  private payloadHashes = new Map<string,string>();
  constructor(readonly store: PostgameArchiveStore, private get: () => BroadcastState, private commit: (work: (s: BroadcastState) => void) => void, private champions: () => Champion[]) {}
  capture(resultId: string, source: ArchiveSource, payload: unknown): Promise<void> {
    const key = `${resultId}:${source}`, existing = this.jobs.get(key);
    if (existing) return existing;
    const result = this.get().gameResults?.find(r => r.id === resultId), gameId = result?.sourceGameId ?? (source==='live' ? '' : undefined);
    if (!result || gameId===undefined || source!=='eog' && result?.archive?.sources[source]?.status === 'saved') return Promise.resolve();
    const hash=createHash('sha256').update((JSON.stringify(payload)??'null')).digest('hex');
    if(this.payloadHashes.get(key)===hash)return Promise.resolve();
    const attempts = (result?.archive?.sources[source]?.attempts ?? 0) + 1;
    const job = (async () => {
      try {
        const receipt = await this.store.save(resultId, source, gameId, payload);
        this.payloadHashes.set(key,hash);
        if(this.payloadHashes.size>1000)this.payloadHashes.delete(this.payloadHashes.keys().next().value!);
        this.commit(s => {
          const r = s.gameResults?.find(r => r.id === resultId && (!gameId || r.sourceGameId === gameId)); if (!r) return;
          r.archive ??= { sources: {} }; r.archive.sources[source] = { ...receipt, attempts };
          if (source === 'eog' || source === 'details') {enrichPostgame(s, payload, this.champions(), resultId);const winner=lcuWinner(payload);if(winner)confirmArchivedWinner(s,r,winner);}
        });
      } catch (error) { this.failed(resultId, source, attempts, error); }
    })().finally(() => this.jobs.delete(key));
    this.jobs.set(key, job); return job;
  }
  private failed(resultId: string, source: ArchiveSource, attempts: number, error: unknown) {
    this.commit(s => {
      const r = s.gameResults?.find(r => r.id === resultId); if (!r || r.archive?.sources[source]?.status === 'saved') return;
      r.archive ??= { sources: {} };
      r.archive.sources[source] = { status: attempts >= 8 ? 'unavailable' : 'pending', attempts, nextAttemptAt: Date.now() + Math.min(300000, 5000 * 2 ** Math.min(attempts - 1, 6)), detail: error instanceof Error ? error.message.slice(0, 180) : '客户端暂未提供此项数据' };
    });
  }
  async tick(request: (endpoint: string) => Promise<any>): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      // One game per tick keeps background collection bounded without blocking live polling.
      const pending = [...(this.get().gameResults ?? [])].reverse().flatMap(r => r.sourceGameId ? (['eog', 'details', 'timeline'] as const).map(source => ({ r, source, receipt: r.archive?.sources[source] })).filter(({ receipt }) => (!receipt || receipt.status === 'pending') && (receipt?.nextAttemptAt ?? 0) <= Date.now()) : []);
      const next = pending[0]; if (!next) return;
      const { r, source, receipt } = next;
      // Recover a completed file after a crash between file and state persistence.
      const saved = await this.store.read(r.id, source).catch(()=>undefined);
      if (saved?.gameId === r.sourceGameId && validArchivePayload(source, r.sourceGameId!, saved.payload)) { await this.capture(r.id, source, saved.payload); return; }
      const id = encodeURIComponent(r.sourceGameId!);
      const endpoint = source === 'eog' ? '/lol-end-of-game/v1/eog-stats-block' : source === 'details' ? `/lol-match-history/v1/games/${id}` : `/lol-match-history/v1/game-timelines/${id}`;
      try { await this.capture(r.id, source, await request(endpoint)); }
      catch (error) { this.failed(r.id, source, (receipt?.attempts ?? 0) + 1, error); }
    } finally { this.polling = false; }
  }
  async close() { await Promise.allSettled([...this.jobs.values()]); }
}
