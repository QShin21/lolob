import type { BroadcastState, Match, Player, Team } from './types';
/** Stable semantic targets; selectors remain owned by the renderer. */
export const APPEARANCE_TARGETS = {
  "lineupName": ".rl-info > .fit-name",
  "lineupCardBlue": ".rl-card.blue",
  "lineupCardRed": ".rl-card.red",
  "lineupTeam": ".rl-tag",
  "lineupScoreBlue": ".rl-score.blue",
  "lineupScoreRed": ".rl-score.red",
  "lineupGame": ".rl-game",
  "lineupCaption": ".rl-caption",
  "lineupFooter": ".rune-lineup footer",
  "draftName": ".cast-draft-player,.fhd-picks article > strong",
  "draftTeam": ".arena-draft-center-team",
  "draftTimer": ".cast-draft-timer",
  "liveName": ".lb-player-name",
  "liveNameplate": ".lb-nameplate",
  "liveScoreboard": ".lb-scoreboard",
  "reportName": ".pr-card > .fit-name,.pr-gold-label > .fit-name,.ag-damage-name > strong",
  "reportKda": ".pr-kda",
  "reportHeadingBlue": ".pr-table-heading:not(.red)",
  "reportHeadingRed": ".pr-table-heading.red",
  "reportTeam": ".pr-header > strong",
  "reportGame": ".pr-header small",
  "reportCaption": ".pr-caption",
  "reportMetric": ".pr-metrics",
  "reportGoldLabel": ".pr-gold-label",
  "scheduleTeam": ".arena-schedule-team",
  "scheduleScore": ".arena-schedule-score",
  "scheduleTime": ".arena-schedule-time",
  "countdownNumber": ".arena-countdown-number",
  "countdownMessage": ".arena-countdown-message",
  "interviewName": ".cast-interview-name",
  "ticker": ".cast-ticker",
  "analysisHeading": ".arena-analysis-heading",
  "analysisPanel": ".broadcast-analysis",
  "analysisName": ".ba-player-data strong",
  "analysisValue": ".ba-player-data b",
  "globalScoreboard": ".ba-global-scoreboard",
  "eventAnnouncement": ".ba-announcement",
  "lFrameRoster": ".llf-rosters",
  "lFrameFooter": ".llf-footer",
  "reportChampion": ".pr-champion-text,.ag-champion-text",
  "inhibitorLabel": ".ba-inhibitors > div > span",
  "inhibitorTime": ".ba-inhibitors > div > b",
  "championTabName": ".ct-details > strong",
  "lFrameName": ".llf-team article strong",
  "fearlessLane": ".ag-fearless-lane",
  "fearlessChampion": ".ag-fearless-champion",
  "patchText": ".lb-patch > b"
} as const;
export const APPEARANCE_PROPERTIES = ['color', 'backgroundColor', 'borderColor', 'font', 'fontSize', 'fontWeight', 'letterSpacing', 'x', 'y', 'scale', 'opacity', 'text'] as const;
export type ElementAppearance = {color?: string; backgroundColor?: string; borderColor?: string; font?: 'default' | 'modern' | 'serif'; fontSize?: number; fontWeight?: number; letterSpacing?: number; x?: number; y?: number; scale?: number; opacity?: number; text?: string};
export const TEXT_APPEARANCE_TARGETS = ['lineupName', 'lineupTeam', 'lineupGame', 'lineupCaption', 'lineupFooter', 'draftName', 'liveName', 'countdownMessage', 'interviewName', 'ticker', 'reportName', 'reportKda', 'reportTeam', 'reportGame', 'reportCaption', 'reportGoldLabel', 'scheduleTeam', 'scheduleScore', 'scheduleTime', 'analysisHeading', 'analysisName', 'analysisValue', 'lFrameFooter', 'reportChampion', 'inhibitorLabel', 'inhibitorTime', 'championTabName', 'lFrameName', 'fearlessLane', 'fearlessChampion', 'patchText'] as const;
export type TextAppearanceTarget = typeof TEXT_APPEARANCE_TARGETS[number];
export const STYLE_TEXT_FIELDS = { matchTitle: '比赛标题', matchSubtitle: '比赛副标题', game: '当前局号', format: '赛制', blueTeamName: '蓝方队名', redTeamName: '红方队名', blueScore: '蓝方比分', redScore: '红方比分', teamName: '当前队名', teamTag: '当前队伍简称', playerName: '当前选手姓名', playerRole: '当前选手位置', championName: '当前英雄名称', lane: '所在分路', timer: '当前位置计时', value: '当前位置数值', label: '当前位置标题', scheduledAt: '赛程时间（北京时间）', matchStatus: '赛程状态', patch: '游戏版本', kills: '选手击杀', deaths: '选手死亡', assists: '选手助攻' } as const;
export const STYLE_TEXT_PATTERN = `^(?:[^{}]|\\{(?!\\{)|\\}(?!\\})|\\{\\{\\s*(?:${Object.keys(STYLE_TEXT_FIELDS).join('|')})\\s*\\}\\})*$`;
export function validateStyleText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 240 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('文字模板最多 240 字符');
  const rest = value.replace(/\{\{([^{}]*)\}\}/g, (_whole, field: string) => { if (!Object.hasOwn(STYLE_TEXT_FIELDS, field.trim())) throw new Error(`不支持的动态字段：${field}`); return ''; });
  if (/\{\{|\}\}/.test(rest)) throw new Error('动态字段请使用 {{字段名}}');
  if (!new RegExp(STYLE_TEXT_PATTERN, 'u').test(value)) throw new Error('动态字段请使用 {{字段名}}，避免嵌套花括号');
  return value;
}
export type StyleTextContext = { player?: Player; team?: Team; match?: Partial<BroadcastState['match']> & Partial<Match>; lane?: string; timer?: string; value?: string; label?: string; championName?: string; game?: number };
export function resolveStyleText(template: string, state: BroadcastState, context: StyleTextContext = {}): string {
  validateStyleText(template);
  const player = Object.hasOwn(context, 'player') ? context.player : state.players.find(p => p.id === state.selectedPlayerId);
  const match = context.match ? { ...context.match, subtitle: context.match.subtitle ?? '', game: context.match.game ?? '' } : state.match;
  const team = Object.hasOwn(context, 'team') ? context.team : (player ? state.teams.find(t => t.id === match[player.team === 'blue' ? 'blueTeamId' : 'redTeamId']) : undefined);
  const scheduledAt = context.match?.scheduledAt;
  const values: Record<keyof typeof STYLE_TEXT_FIELDS, string | number> = { matchTitle: match.title ?? '', matchSubtitle: match.subtitle ?? '', game: context.game ?? match.game ?? '', format: match.format ?? '', blueTeamName: state.teams.find(t => t.id === match.blueTeamId)?.name ?? '', redTeamName: state.teams.find(t => t.id === match.redTeamId)?.name ?? '', blueScore: match.blueScore ?? '', redScore: match.redScore ?? '', teamName: team?.name ?? '', teamTag: team?.tag ?? '', playerName: player?.name ?? '', playerRole: context.lane ?? player?.role ?? '', championName: context.championName ?? player?.championName ?? '', lane: context.lane ?? player?.role ?? '', timer: context.timer ?? '', value: context.value ?? '', label: context.label ?? '', scheduledAt: scheduledAt && Number.isFinite(Date.parse(scheduledAt)) ? new Date(scheduledAt).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai',hour12:false}) : '', matchStatus: context.match?.status ? ({scheduled:'待开赛',live:'进行中',finished:'已结束'}[context.match.status]) : '', patch: state.overlay.patchVersion ?? state.production?.versions.game ?? '', kills: player?.statsAvailable === false ? '' : player?.kills ?? '', deaths: player?.statsAvailable === false ? '' : player?.deaths ?? '', assists: player?.statsAvailable === false ? '' : player?.assists ?? '' };
  return template.replace(/\{\{([^{}]*)\}\}/g, (_whole, field: string) => String(values[field.trim() as keyof typeof values])).slice(0, 4096);
}
export type StyleAppearance = Partial<Record<keyof typeof APPEARANCE_TARGETS, ElementAppearance | null>>;
export function mergeAppearance(base?: StyleAppearance, scene?: StyleAppearance): StyleAppearance {
  const result = {...base};
  for (const [key, value] of Object.entries(scene ?? {})) {
    const target = key as keyof StyleAppearance;
    result[target] = value === null ? null : {...result[target], ...value};
  }
  return result;
}

export interface EditorHistory<T> { past: T[]; present: T; future: T[]; group?: string }
export function commitEditorHistory<T>(history: EditorHistory<T>, next: T, group?: string): EditorHistory<T> {
  if (JSON.stringify(history.present) === JSON.stringify(next)) return history;
  const grouped = group !== undefined && group === history.group;
  return { past: grouped ? history.past : [...history.past, history.present].slice(-100), present: next, future: [], group };
}
export function stepEditorHistory<T>(history: EditorHistory<T>, direction: 'undo' | 'redo'): EditorHistory<T> {
  if (direction === 'undo') return history.past.length ? { past: history.past.slice(0, -1), present: history.past.at(-1)!, future: [history.present, ...history.future] } : history;
  return history.future.length ? { past: [...history.past, history.present].slice(-100), present: history.future[0], future: history.future.slice(1) } : history;
}
export interface AppearanceRect { left: number; top: number; width: number; height: number }
/** Logical 1920x1080 coordinates; snap the nearest edge or centre independently on each axis. */
export function snapAppearanceRect(rect: AppearanceRect, dx: number, dy: number, peers: AppearanceRect[], tolerance = 8) {
  const axis = (start: number, size: number, delta: number, anchors: number[]) => {
    let distance = tolerance + 1, correction = 0, guide: number | undefined;
    for (const anchor of anchors) for (const point of [start + delta, start + size / 2 + delta, start + size + delta]) {
      const gap = anchor - point;
      if (Math.abs(gap) < distance && Math.abs(gap) <= tolerance) { distance = Math.abs(gap); correction = gap; guide = anchor; }
    }
    return { value: delta + correction, guide };
  };
  const x = axis(rect.left, rect.width, dx, [0, 960, 1920, ...peers.flatMap(p => [p.left, p.left + p.width / 2, p.left + p.width])]);
  const y = axis(rect.top, rect.height, dy, [0, 540, 1080, ...peers.flatMap(p => [p.top, p.top + p.height / 2, p.top + p.height])]);
  return { dx: x.value, dy: y.value, guides: { x: x.guide, y: y.guide } };
}
