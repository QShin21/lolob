import { randomUUID } from 'node:crypto';
import type { BroadcastState } from '../shared/types';
import type { TournamentConfig } from '../shared/tournament-types';
import { advanceTournaments, buildTournament, winTarget } from '../shared/tournaments';
import { record, str, ValidationError } from './state';

export function applyTournamentAction(s: BroadcastState, action: Record<string, unknown>): void {
  try {
    if (action.type === 'create-tournament') {
      if ((s.tournaments?.length ?? 0) >= 100) throw new Error('赛事库已达到 100 届，请导出归档后整理');
      const config = structuredClone(record(action.config)) as unknown as TournamentConfig;
      if (action.newTeamNames !== undefined) {
        if (!Array.isArray(action.newTeamNames) || action.newTeamNames.length > 64 || !Array.isArray(config.teamIds)) throw new Error('批量战队格式无效');
        const names = action.newTeamNames.map(v => str(v, 80).trim()).filter(Boolean);
        if (new Set(names).size !== names.length) throw new Error('批量战队名称重复');
        if (s.teams.length + names.length > 256) throw new Error('战队库最多支持 256 支战队');
        for (const name of names) {
          const id = randomUUID();
          s.teams.push({ id, name, tag: name.slice(0, 12), color: '#70d7c2', players: [] });
          config.teamIds.push(id);
        }
      }
      const generated = buildTournament(`event-${randomUUID()}`, config, s.teams);
      if (s.schedule.length + generated.matches.length > 10000) throw new Error('赛程库最多支持 10000 场对阵');
      s.tournaments = [...(s.tournaments ?? []), generated.tournament];
      s.schedule.push(...generated.matches);
    } else if (action.type === 'set-tournament-result') {
      const match = s.schedule.find(m => m.id === action.matchId && m.tournament);
      if (!match?.tournament || !['ready', 'complete'].includes(match.tournament.state)) throw new Error('该对阵尚未确定双方');
      if (s.gameResults?.some(r => r.matchId === match.id)) throw new Error('此场已有逐局归档，请在赛后收尾中纠正单局胜方');
      if (s.match.seriesId === `live:schedule:${match.id}` && ['live', 'draft'].includes(s.phase)) throw new Error('当前对局正在进行，请完成赛后归档后处理赛果');
      const blue = action.blueScore, red = action.redScore, target = winTarget(match.format);
      if (typeof blue !== 'number' || typeof red !== 'number' || !Number.isInteger(blue) || !Number.isInteger(red) || Math.min(blue, red) < 0 || Math.max(blue, red) !== target || Math.min(blue, red) >= target) throw new Error(`请填写已结束的 ${match.format} 比分，胜方需达到 ${target} 胜`);
      const reason = str(action.reason, 300).trim(); if (!reason) throw new Error('请填写补录或修订原因');
      const t = s.tournaments!.find(t => t.id === match.tournament!.tournamentId)!;
      t.history.push({ at: new Date().toISOString(), matchId: match.id, reason, before: [match.blueScore, match.redScore], after: [blue, red] });
      match.tournament.manualResult = { blue, red, reason, at: new Date().toISOString() };
    } else if (action.type === 'update-tournament') {
      const t = s.tournaments?.find(t => t.id === action.tournamentId); if (!t) throw new Error('赛事不存在');
      if (action.name !== undefined) {
        const name = str(action.name, 100).trim(); if (!name) throw new Error('赛事名称不能为空');
        for (const m of s.schedule.filter(m => m.tournament?.tournamentId === t.id)) m.title = name + m.title.slice(t.config.name.length);
        t.config.name = name;
      }
      if (action.assetIds !== undefined) {
        if (!Array.isArray(action.assetIds) || action.assetIds.length > 500 || action.assetIds.some(id => !s.assets.some(a => a.id === id))) throw new Error('请选择素材库中已上传的图片');
        t.assetIds = [...new Set(action.assetIds)] as string[];
        t.assets = structuredClone(s.assets.filter(asset => t.assetIds.includes(asset.id)));
      }
    } else if (action.type === 'reschedule-tournament-match') {
      const match = s.schedule.find(m => m.id === action.matchId && m.tournament);
      if (!match) throw new Error('对阵不存在');
      const date = str(action.scheduledAt, 60); if (!Number.isFinite(Date.parse(date))) throw new Error('开赛时间无效');
      if (!['BO1', 'BO3', 'BO5', 'BO7'].includes(String(action.format))) throw new Error('赛制需为 BO1、BO3、BO5 或 BO7');
      if (action.format !== match.format && (match.status !== 'scheduled' || s.gameResults?.some(r => r.matchId === match.id) || s.match.seriesId === `live:schedule:${match.id}`)) throw new Error('已载入或开始的对阵保留原有局数');
      match.scheduledAt = date; match.format = String(action.format);
    } else if (action.type === 'retry-game-archive') {
      const result = s.gameResults?.find(r => r.id === action.resultId);
      if (!result?.sourceGameId) throw new Error('该记录尚无可确认的游戏对局 ID');
      result.archive ??= { sources: {} };
      for (const key of ['eog', 'details', 'timeline'] as const) if (result.archive.sources[key]?.status !== 'saved') result.archive.sources[key] = { status: 'pending', attempts: 0 };
    }
    advanceTournaments(s, true);
  } catch (e) { throw new ValidationError(e instanceof Error ? e.message : '赛事操作失败'); }
}
