import archiver from 'archiver';
import type { Response } from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { BroadcastState } from '../shared/types';
import type { Tournament } from '../shared/tournament-types';
import { tournamentReport, tournamentCsv } from '../shared/tournament-report';
import { archiveSources, type PostgameArchiveStore } from './postgame-archive';

export async function exportTournament(s: BroadcastState, t: Tournament, store: PostgameArchiveStore, uploadDir: string, res: Response) {
  const report = tournamentReport(s, t);
  const matchIds = new Set(report.matches.map(m => m.id));
  const invalidAttempts = s.production?.invalidAttempts.filter(attempt => attempt.result?.matchId && matchIds.has(attempt.result.matchId)) ?? [];
  const allResults = [...report.results, ...invalidAttempts.flatMap(attempt => attempt.result ? [attempt.result] : [])];
  const zip = archiver('zip', { zlib: { level: 6 } });
  const manifest: { path: string; bytes: number; sha256: string }[] = [], missing: { path: string; detail: string }[] = [];
  const append = (name: string, value: string | Buffer) => { const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value); manifest.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); zip.append(bytes, { name }); };
  zip.on('error', e => res.destroy(e));
  res.on('close', () => { if (!res.writableEnded) void zip.abort(); });
  res.type('application/zip').setHeader('Content-Disposition', `attachment; filename="${t.id}.zip"`); zip.pipe(res);
  append('event.json', JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), tournament: t, teams: s.teams.filter(team => t.config.teamIds.includes(team.id)), ...report,
    invalidAttempts, corrections: s.production?.corrections.filter(c => allResults.some(r => r.id === c.resultId)), draftHistory: s.draftHistory?.filter(h => allResults.some(r => r.seriesId === h.seriesId)) }, null, 2));
  append('statistics.csv', tournamentCsv(s, t));
  for (const result of allResults) for (const source of archiveSources) {
    const name = `games/${result.id}/${source}.json`;
    try { const raw = await store.read(result.id, source); if (raw) append(name, JSON.stringify(raw, null, 2)); else missing.push({ path: name, detail: result.archive?.sources[source]?.detail ?? '该来源尚未取得' }); }
    catch { missing.push({ path: name, detail: '归档文件读取失败' }); }
  }
  for (const asset of report.assets) {
    if (!/^\/uploads\/[a-z0-9-]+\.(png|jpg|webp|gif)$/.test(asset.url)) { missing.push({ path: asset.url, detail: '保留外部素材地址' }); continue; }
    const name = asset.url.slice(1);
    try { append(name, await readFile(path.join(uploadDir, path.basename(asset.url)))); }
    catch { missing.push({ path: name, detail: '素材文件读取失败' }); }
  }
  append('README.txt', 'event.json 包含赛事规则、种子、对阵、逐局快照、BP、积分、选手数据与结果修订。\r\nstatistics.csv 可用 Excel 打开。\r\ngames/ 保存客户端原始响应；uploads/ 保存已上传且关联的图片。\r\nmanifest.json 列出文件校验和与缺失项。空数据保留为缺失。\r\n');
  zip.append(JSON.stringify({ schemaVersion: 1, files: manifest, missing }, null, 2), { name: 'manifest.json' });
  await zip.finalize();
}
