import type { ProductionState, ProductionCommand } from './production-types';
export type Phase = 'pregame' | 'draft' | 'live' | 'postgame';
export type Scene = 'standby' | 'draft' | 'lineup' | 'live' | 'economy' | 'ranking' | 'schedule' | 'postgame' | 'interview' | 'teamfight' | 'gold-ranking';
export type SourceMode = 'demo' | 'live';
export type Side = 'blue' | 'red';
export interface Champion { id: string; key: number; name: string; title: string; image: string; splash: string; tags: string[] }
export interface SummonerSpell { id?: number; name: string; rawName?: string }
export interface PlayerUltimate { state: 'ready' | 'cooldown' | 'unlearned' | 'unknown'; cooldownRemaining?: number; level?: number; icon?: string }
export interface PlayerRoleQuest { completed?: boolean; icon?: string; progress?: number; maxProgress?: number }
export interface Player { id: string; name: string; role: string; championId: string; championName: string; kills: number; deaths: number; assists: number; cs: number; statsAvailable?: boolean; statsSource?: 'api' | 'ocr'; statsSampledAt?: string; statsGameTime?: number; statsExpiresAt?: string; level: number; gold: number | null; currentGold?: number | null; goldSource?: 'api' | 'ocr'; goldSampledAt?: string; goldGameTime?: number; goldExpiresAt?: string; items: number[]; itemSlots?: number[]; itemCounts?: number[]; team: Side; portrait?: string; runes?: string[]; runeIds?: number[]; runeSelection?: { keystoneId?: number; primaryTreeId?: number; secondaryTreeId?: number }; health?: number; maxHealth?: number; resource?: number; maxResource?: number; resourceType?: string; experience?: number; maxExperience?: number; ultimate?: PlayerUltimate; visionScore?: number; roleQuest?: PlayerRoleQuest; isDead?: boolean; respawnTimer?: number; summonerSpells?: SummonerSpell[] }
export interface Team { id: string; name: string; tag: string; color: string; logo?: string; players: { id?: string; account?: string; name: string; role: string; portrait?: string }[] }
export interface Match { id: string; title: string; blueTeamId: string; redTeamId: string; scheduledAt: string; format: string; status: 'scheduled' | 'live' | 'finished'; blueScore: number; redScore: number }
export interface TeamStats { kills: number; gold: number | null; towers: number; dragons: number; barons: number; objectivesAvailable?: boolean }
export interface GameEvent { id: string; time: number; type: string; text: string; team?: Side }
export type EconomySource = 'none' | 'api' | 'manual' | 'ocr';
export interface EconomyRoi { x: number; y: number; width: number; height: number }
export interface EconomyOcrConfig { enabled: boolean; blue: EconomyRoi; red: EconomyRoi; players?: { enabled: boolean; region: EconomyRoi } }
export interface PlayerEconomyFeed { status: 'disabled' | 'waiting' | 'fresh' | 'partial' | 'stale' | 'error'; detail: string; matched: number; statsMatched?: number; total: number; sampledAt?: string; durationMs?: number; intervalMs?: number }
export interface EconomyFeed { source: EconomySource; status: 'disabled' | 'waiting' | 'fresh' | 'stale' | 'error'; detail: string; blue: number | null; red: number | null; sampledAt?: string; expiresAt?: string; gameTime?: number; raw?: {blue: string; red: string}; players?: PlayerEconomyFeed }
export interface EconomyPoint { time: number; blue: number; red: number; source?: EconomySource }
export interface DraftState { bluePicks: string[]; redPicks: string[]; blueBans: string[]; redBans: string[]; bluePreselect?: string[]; redPreselect?: string[]; timer: number; activeTeam: Side; action: string; locked?: boolean }
export interface DraftHistoryGame { seriesId: string; game: number; blueTeamId: string; redTeamId: string; bluePicks: string[]; redPicks: string[]; recordedAt: string; source: 'lcu' | 'live' | 'manual' | 'demo'; sourceGameId?: string }
export interface NativeHudStatus { status: 'waiting' | 'hidden' | 'fallback' | 'off'; detail: string; updatedAt?: string; preserveScore?: boolean; preserveScoreboard?: boolean }
export interface Connection { status: 'connected' | 'disconnected' | 'connecting' | 'error'; detail: string; updatedAt?: string }
export interface GameClockSample { source: 'live' | 'replay'; gameTime: number; sampledAt: string; speed: number; paused: boolean; sessionId: string; discontinuity: number; matchKey: string; validForMs: number; awaitingLiveSample?: boolean }
export type BroadcastPreset = 'arena';
export interface PlayerFeedSettings { mode: 'image' | 'camera' | 'off'; imageUrl: string; cameraDeviceId: string; label: string }
export type PlayerFeedPair = Record<Side, PlayerFeedSettings>;
export interface PlayerFeedControl { mode: 'manual' | 'auto'; activeIndex: number; nextSwitchAt?: number }
export interface OverlaySettings { preset: BroadcastPreset; scoreboard: boolean; players: boolean; objectives: boolean; ticker: boolean; goldDiff: boolean; sponsor: string; sponsorLogo?: string; tickerText: string; accent: string; scale: number; countdownEnd: number | null; nativeHud?: 'auto' | 'mask' | 'off'; patchVersion?: string; bottomTitle?: string; playerFeeds?: PlayerFeedPair; playerFeedPairs?: PlayerFeedPair[]; playerFeedControl?: PlayerFeedControl }
export interface BroadcastState {
  production?: ProductionState;
  revision: number; mode: SourceMode; phase: Phase; previewScene: Scene; programScene: Scene;
  match: { title: string; subtitle: string; game: number; format: string; blueTeamId: string; redTeamId: string; blueScore: number; redScore: number; seriesId?: string };
  teams: Team[]; schedule: Match[]; players: Player[]; gameTime: number; gameClock?: GameClockSample; paused: boolean;
  stats: { blue: TeamStats; red: TeamStats }; draft: DraftState; events: GameEvent[]; economy: EconomyPoint[]; economyFeed?: EconomyFeed;
  connections: { lcu: Connection; live: Connection; replay: Connection; obs: Connection };
  overlay: OverlaySettings; assets: Asset[]; recordings: Recording[]; selectedPlayerId: string | null;
  draftHistory?: DraftHistoryGame[]; draftHistoryPending?: DraftHistoryGame; nativeHudStatus?: NativeHudStatus;
  gameResults?: GameResult[]; finishedGameId?: string; reportGameId?: string; awaitingNextGame?: { sourceGameId?: string; rosterFingerprint: string; gameTime: number }; activeSourceGameId?: string;
  settings: { lockfilePath: string; obsUrl: string; obsPassword?: string; pollInterval: number; autoPhase: boolean; gamePath: string; economyOcr?: EconomyOcrConfig };
}
export interface Asset { id: string; name: string; url: string; type: string; createdAt: string }
export interface Recording { id: string; title: string; createdAt: string; observedAt?: string; sourceGameTime?: number; duration: number; mode: SourceMode; players: Player[]; stats: BroadcastState['stats']; events: GameEvent[]; economy: EconomyPoint[]; economyFeed?: EconomyFeed; result?: { resultId: string; seriesId: string; game: number; attempt: number; winner: Side | null; winnerTeamId?: string; version: number; terminalComplete: boolean; seriesComplete: boolean; blueScore: number; redScore: number; valid?: boolean; invalidReason?: string } }
export interface GameResult { id: string; key: string; seriesId: string; matchId?: string; game: number; blueTeamId: string; redTeamId: string; winner: Side | null; winnerTeamId?: string; endedAt: string; source: 'live' | 'lcu' | 'manual'; sourceGameId?: string; snapshot: Recording; match: BroadcastState['match']; teams: Team[]; draft: DraftState; seriesComplete: boolean; terminalSampleAccepted?: boolean; terminalSampleComplete?: boolean; selectedPlayerId?: string | null }
export type BroadcastAction = (
  | { type: 'production'; command: ProductionCommand }
  | { type: 'correct-result'; resultId: string; winner: Side; reason: string }
  | { type: 'set-mode'; mode: SourceMode }
  | { type: 'set-phase'; phase: Phase }
  | { type: 'preview-scene'; scene: Scene }
  | { type: 'take'; scene?: Scene }
  | { type: 'set-overlay'; patch: Partial<OverlaySettings> }
  | { type: 'set-match'; patch: Partial<BroadcastState['match']> }
  | { type: 'set-settings'; patch: Partial<BroadcastState['settings']> }
  | { type: 'set-teams'; teams: Team[] }
  | { type: 'set-schedule'; schedule: Match[] }
  | { type: 'set-draft'; patch: Partial<DraftState> }
  | { type: 'select-player'; playerId: string | null }
  | { type: 'set-player-feed-control'; mode: 'manual' | 'auto'; activeIndex?: number }
  | { type: 'demo-pause'; paused: boolean }
  | { type: 'demo-reset' }
  | { type: 'save-recording'; title?: string }
  | { type: 'finalize-game'; winner?: Side | null }
  | { type: 'next-game' }
  | { type: 'load-match'; matchId: string }) & { expectedConfigVersion?: number; requestId?: string };
export interface StateContext { state: BroadcastState; send: (action: BroadcastAction) => Promise<void>; champions: Champion[]; notify: (message: string) => void }
