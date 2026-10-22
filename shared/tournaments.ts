import type { BroadcastState, Match, Team } from './types';
import type { Standing, Tournament, TournamentConfig, TournamentEntry, TournamentMatch } from './tournament-types';

export const tournamentFormats = {
  'single-elimination': '单败淘汰', 'double-elimination': '双败淘汰',
  'round-robin': '循环赛', 'groups-knockout': '小组循环 + 淘汰', swiss: '瑞士轮',
} as const;
export const tournamentStates = { waiting: '等待前序赛果', ready: '可开赛', bye: '轮空晋级', complete: '已完成', skipped: '无需进行' };
export const winTarget = (format: string) => Math.floor(Number(format.slice(2)) / 2) + 1;
const teamEntry = (teamId: string): TournamentEntry => ({ kind: 'team', teamId });
const bye = (): TournamentEntry => ({ kind: 'bye' });
const from = (kind: 'winner' | 'loser', matchId: string): TournamentEntry => ({ kind, matchId });
const done = (m: Match) => !!m.tournament && ['complete', 'bye', 'skipped'].includes(m.tournament.state);

export function validateTournament(config: TournamentConfig, teams: Team[]): void {
  if (!config || typeof config.name !== 'string' || !config.name.trim() || config.name.length > 100) throw new Error('请填写 1–100 字赛事名称');
  if (!Object.hasOwn(tournamentFormats, config.format)) throw new Error('请选择支持的赛制');
  if (!Array.isArray(config.teamIds) || config.teamIds.length < 2 || config.teamIds.length > 64 || new Set(config.teamIds).size !== config.teamIds.length || config.teamIds.some(id => !teams.some(t => t.id === id))) throw new Error('请选择 2–64 支不同的已建档战队');
  if (![config.bestOf, config.finalBestOf].every(f => ['BO1', 'BO3', 'BO5', 'BO7'].includes(f))) throw new Error('每场局数支持 BO1、BO3、BO5、BO7');
  if (typeof config.startAt !== 'string' || !Number.isFinite(Date.parse(config.startAt))) throw new Error('请设置有效的开赛时间');
  if (!Number.isInteger(config.intervalMinutes) || config.intervalMinutes < 1 || config.intervalMinutes > 10080) throw new Error('对阵间隔需为 1–10080 分钟');
  if (![1, 2].includes(config.legs) || typeof config.grandFinalReset !== 'boolean') throw new Error('循环次数或双败决赛设置无效');
  if (config.format === 'groups-knockout' && (!Number.isInteger(config.groupCount) || config.groupCount < 2 || config.groupCount > 16 || Math.floor(config.teamIds.length / config.groupCount) < 2 || !Number.isInteger(config.advancePerGroup) || config.advancePerGroup < 1 || config.advancePerGroup > Math.floor(config.teamIds.length / config.groupCount))) throw new Error('每组需容纳晋级名额，至少分成两组');
  if (config.format === 'swiss' && (!Number.isInteger(config.swissRounds) || config.swissRounds < 1 || config.swissRounds > config.teamIds.length - 1)) throw new Error('瑞士轮轮数需为 1 至参赛队数减 1');
}

/** Stable seed placement gives the highest seeds the byes, and keeps 1/2 apart. */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  for (let n = 4; n <= size; n *= 2) order = order.flatMap(seed => [seed, n + 1 - seed]);
  return order;
}

export function buildTournament(id: string, config: TournamentConfig, teams: Team[], createdAt = new Date().toISOString()): { tournament: Tournament; matches: Match[] } {
  validateTournament(config, teams);
  const tournament: Tournament = { id, config: structuredClone({ ...config, name: config.name.trim() }), createdAt, teams: config.teamIds.map(id => structuredClone(teams.find(t => t.id === id)!)), groups: [], assetIds: [], status: 'scheduled', history: [] };
  const matches: Match[] = [];
  const add = (label: string, stage: TournamentMatch['stage'], round: number, blue: TournamentEntry, red: TournamentEntry, extra: Partial<TournamentMatch> = {}, final = false) => {
    const order = matches.length;
    const match: Match = { id: `${id}-m${order + 1}`, title: `${config.name.trim()} · ${label}`, blueTeamId: '', redTeamId: '', format: final ? config.finalBestOf : config.bestOf, scheduledAt: new Date(Date.parse(config.startAt) + order * config.intervalMinutes * 60000).toISOString(), status: 'scheduled', blueScore: 0, redScore: 0,
      tournament: { tournamentId: id, stage, round, order, blue, red, state: 'waiting', ...extra } };
    matches.push(match); return match.id;
  };
  const knockout = (entries: TournamentEntry[], stage: 'knockout' | 'upper', alreadySeeded = false) => {
    const size = 2 ** Math.ceil(Math.log2(entries.length));
    let slots = alreadySeeded ? [...entries, ...Array.from({ length: size - entries.length }, bye)] : seedOrder(size).map(seed => entries[seed - 1] ?? bye());
    const rounds: string[][] = [];
    for (let round = 1; slots.length > 1; round++) {
      const ids: string[] = [], last = slots.length === 2;
      for (let i = 0; i < slots.length; i += 2) ids.push(add(`${stage === 'upper' ? '胜者组' : '淘汰赛'} ${last ? '决赛' : `第 ${round} 轮`} · ${i / 2 + 1}`, stage, round, slots[i], slots[i + 1], {}, last && stage === 'knockout'));
      rounds.push(ids); slots = ids.map(id => from('winner', id));
    }
    return rounds;
  };
  const roundRobin = (ids: string[], group?: string) => {
    let ring: (string | null)[] = [...ids]; if (ring.length % 2) ring.push(null);
    const count = ring.length - 1;
    for (let leg = 0; leg < config.legs; leg++) for (let round = 0; round < count; round++) {
      for (let i = 0; i < ring.length / 2; i++) {
        let a = ring[i], b = ring[ring.length - 1 - i];
        if (!a || !b) continue;
        if ((round + i + leg) % 2) [a, b] = [b, a];
        add(`${group ? `${group} 组` : '循环赛'} · 第 ${leg * count + round + 1} 轮`, group ? 'group' : 'league', leg * count + round + 1, teamEntry(a), teamEntry(b), group ? { group } : {});
      }
      ring = [ring[0], ring.at(-1)!, ...ring.slice(1, -1)];
    }
  };
  const entries = config.teamIds.map(teamEntry);
  if (config.format === 'single-elimination') knockout(entries, 'knockout');
  if (config.format === 'double-elimination') {
    const upper = knockout(entries, 'upper');
    let lower: string[] = [];
    if (upper.length === 1) lower = upper[0];
    else {
      for (let i = 0; i < upper[0].length; i += 2) lower.push(add(`败者组第 1 轮 · ${i / 2 + 1}`, 'lower', 1, from('loser', upper[0][i]), from('loser', upper[0][i + 1])));
      for (let u = 1; u < upper.length; u++) {
        // Cross-feed upper losers to postpone a rematch with their former opponent.
        const previous = lower;
        lower = previous.map((l, i) => add(`败者组第 ${u * 2} 轮 · ${i + 1}`, 'lower', u * 2, from('winner', l), from('loser', upper[u][upper[u].length - 1 - i])));
        if (u < upper.length - 1) {
          const pairs: string[] = [];
          for (let i = 0; i < lower.length; i += 2) pairs.push(add(`败者组第 ${u * 2 + 1} 轮 · ${i / 2 + 1}`, 'lower', u * 2 + 1, from('winner', lower[i]), from('winner', lower[i + 1])));
          lower = pairs;
        }
      }
    }
    const final = add('总决赛', 'final', 1, from('winner', upper.at(-1)![0]), from(upper.length === 1 ? 'loser' : 'winner', lower[0]), {}, true);
    if (config.grandFinalReset) add('总决赛重置场（败者组获胜时启用）', 'reset', 2, from('loser', final), from('winner', final), { resetOf: final }, true);
  }
  if (config.format === 'round-robin') roundRobin(config.teamIds);
  if (config.format === 'groups-knockout') {
    tournament.groups = Array.from({ length: config.groupCount }, (_, i) => ({ id: String.fromCharCode(65 + i), teamIds: [] }));
    config.teamIds.forEach((id, i) => {
      const band = Math.floor(i / config.groupCount), position = i % config.groupCount;
      tournament.groups[band % 2 ? config.groupCount - 1 - position : position].teamIds.push(id);
    });
    for (const group of tournament.groups) roundRobin(group.teamIds, group.id);
    const qualifiers: TournamentEntry[] = [];
    // Seed by finish first. For the common 2/4/8-group top-two format, pair winners
    // with another group's runner-up and place a group's qualifiers in opposite halves.
    if (config.advancePerGroup === 2 && [2, 4, 8, 16].includes(config.groupCount)) {
      const groupOrder = seedOrder(config.groupCount).map(n => n - 1);
      for (const g of groupOrder) {
        qualifiers.push({ kind: 'rank', group: tournament.groups[g].id, rank: 1 }, { kind: 'rank', group: tournament.groups[g ^ 1].id, rank: 2 });
      }
      knockout(qualifiers, 'knockout', true);
    } else {
      for (let rank = 1; rank <= config.advancePerGroup; rank++) for (const group of tournament.groups) qualifiers.push({ kind: 'rank', group: group.id, rank });
      knockout(qualifiers, 'knockout');
    }
  }
  if (config.format === 'swiss') for (let round = 1; round <= config.swissRounds; round++) for (let slot = 0; slot < Math.ceil(entries.length / 2); slot++) add(`瑞士轮第 ${round} 轮 · ${slot + 1}`, 'swiss', round, { kind: 'swiss', round, slot: slot * 2 }, { kind: 'swiss', round, slot: slot * 2 + 1 });
  const temporary = { teams, schedule: matches, tournaments: [tournament], gameResults: [], match: { seriesId: '' } } as unknown as BroadcastState;
  advanceTournaments(temporary);
  let slot = 0;
  for (const match of matches) {
    match.scheduledAt = new Date(Date.parse(config.startAt) + slot * config.intervalMinutes * 60000).toISOString();
    if (!['bye', 'skipped'].includes(match.tournament!.state)) slot++;
  }
  return { tournament, matches };
}

export function tournamentStandings(t: Tournament, matches: Match[], group?: string, beforeRound = Infinity): Standing[] {
  const ids = group ? t.groups.find(g => g.id === group)?.teamIds ?? [] : t.config.teamIds;
  const rows = new Map(ids.map(teamId => [teamId, { teamId, rank: 0, played: 0, wins: 0, losses: 0, points: 0, gameWins: 0, gameLosses: 0, buchholz: 0, byes: 0 }]));
  const relevant = matches.filter(m => m.tournament?.tournamentId === t.id && (!group || m.tournament.group === group) && m.tournament.round < beforeRound && done(m));
  for (const m of relevant) {
    const meta = m.tournament!;
    if (meta.state === 'skipped') continue;
    for (const side of ['blue', 'red'] as const) {
      const row = rows.get(m[`${side}TeamId`]); if (!row) continue;
      if (meta.state === 'bye') { if (meta.stage === 'swiss') { row.byes++; row.points += 3; } continue; }
      row.played++; row.gameWins += m[`${side}Score`]; row.gameLosses += m[side === 'blue' ? 'redScore' : 'blueScore'];
      if (meta.winnerTeamId === row.teamId) { row.wins++; row.points += 3; } else row.losses++;
    }
  }
  for (const m of relevant) if (m.tournament!.state === 'complete') {
    const a = rows.get(m.blueTeamId), b = rows.get(m.redTeamId);
    if (a && b) { a.buchholz += b.points; b.buchholz += a.points; }
  }
  const headToHead = (a: Standing, b: Standing) => relevant.reduce((sum, m) => [m.blueTeamId, m.redTeamId].includes(a.teamId) && [m.blueTeamId, m.redTeamId].includes(b.teamId) ? sum + (m.tournament!.winnerTeamId === b.teamId ? 1 : -1) : sum, 0);
  // Head-to-head applies only to an exact two-team tie, keeping the comparator transitive.
  const tieKey = (r: Standing) => `${r.points}:${r.gameWins - r.gameLosses}:${r.gameWins}`;
  const tieCounts = new Map<string, number>(); for (const r of rows.values()) tieCounts.set(tieKey(r), (tieCounts.get(tieKey(r)) ?? 0) + 1);
  return [...rows.values()].sort((a, b) => b.points - a.points || (t.config.format === 'swiss' ? b.buchholz - a.buchholz : 0) || (b.gameWins - b.gameLosses) - (a.gameWins - a.gameLosses) || b.gameWins - a.gameWins || (tieCounts.get(tieKey(a)) === 2 ? headToHead(a, b) : 0) || ids.indexOf(a.teamId) - ids.indexOf(b.teamId)).map((r, i) => ({ ...r, rank: i + 1 }));
}

function swissPairs(t: Tournament, matches: Match[], round: number): { pairs: [TournamentEntry, TournamentEntry][]; repeat: boolean } {
  const ranked = tournamentStandings(t, matches, undefined, round);
  const previous = matches.filter(m => m.tournament?.stage === 'swiss' && m.tournament.round < round && done(m));
  let byeTeam: string | undefined;
  if (ranked.length % 2) {
    const candidate = [...ranked].reverse().sort((a, b) => a.byes - b.byes)[0];
    byeTeam = candidate.teamId; ranked.splice(ranked.indexOf(candidate), 1);
  }
  const met = (a: string, b: string) => previous.some(m => [m.blueTeamId, m.redTeamId].includes(a) && [m.blueTeamId, m.redTeamId].includes(b));
  let budget = 60000;
  const search = (pool: Standing[]): [string, string][] | undefined => {
    if (!pool.length) return [];
    if (--budget < 0) return undefined;
    const a = pool[0];
    const options = pool.slice(1).filter(b => !met(a.teamId, b.teamId)).sort((b, c) => Math.abs(a.points - b.points) - Math.abs(a.points - c.points) || b.rank - c.rank);
    for (const b of options) {
      const rest = search(pool.filter(r => r !== a && r !== b));
      if (rest) return [[a.teamId, b.teamId], ...rest];
    }
    return undefined;
  };
  let pairs = search(ranked), repeat = false;
  if (!pairs) {
    repeat = true; pairs = [];
    const pool = [...ranked];
    while (pool.length) {
      const a = pool.shift()!;
      pool.sort((b, c) => Number(met(a.teamId, b.teamId)) - Number(met(a.teamId, c.teamId)) || Math.abs(a.points - b.points) - Math.abs(a.points - c.points) || b.rank - c.rank);
      pairs.push([a.teamId, pool.shift()!.teamId]);
    }
  }
  const entries: [TournamentEntry, TournamentEntry][] = pairs.map(([a, b]) => [teamEntry(a), teamEntry(b)]);
  if (byeTeam) entries.push([teamEntry(byeTeam), bye()]);
  return { pairs: entries, repeat };
}

/** Resolve dependencies to a fixed point. Completed/loaded descendants lock their participants. */
export function advanceTournaments(state: BroadcastState, strict = false): boolean {
  let changed = false;
  for (const t of state.tournaments ?? []) {
    const matches = state.schedule.filter(m => m.tournament?.tournamentId === t.id);
    const before = JSON.stringify([matches, t.status, t.championTeamId, t.blockedReason]);
    delete t.blockedReason;
    const byId = new Map(matches.map(m => [m.id, m]));
    const locked = (m: Match) => !!m.tournament?.manualResult || m.status === 'live' || state.gameResults?.some(r => r.matchId === m.id) || state.match.seriesId === `live:schedule:${m.id}`;
    const conflict = (m: Match) => { const message = `「${m.title}」已经载入或记录赛果，前序修订会改变其对阵；请先处理该场结果`; if (strict) throw new Error(message); t.blockedReason = message; };
    const resolve = (e: TournamentEntry): string | null | undefined => {
      if (e.kind === 'team') return e.teamId;
      if (e.kind === 'bye') return null;
      if (e.kind === 'swiss') return undefined;
      if (e.kind === 'rank') {
        const groupMatches = matches.filter(m => m.tournament!.group === e.group);
        if (!groupMatches.every(done)) return undefined;
        return tournamentStandings(t, matches, e.group)[e.rank - 1]?.teamId ?? null;
      }
      const source = byId.get(e.matchId);
      if (!source || !done(source)) return undefined;
      return source.tournament![e.kind === 'winner' ? 'winnerTeamId' : 'loserTeamId'] ?? null;
    };
    // Every earlier Swiss round is final before later-round pairing is generated.
    // Recompute unplayed pairs after a correction; locked participants are protected below.
    for (let pass = 0; pass <= matches.length; pass++) {
      let progress = false;
      const pairings = new Map<number, ReturnType<typeof swissPairs>>();
      for (const m of matches) {
        const meta = m.tournament!;
        const old = JSON.stringify(m);
        let a: string | null | undefined, b: string | null | undefined;
        let skip = false;
        if (meta.stage === 'swiss') {
          const previous = matches.filter(row => row.tournament!.round < meta.round);
          if (previous.every(done)) {
            if (!pairings.has(meta.round)) pairings.set(meta.round, swissPairs(t, matches, meta.round));
            const pairing = pairings.get(meta.round)!, slot = matches.filter(row => row.tournament!.round === meta.round).indexOf(m), pair = pairing.pairs[slot];
            a = resolve(pair[0]); b = resolve(pair[1]);
            meta.pairingWarning = pairing.repeat ? '已采用允许重赛的配对，请核对本轮对阵' : undefined;
          }
        } else { a = resolve(meta.blue); b = resolve(meta.red); }
        if (meta.resetOf) {
          const final = byId.get(meta.resetOf)!;
          if (!done(final)) { a = undefined; b = undefined; }
          else if (final.tournament!.winnerTeamId === final.blueTeamId) { a = null; b = null; skip = true; }
        }
        if ((m.blueTeamId !== (a ?? '') || m.redTeamId !== (b ?? '')) && locked(m)) { conflict(m); continue; }
        m.blueTeamId = a ?? ''; m.redTeamId = b ?? '';
        delete meta.winnerTeamId; delete meta.loserTeamId;
        if (a === undefined || b === undefined) { meta.state = 'waiting'; m.status = 'scheduled'; m.blueScore = 0; m.redScore = 0; }
        else if (skip || (!a && !b)) { meta.state = 'skipped'; m.status = 'finished'; m.blueScore = 0; m.redScore = 0; }
        else if (!a || !b) { meta.state = 'bye'; meta.winnerTeamId = a || b || undefined; m.status = 'finished'; m.blueScore = 0; m.redScore = 0; }
        else {
          if (meta.manualResult) { m.blueScore = meta.manualResult.blue; m.redScore = meta.manualResult.red; }
          const target = winTarget(m.format);
          if (Math.max(m.blueScore, m.redScore) >= target && m.blueScore !== m.redScore) {
            meta.state = 'complete'; meta.winnerTeamId = m.blueScore > m.redScore ? a : b; meta.loserTeamId = meta.winnerTeamId === a ? b : a; m.status = 'finished';
          } else { meta.state = 'ready'; if (m.status === 'finished') m.status = 'scheduled'; }
        }
        if (old !== JSON.stringify(m)) progress = true;
      }
      if (!progress) break;
    }
    t.status = matches.every(done) && !t.blockedReason ? 'finished' : matches.some(m => m.status === 'live' || m.tournament!.state === 'complete') ? 'live' : 'scheduled';
    delete t.championTeamId;
    if (t.status === 'finished') {
      if (['round-robin', 'swiss'].includes(t.config.format)) t.championTeamId = tournamentStandings(t, matches)[0]?.teamId;
      else t.championTeamId = [...matches].reverse().find(m => m.tournament!.state === 'complete' || m.tournament!.state === 'bye')?.tournament!.winnerTeamId;
    }
    if (before !== JSON.stringify([matches, t.status, t.championTeamId, t.blockedReason])) changed = true;
  }
  return changed;
}

export function entryLabel(entry: TournamentEntry, state: Pick<BroadcastState, 'teams' | 'schedule'>): string {
  if (entry.kind === 'team') return state.teams.find(t => t.id === entry.teamId)?.name ?? '待定';
  if (entry.kind === 'bye') return '轮空';
  if (entry.kind === 'rank') return `${entry.group} 组第 ${entry.rank} 名`;
  if (entry.kind === 'swiss') return `第 ${entry.round} 轮自动配对`;
  const match = state.schedule.find(m => m.id === entry.matchId);
  return `第 ${(match?.tournament?.order ?? 0) + 1} 场${entry.kind === 'winner' ? '胜者' : '败者'}`;
}
