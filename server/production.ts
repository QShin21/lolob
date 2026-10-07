import { randomUUID } from 'node:crypto';
import type { BroadcastState, Side } from '../shared/types';
import type { ProductionCommand } from '../shared/production-types';
import { captureProgram, checkFingerprint, checkValid, ensureProduction, preserveProgram, productionKey, requestApplication, returnToGame, dataHealth } from '../shared/production';
import { currentGameResult } from '../shared/game-results';
import { syncResultRecording } from './game-results';
import { record, str, ValidationError, fallbackChampions } from './state';

const roles = ['上单', '打野', '中单', '下路', '辅助'];
const numeric = (v: unknown, min: number, max: number) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new ValidationError('制作参数超出范围'); return v; };
const reason = (v: unknown) => { if(typeof v!=='string'||!v.trim())throw new ValidationError('请填写操作理由');return str(v,300).trim(); };
export function audit(s: BroadcastState, type: string, actor = '主机导播', note?: string): void {
  const p = ensureProduction(s);
  p.audit.push({ id: randomUUID(), type, actor, at: new Date().toISOString(), ...(note ? { reason: note } : {}) });
  p.audit = p.audit.slice(-1000);
}
export function updateAlerts(s: BroadcastState, category: string, issues: string[]): boolean {
  const p=ensureProduction(s), alerts=p.alerts??=[], now=new Date().toISOString();let changed=false;
  for(const alert of alerts)if(alert.category===category&&!alert.resolvedAt&&!issues.includes(alert.text)){alert.resolvedAt=now;changed=true;}
  for(const text of new Set(issues))if(!alerts.some(a=>a.category===category&&a.text===text&&!a.resolvedAt)){alerts.push({id:randomUUID(),category,text,at:now});changed=true;}
  p.alerts=alerts.slice(-100);return changed;
}
export function applyProduction(s: BroadcastState, raw: unknown, actor = '主机导播'): void {
  const c = record(raw) as unknown as ProductionCommand;
  const p = ensureProduction(s);
  switch (c.op) {
    case 'check': {
      if (!['identity', 'game', 'data', 'audio', 'disk', 'program', 'platform'].includes(c.id)) throw new ValidationError('检查项目无效');
      if (c.id === 'data' && s.mode === 'live' && (s.players.length !== 10 || s.awaitingNextGame)) throw new ValidationError('本局十人样本尚未就绪');
      p.checks[c.id] = { fingerprint: checkFingerprint(s, c.id), actor, at: new Date().toISOString(), note: str(c.note ?? '人工核对', 300) };
      break;
    }
    case 'rules': {
      const r = record(c.rules);
      if (!['standard', 'fearless', 'custom'].includes(String(r.mode)) || !['all', 'team'].includes(String(r.scope)) || !['discard', 'retain'].includes(String(r.remakeHistory))) throw new ValidationError('赛事规则无效');
      if (!Array.isArray(r.exceptionGames) || r.exceptionGames.length > 99) throw new ValidationError('例外局配置无效');
      r.exceptionGames.forEach(v => { if (!Number.isInteger(numeric(v, 1, 99))) throw new ValidationError('例外局号须为整数'); });
      if (r.exceptionGames.length) reason(c.reason);
      p.rules = structuredClone(r) as unknown as typeof p.rules;
      break;
    }
    case 'draft-mode': {
      if (!['auto', 'manual', 'compare'].includes(c.mode)) throw new ValidationError('BP 接管模式无效');
      if (c.mode === 'auto' && p.draftMode !== 'auto' && p.clientDraft) {
        if (c.resolution !== 'client') throw new ValidationError('请核对客户端差异，再选择使用客户端样本恢复自动');
        s.draft = structuredClone(p.clientDraft.draft); s.players = structuredClone(p.clientDraft.players);
      }
      p.draftMode = c.mode;
      break;
    }
    case 'draft-undo': case 'draft-clear': {
      reason(c.reason); p.draftMode = 'manual';
      if (c.op === 'draft-undo') { const previous = p.draftUndo.pop(); if (!previous) throw new ValidationError('没有可回退的 BP 操作'); s.draft = previous; }
      else { p.draftUndo.push(structuredClone(s.draft)); s.draft = { bluePicks: [], redPicks: [], blueBans: [], redBans: [], timer: 0, activeTeam: 'blue', action: '人工 BP' }; }
      delete s.draftHistoryPending;
      s.draftHistory = s.draftHistory?.filter(h => h.seriesId !== s.match.seriesId || h.game !== s.match.game);
      break;
    }
    case 'assign': {
      if (!Array.isArray(c.assignments) || c.assignments.length > 10) throw new ValidationError('阵容映射最多十人');
      const seen = new Set<string>(), champions = new Set<string>(), lanes = new Set<string>();
      const assignments = c.assignments.map(value => {
        const a = record(value), id = str(a.playerId, 150), championId = str(a.championId, 64), role = str(a.role, 30);
        const player = s.players.find(player => player.id === id && player.team === a.team);
        if (!player || !roles.includes(role) || typeof a.locked !== 'boolean' || !['blue', 'red'].includes(String(a.team))) throw new ValidationError('阵容映射含无效选手或分路');
        if (!s.draft[`${player.team}Picks`].includes(championId)) throw new ValidationError('英雄须来自该战队已锁定的选择');
        if (seen.has(id) || champions.has(championId) || lanes.has(`${a.team}:${role}`)) throw new ValidationError('选手、英雄或分路映射重复');
        seen.add(id); champions.add(championId); lanes.add(`${a.team}:${role}`);
        return { playerId: id, championId, role, team: player.team, locked: a.locked };
      });
      p.assignments = assignments;
      for (const a of assignments) if (a.locked) Object.assign(s.players.find(player => player.id === a.playerId)!, { championId: a.championId, championName: fallbackChampions().find(v=>v.id===a.championId||String(v.key)===a.championId)?.name??a.championId, role: a.role });
      break;
    }
    case 'pause':
      if (!['official', 'signal', 'replay'].includes(c.kind)) throw new ValidationError('暂停类型无效');
      p.pause = { kind: c.kind, reason: reason(c.reason), at: new Date().toISOString(), actor }; p.feedHold = true; break;
    case 'resume':
      reason(c.reason);
      if (s.mode === 'live' && (!checkValid(s, 'identity') || !checkValid(s, 'game') || !checkValid(s, 'audio') || !checkValid(s, 'data'))) throw new ValidationError('恢复前请核对身份、游戏来源、声音和本局有效样本');
      if (s.mode === 'live' && (dataHealth(s).stats !== 10 || s.connections.live.status !== 'connected' || s.awaitingNextGame)) throw new ValidationError('本局样本未恢复，请取得新鲜的十人统计后继续');
      delete p.pause; p.entry = 'verify'; break;
    case 'accept-final': {
      const result = currentGameResult(s); if (!result) throw new ValidationError('本局尚无结果');
      reason(c.reason); result.terminalSampleAccepted = true; syncResultRecording(s, result); break;
    }
    case 'remake': {
      const note = reason(c.reason); preserveProgram(s);
      const result = currentGameResult(s);
      if(result){if(result.snapshot.result)Object.assign(result.snapshot.result,{valid:false,invalidReason:note});const recording=s.recordings.find(v=>v.id===result.snapshot.id);if(recording?.result)Object.assign(recording.result,{valid:false,invalidReason:note});}
      p.invalidAttempts.push({ key: productionKey(s), reason: note, at: new Date().toISOString(), draft: structuredClone(s.draft), ...(result ? { result: structuredClone(result) } : {}) });
      if (result) { s.gameResults = s.gameResults?.filter(r => r.id !== result.id); recalculateScores(s); }
      if (p.rules.remakeHistory === 'discard') s.draftHistory = s.draftHistory?.filter(h => h.seriesId !== s.match.seriesId || h.game !== s.match.game);
      p.attempt++; p.assignments = []; p.checks = {}; p.entry = 'bp'; delete p.clientDraft;
      const gate = { sourceGameId: s.activeSourceGameId, rosterFingerprint: JSON.stringify(s.players.map(v => [v.id, v.team, v.championId]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))), gameTime: s.gameTime };
      delete s.finishedGameId; delete s.activeSourceGameId; delete s.draftHistoryPending;
      s.awaitingNextGame = gate; s.players = []; s.gameTime = 0; s.events = []; s.economy = []; delete s.economyFeed; delete s.gameClock;
      s.stats = { blue: { kills: 0, gold: null, towers: 0, dragons: 0, barons: 0 }, red: { kills: 0, gold: null, towers: 0, dragons: 0, barons: 0 } };
      s.phase = 'pregame'; s.paused = false; s.previewScene = 'draft';
      if (p.rules.remakeHistory === 'discard') s.draft = { bluePicks: [], redPicks: [], blueBans: [], redBans: [], timer: 0, activeTeam: 'blue', action: '等待重赛 BP' };
      break;
    }
    case 'mark':
      if (!['highlight', 'danger', 'objective'].includes(c.kind)) throw new ValidationError('标记类型无效');
      p.marks.push({ id: randomUUID(), key: productionKey(s), time: s.gameTime, at: new Date().toISOString(), text: reason(c.text), type: c.kind }); break;
    case 'objective': {
      const label = reason(c.label), note = reason(c.reason);
      if (c.dueTime !== undefined) { numeric(c.dueTime, s.gameTime, 86400);const clock=s.gameClock;if(!p.versions.game.trim()||!clock||clock.awaitingLiveSample||Date.now()-Date.parse(clock.sampledAt)>clock.validForMs)throw new ValidationError('资源倒计时需填写本场游戏版本并取得有效游戏时钟'); }
      p.objectives.push({ id: randomUUID(), key: productionKey(s), label, gameTime: s.gameTime, dueTime: c.dueTime, reason: note, clockSession: s.gameClock?.sessionId, discontinuity: s.gameClock?.discontinuity, gameVersion:p.versions.game }); break;
    }
    case 'objective-rules':
      if (!Array.isArray(c.rules) || c.rules.length > 20) throw new ValidationError('资源规则格式无效');
      p.objectiveRules = c.rules.map(r => ({ label: reason(r.label), respawnSeconds: numeric(r.respawnSeconds, 1, 86400) })); break;
    case 'settings': {
      if (c.analysisSeconds !== undefined) p.analysisSeconds = numeric(c.analysisSeconds, 3, 120);
      for (const key of ['feedHold', 'dynamicPreview'] as const) if (c[key] !== undefined) { if (typeof c[key] !== 'boolean') throw new ValidationError('制作开关须为布尔值'); p[key] = c[key]!; }
      if (c.layout !== undefined) { if (!['single', 'dual'].includes(c.layout)) throw new ValidationError('屏幕布局无效'); p.layout = c.layout; }
      if (c.versions) { const v = record(c.versions); p.versions = { game: str(v.game, 30), resources: str(v.resources, 30), ocr: str(v.ocr, 60) }; }
      if (c.hotkeys) { const hotkeys = record(c.hotkeys), values = Object.values(hotkeys); if (values.length !== 6 || new Set(values).size !== 6 || values.some(v => typeof v !== 'string' || !/^(Control\+Shift\+[A-Z]|Control\+Enter|Alt\+Shift\+[A-Z])$/.test(v))) throw new ValidationError('快捷键须为互不重复的明确组合键'); p.hotkeys = { take: str(hotkeys.take, 40), live: str(hotkeys.live, 40), analysis: str(hotkeys.analysis, 40), feeds: str(hotkeys.feeds, 40), emergency: str(hotkeys.emergency, 40), undo: str(hotkeys.undo, 40) }; }
      if (c.cameraHints !== undefined) p.cameraHints = str(c.cameraHints, 500);
      if (c.keyboardTarget !== undefined) { if (!['game','workbench'].includes(c.keyboardTarget)) throw new ValidationError('键盘控制对象无效'); p.keyboardTarget = c.keyboardTarget; }
      break;
    }
    case 'immediate': {
      if (!p.program) p.program = captureProgram(s);
      if (c.action === 'live' || c.action === 'analysis-off') returnToGame(s);
      else if (c.action === 'feeds-off') { p.program.overlay.playerFeedPairs = Array.from({ length: 5 }, () => ({ blue: { mode: 'off', imageUrl: '', cameraDeviceId: '', label: '' }, red: { mode: 'off', imageUrl: '', cameraDeviceId: '', label: '' } })); p.feedHold = true; }
      else if (c.action === 'ticker') { p.program.overlay.ticker = !!c.text?.trim(); p.program.overlay.tickerText = str(c.text ?? '', 500); }
      else if (c.action === 'undo') { if (!p.previousProgram) throw new ValidationError('没有可撤回的人工切换'); const previous = p.previousProgram; preserveProgram(s); p.previousProgram = { content: structuredClone(p.program), scene: s.programScene }; p.program = previous.content; s.programScene = previous.scene; delete p.playingClipId; }
      else throw new ValidationError('应急操作无效');
      if (!['live','analysis-off'].includes(c.action)) requestApplication(s);
      break;
    }
    case 'confirm-picture':
      if (!p.application || !['applied','confirmed'].includes(p.application.status)) throw new ValidationError('来源尚未成功应用');
      p.application.status = 'confirmed'; p.application.detail = `${actor} 已核对节目画面`; break;
    case 'ack-alert': {
      const alert = p.alerts?.find(a => a.id === c.id); if (!alert) throw new ValidationError('告警不存在');
      alert.acknowledgedAt = new Date().toISOString(); break;
    }
    case 'rundown':
      if (!Array.isArray(c.items) || c.items.length > 50) throw new ValidationError('待播队列最多五十项');
      p.rundown = c.items.map(item => { const v = record(item); if (!['standby','draft','lineup','live','economy','ranking','schedule','postgame','interview','teamfight','gold-ranking'].includes(String(v.scene)) || !['pending','ready','aired'].includes(String(v.status))) throw new ValidationError('待播项目无效'); return { id: str(v.id, 80), scene: v.scene as typeof item.scene, title: str(v.title, 150), seconds: numeric(v.seconds, 0, 3600), status: v.status as typeof item.status }; }); break;
    default: throw new ValidationError('制作操作无效');
  }
  p.marks = p.marks.slice(-1000); p.objectives = p.objectives.slice(-200); p.draftUndo = p.draftUndo.slice(-30);
  audit(s, `production:${c.op}`, actor, 'reason' in c ? String(c.reason) : undefined);
}
export function recalculateScores(s: BroadcastState): void {
  const p = ensureProduction(s), series = s.gameResults?.filter(r => r.seriesId === s.match.seriesId).sort((a, b) => a.game - b.game) ?? [];
  p.scores = { ...p.baseScores };
  for (const r of series) {
    if (r.winnerTeamId) p.scores[r.winnerTeamId] = (p.scores[r.winnerTeamId] ?? 0) + 1;
    r.match.blueScore = p.scores[r.blueTeamId] ?? 0; r.match.redScore = p.scores[r.redTeamId] ?? 0;
    const count = Number(r.match.format.match(/^BO(\d+)$/i)?.[1]);
    r.seriesComplete = count > 0 && Math.max(r.match.blueScore, r.match.redScore) >= Math.floor(count / 2) + 1;
    const m = s.schedule.find(m => m.id === r.matchId);
    if (m) { m.blueScore = p.scores[m.blueTeamId] ?? 0; m.redScore = p.scores[m.redTeamId] ?? 0; m.status = r.seriesComplete ? 'finished' : 'live'; }
    syncResultRecording(s, r);
  }
  s.match.blueScore = p.scores[s.match.blueTeamId] ?? 0; s.match.redScore = p.scores[s.match.redTeamId] ?? 0;
}
export function correctResult(s: BroadcastState, input: Record<string, unknown>, actor = '主机导播'): void {
  const r = s.gameResults?.find(r => r.id === input.resultId && r.seriesId === s.match.seriesId);
  if (!r || !['blue', 'red'].includes(String(input.winner))) throw new ValidationError('本系列赛结果或胜方无效');
  const note = reason(input.reason), p = ensureProduction(s), winner = input.winner as Side;
  p.corrections.push({ resultId: r.id, before: r.winner, after: winner, reason: note, at: new Date().toISOString(), actor, version: p.corrections.filter(c => c.resultId === r.id).length + 1 });
  r.winner = winner; r.winnerTeamId = r[`${winner}TeamId`];
  recalculateScores(s); audit(s, 'correct-result', actor, note);
}
