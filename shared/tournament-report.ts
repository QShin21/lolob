import type { BroadcastState, GameResult } from './types';
import type { Tournament } from './tournament-types';
import { tournamentStandings } from './tournaments';
import { reportDamage } from './postgame-damage';

export function tournamentResults(s: BroadcastState, t: Tournament): GameResult[] {
  const ids = new Set(s.schedule.filter(m => m.tournament?.tournamentId === t.id).map(m => m.id));
  return (s.gameResults ?? []).filter(r => r.tournamentId === t.id || r.matchId && ids.has(r.matchId));
}
export function tournamentAssets(s: BroadcastState, t: Tournament) {
  const teams = [...t.teams, ...s.teams.filter(team => t.config.teamIds.includes(team.id)), ...tournamentResults(s, t).flatMap(r => r.teams.filter(team => [r.blueTeamId, r.redTeamId].includes(team.id)))];
  const urls = new Set([...teams.flatMap(team => [team.logo, ...team.players.map(p => p.portrait)]), ...tournamentResults(s, t).flatMap(r => r.snapshot.players.map(p => p.portrait))].filter((url): url is string => !!url));
  const assets = [...new Map([...(t.assets ?? []), ...s.assets.filter(a => t.assetIds.includes(a.id) || urls.has(a.url))].map(a => [a.url, a])).values()];
  for (const url of urls) if (!assets.some(a => a.url === url)) assets.push({ id: `reference-${assets.length}`, name: url.split('/').at(-1) ?? '资料图片', url, type: '', createdAt: t.createdAt });
  return assets;
}
export function tournamentReport(s: BroadcastState, t: Tournament) {
  const results = tournamentResults(s, t), matches = s.schedule.filter(m => m.tournament?.tournamentId === t.id);
  type Row = { id: string; teamId: string; name: string; games: number; wins: number; kills: number; deaths: number; assists: number; cs: number; gold: number; damage: number; vision: number; scoreGames: number; goldGames: number; damageGames: number; visionGames: number };
  const players = new Map<string, Row>();
  for (const r of results) for (const p of r.snapshot.players) {
    const teamId = r[`${p.team}TeamId`], id = `${teamId}:${p.registeredPlayerId || p.name}`;
    const row = players.get(id) ?? { id, teamId, name: p.name, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, damage: 0, vision: 0, scoreGames: 0, goldGames: 0, damageGames: 0, visionGames: 0 };
    row.games++; if (r.winnerTeamId === teamId) row.wins++;
    if (p.statsAvailable !== false) { row.scoreGames++; row.kills += p.kills; row.deaths += p.deaths; row.assists += p.assists; row.cs += p.cs; }
    if (p.gold !== null) { row.gold += p.gold; row.goldGames++; }
    const damage = reportDamage(p, 'damageDealt'); if (damage != null) { row.damage += damage; row.damageGames++; }
    if (p.visionScore !== undefined) { row.vision += p.visionScore; row.visionGames++; }
    players.set(id, row);
  }
  return { results, matches, standings: tournamentStandings(t, matches), groups: t.groups.map(g => ({ ...g, standings: tournamentStandings(t, matches, g.id) })), players: [...players.values()].sort((a, b) => b.games - a.games || b.kills - a.kills),
    completed: matches.filter(m => m.tournament!.state === 'complete').length,
    actual: matches.filter(m => !['bye', 'skipped'].includes(m.tournament!.state)).length,
    assets: tournamentAssets(s, t) };
}
export function tournamentCsv(s: BroadcastState, t: Tournament): string {
  const data = tournamentReport(s, t), teamName = (id: string) => t.teams.find(team => team.id === id)?.name ?? s.teams.find(team => team.id === id)?.name ?? id;
  const rows: unknown[][] = [['赛事', t.config.name], ['积分规则', '胜 3 分；负 0 分；瑞士轮轮空 3 分'], ['排序规则', t.config.format === 'swiss' ? '积分、对手积分和、净胜局、胜局、两队相互战绩、种子顺序' : '积分、净胜局、胜局、两队相互战绩、种子顺序'], [], ['战队', '排名', '场次', '胜', '负', '积分', '胜局', '负局', '对手积分和', '轮空'], ...data.standings.map(r => [teamName(r.teamId), r.rank, r.played, r.wins, r.losses, r.points, r.gameWins, r.gameLosses, r.buchholz, r.byes]), [], ['逐局选手数据'], ['对阵', '局号', '对局 ID', '战队', '选手', '位置', '英雄', '胜方', '击杀', '死亡', '助攻', '补刀', '金币', '英雄伤害', '承受伤害', '视野得分', '装备', '符文', '终局完整']];
  for (const r of data.results) for (const p of r.snapshot.players) rows.push([r.match.title, r.game, r.sourceGameId, teamName(r[`${p.team}TeamId`]), p.name, p.role, p.championName, r.winnerTeamId ? teamName(r.winnerTeamId) : '待确认', ...(['kills', 'deaths', 'assists', 'cs'] as const).map(k => p.statsAvailable === false ? '' : p[k]), p.gold, reportDamage(p, 'damageDealt'), reportDamage(p, 'damageTaken'), p.visionScore, JSON.stringify(p.itemSlots ?? p.items), JSON.stringify(p.fullRuneIds ?? p.runeIds ?? p.runes ?? []), r.terminalSampleComplete ? '是' : '含缺失']);
  const quote = (value: unknown) => { let text = String(value ?? ''); if (/^\s*[=+@\-\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
  return '\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n');
}
