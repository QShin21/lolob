import type { StylePackRef } from './style-packs';
import type { FightSegment, NeutralSample } from './combat-display';
import type { Cooldown, TelemetryStamp, ItemCooldown, PlayerBuffs, DamageTotals } from './player-telemetry';
import type { ProductionState, ProductionCommand } from './production-types';
export type Phase = 'pregame' | 'draft' | 'live' | 'postgame';
export type BuiltinScene = 'standby' | 'draft' | 'lineup' | 'live' | 'economy' | 'ranking' | 'schedule' | 'postgame' | 'interview' | 'teamfight' | 'gold-ranking';
export type Scene = BuiltinScene | `custom:${string}`;
export interface CustomSceneSource {
  id: string; name: string; kind: 'image' | 'window' | 'obs';
  assetId?: string; window?: string; inputName?: string;
  x: number; y: number; width: number; height: number;
  fit: 'contain' | 'cover' | 'stretch'; visible: boolean;
}
export interface CustomScene { id: `custom:${string}`; name: string; background: string; sources: CustomSceneSource[] }
export interface CustomSourceChoices { windows: { name: string; value: string }[]; inputs: { name: string; kind: string }[] }
export type SourceMode = 'live';
export type Side = 'blue' | 'red';
export interface Champion { id: string; key: number; name: string; title: string; image: string; splash: string; tags: string[] }
export interface SummonerSpell { id?: number; name: string; rawName?: string; cooldown?: Cooldown }
export interface PlayerUltimate extends Cooldown { cooldownRemaining?: number; level?: number; icon?: string }
export interface Player {
  telemetry?: TelemetryStamp;
  itemCooldowns?: ItemCooldown[];
  buffs?: PlayerBuffs;
  respawnAt?: number;
  /** Cumulative champion damage; teamfight graphics use a server-owned interval baseline. */
  telemetryDamage?: DamageTotals;
  telemetryDamageSource?: 'api' | 'memory' | 'packets' | 'postgame';
  telemetryDamageSession?: string;
  telemetryDamageSince?: number;
}
export interface PlayerRoleQuest { completed?: boolean; icon?: string; progress?: number; maxProgress?: number }
export interface Player { damageDealt?: number; damageTaken?: number; id: string; name: string; role: string; championId: string; championName: string; kills: number; deaths: number; assists: number; cs: number; statsAvailable?: boolean; statsSource?: 'api' | 'ocr'; statsSampledAt?: string; statsGameTime?: number; statsExpiresAt?: string; level: number; gold: number | null; currentGold?: number | null; goldSource?: 'api' | 'ocr' | 'memory'; goldSampledAt?: string; goldGameTime?: number; goldExpiresAt?: string; items: number[]; itemSlots?: number[]; itemCounts?: number[]; team: Side; portrait?: string; runes?: string[]; runeIds?: number[]; fullRuneIds?: number[]; runeSelection?: { keystoneId?: number; primaryTreeId?: number; secondaryTreeId?: number }; health?: number; maxHealth?: number; resource?: number; maxResource?: number; resourceType?: string; experience?: number; maxExperience?: number; ultimate?: PlayerUltimate; visionScore?: number; visionSource?: 'api' | 'ocr'; visionSampledAt?: string; visionExpiresAt?: string; roleQuest?: PlayerRoleQuest; isDead?: boolean; respawnTimer?: number; summonerSpells?: SummonerSpell[] }
export interface Team { id: string; name: string; tag: string; color: string; logo?: string; players: { id?: string; account?: string; name: string; role: string; portrait?: string }[] }
export interface Match { id: string; title: string; blueTeamId: string; redTeamId: string; scheduledAt: string; format: string; status: 'scheduled' | 'live' | 'finished'; blueScore: number; redScore: number }
export interface TeamStats { kills: number; gold: number | null; towers: number; dragons: number; barons: number; elders?: number; heralds?: number; voidgrubs?: number; objectivesAvailable?: boolean }
export interface GameEvent { id: string; time: number; type: string; text: string; team?: Side }
export type EconomySource = 'none' | 'api' | 'manual' | 'ocr';
export interface EconomyRoi { x: number; y: number; width: number; height: number }
export type HudObjective = 'towers' | 'dragons' | 'barons' | 'voidgrubs';
export interface OcrObservation { value: number; sampledAt: string; gameTime: number; raw?: string }
export interface OcrPlayerGoldObservation extends OcrObservation { team: Side; championId: string }
export interface OcrMatchData {
  key: string; sourceGameId?: string; roster?: string;
  players: Record<string, OcrPlayerGoldObservation>;
  objectives: Record<Side, Partial<Record<HudObjective, OcrObservation>>>;
  teamGold?: { blue: number; red: number; sampledAt: string; gameTime: number };
  economy: EconomyPoint[];
}
export interface ObjectiveOcrFeed { status: 'disabled' | 'waiting' | 'fresh' | 'partial' | 'stale'; detail: string; matched: number; total: number; sampledAt?: string }
export interface EconomyOcrConfig { enabled: boolean; blue: EconomyRoi; red: EconomyRoi; players?: { enabled: boolean; region: EconomyRoi }; objectives?: { enabled: boolean; regions: Record<Side, Record<HudObjective, EconomyRoi>> } }
export interface PlayerEconomyFeed { status: 'disabled' | 'waiting' | 'fresh' | 'partial' | 'stale' | 'error'; detail: string; matched: number; statsMatched?: number; total: number; sampledAt?: string; durationMs?: number; intervalMs?: number }
export interface EconomyFeed { source: EconomySource; status: 'disabled' | 'waiting' | 'fresh' | 'stale' | 'error'; detail: string; blue: number | null; red: number | null; sampledAt?: string; expiresAt?: string; gameTime?: number; raw?: {blue: string; red: string}; players?: PlayerEconomyFeed; objectives?: ObjectiveOcrFeed }
export interface EconomyPoint { time: number; blue: number; red: number; source?: EconomySource }
export interface DraftState { bluePicks: string[]; redPicks: string[]; blueBans: string[]; redBans: string[]; bluePreselect?: string[]; redPreselect?: string[]; timer: number; activeTeam: Side; action: string; locked?: boolean }
export interface DraftHistoryGame { seriesId: string; game: number; blueTeamId: string; redTeamId: string; bluePicks: string[]; redPicks: string[]; recordedAt: string; source: 'lcu' | 'live' | 'manual'; sourceGameId?: string }
export interface NativeHudStatus { status: 'waiting' | 'hidden' | 'fallback' | 'off'; detail: string; updatedAt?: string; preserveScore?: boolean; preserveScoreboard?: boolean }
export interface Connection { status: 'connected' | 'disconnected' | 'connecting' | 'error'; detail: string; updatedAt?: string }
export interface GameClockSample { source: 'live' | 'replay'; gameTime: number; sampledAt: string; speed: number; paused: boolean; sessionId: string; discontinuity: number; matchKey: string; validForMs: number; awaitingLiveSample?: boolean }
export type BroadcastPreset = 'arena';
export interface PlayerFeedSettings { mode: 'image' | 'camera' | 'off'; imageUrl: string; cameraDeviceId: string; label: string; focusX?: number; focusY?: number }
export type PlayerFeedPair = Record<Side, PlayerFeedSettings>;
export interface PlayerFeedControl { mode: 'manual' | 'auto'; activeIndex: number; nextSwitchAt?: number }
export interface OverlaySettings { stylePack?: StylePackRef; postgamePage?: 1 | 2 | 3; preset: BroadcastPreset; scoreboard: boolean; players: boolean; objectives: boolean; ticker: boolean; goldDiff: boolean; sponsor: string; sponsorLogo?: string; tickerText: string; accent: string; scale: number; countdownEnd: number | null; nativeHud?: 'auto' | 'mask' | 'off'; patchVersion?: string; bottomTitle?: string; playerFeeds?: PlayerFeedPair; playerFeedPairs?: PlayerFeedPair[]; playerFeedControl?: PlayerFeedControl; scheduleView?: { page: number; filter: 'all' | 'upcoming' | 'day'; day: string }; interview?: { name: string; team: string; role: string; topic: string; dock: 'left' | 'right' } }
export interface BroadcastState {
  customScenes?: CustomScene[];
  production?: ProductionState;
  revision: number; mode: SourceMode; phase: Phase; previewScene: Scene; programScene: Scene;
  match: { title: string; subtitle: string; game: number; format: string; blueTeamId: string; redTeamId: string; blueScore: number; redScore: number; seriesId?: string };
  teams: Team[]; schedule: Match[]; players: Player[]; gameTime: number; gameClock?: GameClockSample; paused: boolean;
  stats: { blue: TeamStats; red: TeamStats }; draft: DraftState; events: GameEvent[]; economy: EconomyPoint[]; economyFeed?: EconomyFeed; ocrMatch?: OcrMatchData;
  connections: { lcu: Connection; live: Connection; replay: Connection; obs: Connection };
  overlay: OverlaySettings; assets: Asset[]; recordings: Recording[]; selectedPlayerId: string | null;
  fightSegment?: FightSegment; neutralObjectives?: NeutralSample;
  observerTelemetry?: {status:'connected'|'unavailable';detail:string;profile?:string;sampledAt?:string}; draftHistory?: DraftHistoryGame[]; draftHistoryPending?: DraftHistoryGame; nativeHudStatus?: NativeHudStatus;
  gameResults?: GameResult[]; finishedGameId?: string; reportGameId?: string; awaitingNextGame?: { sourceGameId?: string; rosterFingerprint: string; gameTime: number }; activeSourceGameId?: string;
  settings: { lockfilePath: string; obsUrl: string; obsPassword?: string; pollInterval: number; autoPhase: boolean; gamePath: string; economyOcr?: EconomyOcrConfig };
}
export interface Asset { id: string; name: string; url: string; type: string; createdAt: string; width?: number; height?: number; alpha?: boolean; category?: 'logo' | 'player' | 'sponsor' | 'other' }
export interface Recording { id: string; title: string; createdAt: string; observedAt?: string; sourceGameTime?: number; duration: number; mode: SourceMode; players: Player[]; stats: BroadcastState['stats']; events: GameEvent[]; economy: EconomyPoint[]; economyFeed?: EconomyFeed; ocrMatch?: OcrMatchData; result?: { resultId: string; seriesId: string; game: number; attempt: number; winner: Side | null; winnerTeamId?: string; version: number; terminalComplete: boolean; seriesComplete: boolean; blueScore: number; redScore: number; valid?: boolean; invalidReason?: string } }
export interface GameResult { id: string; key: string; seriesId: string; matchId?: string; game: number; blueTeamId: string; redTeamId: string; winner: Side | null; winnerTeamId?: string; endedAt: string; source: 'live' | 'lcu' | 'manual'; sourceGameId?: string; snapshot: Recording; match: BroadcastState['match']; teams: Team[]; draft: DraftState; seriesComplete: boolean; terminalSampleAccepted?: boolean; terminalSampleComplete?: boolean; selectedPlayerId?: string | null }
export type BroadcastAction = (
  | { type: 'set-style-pack'; id: string; revision: string }
  | { type: 'save-custom-scene'; scene: CustomScene }
  | { type: 'delete-custom-scene'; id: string }
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
  | { type: 'save-recording'; title?: string }
  | { type: 'finalize-game'; winner?: Side | null }
  | { type: 'next-game' }
  | { type: 'load-match'; matchId: string }) & { expectedConfigVersion?: number; requestId?: string };
export type NoticeKind = 'success' | 'info' | 'warning' | 'error' | 'loading';
export interface Notice { id: number; message: string; kind: NoticeKind }
export interface ControlSeat { id: string; name: string; role: import('./production-types').SeatRole }
export interface StateContext { state: BroadcastState; send: (action: BroadcastAction) => Promise<void>; champions: Champion[]; notify: (message: string, kind?: NoticeKind) => void; seat?: ControlSeat; connected?: boolean }
