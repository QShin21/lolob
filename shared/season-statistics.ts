import type { BroadcastState, GameResult, Player } from './types';
import { reportDamage } from './postgame-damage';

export const seasonMetricLabels = {
  kda: 'KDA', winRate: '胜率', kills: '场均击杀', assists: '场均助攻', cs: '场均补刀',
  gold: '场均金币', damage: '场均英雄伤害', damagePerMinute: '每分钟英雄伤害',
  vision: '场均视野得分', killParticipation: '参团率', damageShare: '队内伤害占比', games: '出场局数',
} as const;
export type SeasonMetric = keyof typeof seasonMetricLabels;
export interface SeasonPlayer {
  id: string; name: string; teamId: string; teamName: string; portrait?: string;
  games: number; wins: number; resolvedGames: number; scoreGames: number; goldGames: number;
  damageGames: number; visionGames: number; contributionGames: number; damageShareGames: number;
  kills: number; deaths: number; assists: number; cs: number; gold: number; damage: number; vision: number;
  kda: number | null; winRate: number | null; killParticipation: number | null; damageShare: number | null;
  damagePerMinute: number | null;
  championPool: { id: string; name: string; games: number; wins: number; resolvedGames: number; winRate: number | null }[];
}
export interface SeasonChampion {
  id: string; name: string; picks: number; bans: number; presence: number;
  wins: number; resolvedPicks: number; pickRate: number | null; banRate: number | null; presenceRate: number | null; winRate: number | null;
}
export interface SeasonHeadToHead {
  teamA: string; teamB: string; nameA: string; nameB: string;
  games: number; winsA: number; winsB: number; unresolved: number;
  matches: number; matchWinsA: number; matchWinsB: number;
}
export interface SeasonStatisticsData {
  title: string; games: number; resolvedGames: number; results: GameResult[];
  draftCoverage: { picks: number; bans: number; complete: number };
  players: SeasonPlayer[]; champions: SeasonChampion[]; headToHead: SeasonHeadToHead[];
}

const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const ratio = (n: number, d: number): number | null => d > 0 ? n / d : null;
function winner(r: GameResult): string | undefined {
  if (r.winnerTeamId === r.blueTeamId || r.winnerTeamId === r.redTeamId) return r.winnerTeamId;
  return r.winner ? r[`${r.winner}TeamId`] : undefined;
}
function scores(p: Player): boolean { return p.statsAvailable !== false && [p.kills, p.deaths, p.assists, p.cs].every(valid); }
const identity = (p: Player) => p.registeredPlayerId || p.name.trim() || p.id;

/** Archive-only statistics: invalid attempts, pending games and duplicate archives never inflate totals. */
export function seasonStatistics(state: BroadcastState, tournamentId?: string): SeasonStatisticsData {
  const tournament = state.tournaments?.find(t => t.id === tournamentId);
  const matches = state.schedule.filter(m => !tournamentId || m.tournament?.tournamentId === tournamentId);
  const matchIds = new Set(matches.map(m => m.id));
  const invalidIds = new Set(state.production?.invalidAttempts.flatMap(a => a.result ? [a.result.id] : []) ?? []);
  const invalidKeys = new Set(state.production?.invalidAttempts.map(a => a.key) ?? []);
  const archives = new Map<string, GameResult>();
  for (const r of state.gameResults ?? []) {
    if (r.snapshot.result?.valid === false || invalidIds.has(r.id) || invalidKeys.has(r.key)) continue;
    if (tournamentId && r.tournamentId !== tournamentId && (!r.matchId || !matchIds.has(r.matchId))) continue;
    archives.set(r.sourceGameId ? `source:${r.sourceGameId}` : r.key || r.id, r);
  }
  const results = [...archives.values()].sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  const teams = new Map([...results.flatMap(r => r.teams), ...(tournament?.teams ?? []), ...state.teams].map(t => [t.id, t]));
  const teamName = (id: string) => teams.get(id)?.name ?? id;
  const players = new Map<string, SeasonPlayer>();
  const champions = new Map<string, SeasonChampion>();
  const draftCoverage = { picks: 0, bans: 0, complete: 0 };
  const headToHead = new Map<string, SeasonHeadToHead>();
  const perMinute = new Map<string, { damage: number; seconds: number }>();
  const contribution = new Map<string, { involved: number; kills: number; shareSum: number }>();
  const getChampion = (id: string, name?: string) => {
    let c = champions.get(id);
    if (!c) { c = { id, name: name || id, picks: 0, bans: 0, presence: 0, wins: 0, resolvedPicks: 0, pickRate: 0, banRate: 0, presenceRate: 0, winRate: null }; champions.set(id, c); }
    if (name) c.name = name;
    return c;
  };
  const getPair = (a: string, b: string) => {
    if (!a || !b || a === b) return;
    const [teamA, teamB] = [a, b].sort(), key = JSON.stringify([teamA, teamB]);
    let h = headToHead.get(key);
    if (!h) { h = { teamA, teamB, nameA: teamName(teamA), nameB: teamName(teamB), games: 0, winsA: 0, winsB: 0, unresolved: 0, matches: 0, matchWinsA: 0, matchWinsB: 0 }; headToHead.set(key, h); }
    return h;
  };
  for (const r of results) {
    const won = winner(r), pair = getPair(r.blueTeamId, r.redTeamId);
    if (pair) { pair.games++; if (won === pair.teamA) pair.winsA++; else if (won === pair.teamB) pair.winsB++; else pair.unresolved++; }
    const seen = new Set<string>();
    for (const p of r.snapshot.players) {
      const teamId = r[`${p.team}TeamId`];
      const id = JSON.stringify([teamId, identity(p)]);
      if (seen.has(id)) continue;
      seen.add(id);
      let row = players.get(id);
      if (!row) {
        row = { id, name: p.name, teamId, teamName: teamName(teamId), portrait: p.portrait, games: 0, wins: 0, resolvedGames: 0,
          scoreGames: 0, goldGames: 0, damageGames: 0, visionGames: 0, contributionGames: 0, damageShareGames: 0,
          kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, damage: 0, vision: 0,
          kda: null, winRate: null, killParticipation: null, damageShare: null, damagePerMinute: null, championPool: [] };
        players.set(id, row);
      }
      row.name = p.name; if (p.portrait) row.portrait = p.portrait;
      row.games++; if (won) row.resolvedGames++; if (won === teamId) row.wins++;
      if (scores(p)) { row.scoreGames++; row.kills += p.kills; row.deaths += p.deaths; row.assists += p.assists; row.cs += p.cs; }
      if (valid(p.gold)) { row.gold += p.gold; row.goldGames++; }
      const damage = reportDamage(p, 'damageDealt');
      if (valid(damage)) {
        row.damage += damage; row.damageGames++;
        const duration = r.snapshot.sourceGameTime ?? r.snapshot.duration;
        if (valid(duration) && duration > 0) { const time = perMinute.get(id) ?? { damage: 0, seconds: 0 }; time.damage += damage; time.seconds += duration; perMinute.set(id, time); }
      }
      if (valid(p.visionScore)) { row.vision += p.visionScore; row.visionGames++; }
      const allies = r.snapshot.players.filter(a => a.team === p.team);
      const fullRoster = allies.length === 5 && new Set(allies.map(identity)).size === 5;
      const sums = contribution.get(id) ?? { involved: 0, kills: 0, shareSum: 0 };
      if (fullRoster && allies.every(scores)) {
        const kills = allies.reduce((n, a) => n + a.kills, 0);
        if (kills > 0) { sums.involved += p.kills + p.assists; sums.kills += kills; row.contributionGames++; }
      }
      const allyDamage = allies.map(a => reportDamage(a, 'damageDealt'));
      if (fullRoster && valid(damage) && allyDamage.every(valid)) {
        const total = allyDamage.reduce<number>((n, d) => n + d!, 0);
        if (total > 0) { sums.shareSum += damage / total; row.damageShareGames++; }
      }
      contribution.set(id, sums);
      if (p.championId) {
        let pool = row.championPool.find(c => c.id === p.championId);
        if (!pool) { pool = { id: p.championId, name: p.championName || p.championId, games: 0, wins: 0, resolvedGames: 0, winRate: null }; row.championPool.push(pool); }
        pool.games++; if (won) pool.resolvedGames++; if (won === teamId) pool.wins++;
        getChampion(p.championId, p.championName);
      }
    }
    const present = new Set<string>();
    const picksBySide = (['blue', 'red'] as const).map(side => {
      const drafted = r.draft[`${side}Picks`].filter(Boolean);
      return new Set(drafted.length ? drafted : r.snapshot.players.filter(p => p.team === side).map(p => p.championId).filter(Boolean));
    });
    const completePicks = picksBySide.every(picks => picks.size === 5);
    // A live roster can lock picks without ever observing the ban phase.
    const completeBans = [r.draft.blueBans, r.draft.redBans].every(bans => bans.length === 5 && bans.every(Boolean));
    if (completePicks) draftCoverage.picks++;
    if (completeBans) draftCoverage.bans++;
    if (completePicks && completeBans) draftCoverage.complete++;
    for (const side of ['blue', 'red'] as const) {
      if (!completePicks) continue;
      for (const id of picksBySide[side === 'blue' ? 0 : 1]) { const c = getChampion(id); c.picks++; if (won) c.resolvedPicks++; if (won === r[`${side}TeamId`]) c.wins++; present.add(id); }
    }
    if (completeBans) for (const id of new Set([...r.draft.blueBans, ...r.draft.redBans].filter(Boolean))) { getChampion(id).bans++; present.add(id); }
    if (completePicks && completeBans) for (const id of present) getChampion(id).presence++;
  }
  for (const m of matches) {
    if (m.status !== 'finished' || m.blueScore === m.redScore || m.tournament && m.tournament.state !== 'complete') continue;
    const h = getPair(m.blueTeamId, m.redTeamId); if (!h) continue;
    h.matches++; const won = m.blueScore > m.redScore ? m.blueTeamId : m.redTeamId;
    if (won === h.teamA) h.matchWinsA++; else h.matchWinsB++;
  }
  for (const row of players.values()) {
    row.kda = row.scoreGames ? (row.kills + row.assists) / Math.max(1, row.deaths) : null;
    row.winRate = ratio(row.wins, row.resolvedGames);
    const sums = contribution.get(row.id)!;
    row.killParticipation = ratio(sums.involved, sums.kills);
    row.damageShare = ratio(sums.shareSum, row.damageShareGames);
    const time = perMinute.get(row.id); row.damagePerMinute = time ? time.damage / (time.seconds / 60) : null;
    for (const c of row.championPool) c.winRate = ratio(c.wins, c.resolvedGames);
    row.championPool.sort((a, b) => b.games - a.games || a.id.localeCompare(b.id));
  }
  for (const c of champions.values()) {
    c.pickRate = ratio(c.picks, draftCoverage.picks); c.banRate = ratio(c.bans, draftCoverage.bans); c.presenceRate = ratio(c.presence, draftCoverage.complete); c.winRate = ratio(c.wins, c.resolvedPicks);
  }
  return { title: tournament?.config.name ?? (tournamentId ? '指定赛事' : '全部已归档比赛'), games: results.length, resolvedGames: results.filter(r => winner(r)).length, results, draftCoverage,
    players: [...players.values()].sort((a, b) => b.games - a.games || a.id.localeCompare(b.id)),
    champions: [...champions.values()].sort((a, b) => b.presence - a.presence || b.picks - a.picks || a.id.localeCompare(b.id)),
    headToHead: [...headToHead.values()].sort((a, b) => b.games - a.games || a.teamA.localeCompare(b.teamA) || a.teamB.localeCompare(b.teamB)) };
}

export function seasonMetricValue(p: SeasonPlayer, metric: SeasonMetric): number | null {
  switch (metric) {
    case 'kills': case 'assists': case 'cs': return ratio(p[metric], p.scoreGames);
    case 'gold': return ratio(p.gold, p.goldGames);
    case 'damage': return ratio(p.damage, p.damageGames);
    case 'vision': return ratio(p.vision, p.visionGames);
    default: return p[metric];
  }
}
export function seasonLeaderboard(data: SeasonStatisticsData, metric: SeasonMetric, minimumGames = 1): SeasonPlayer[] {
  return data.players.filter(p => p.games >= minimumGames && seasonMetricValue(p, metric) !== null)
    .sort((a, b) => seasonMetricValue(b, metric)! - seasonMetricValue(a, metric)! || b.games - a.games || a.id.localeCompare(b.id));
}
