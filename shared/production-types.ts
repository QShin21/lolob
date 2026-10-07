import type { BroadcastState, DraftState, GameResult, OverlaySettings, Player, Scene, Side } from './types';

export type CheckId = 'identity' | 'game' | 'data' | 'audio' | 'disk' | 'program' | 'platform';
export type SeatRole = 'readonly' | 'data' | 'subtitle' | 'replay' | 'director';
export type Telemetry = Pick<BroadcastState, 'players' | 'stats' | 'events' | 'economy' | 'economyFeed' | 'gameTime' | 'gameClock' | 'paused' | 'phase'>;
export interface ProgramContent {
  version: number; key: string; takenAt: string;
  mode: BroadcastState['mode']; match: BroadcastState['match']; teams: BroadcastState['teams'];
  overlay: OverlaySettings; selectedPlayerId: string | null; draft: DraftState;
  telemetry: Telemetry; draftManual: boolean; assignments: ProductionState['assignments'];
  versions: ProductionState['versions']; rules: ProductionState['rules']; attempt: number; schedule: BroadcastState['schedule']; draftHistory: BroadcastState['draftHistory'];
}
export interface ReplayClip {
  id: string; key: string; title: string; file: string; savedAt: string;
  gameTime: number; duration: number; inPoint: number; outPoint: number;
  status: 'saved' | 'ready' | 'aired'; audio: 'original' | 'commentary';
}
export interface VideoRecord {
  id: string; seriesId: string; game: number; attempt: number; title: string;
  file: string; startedAt: string; stoppedAt?: string; startGameTime: number; endGameTime?: number;
  bytes?: number; verified?: boolean; detail?: string;
  recordingId?: string; startVideoSeconds?: number; endVideoSeconds?: number; playable?: boolean;
}
export interface ProductionState {
  configVersion: number; program?: ProgramContent; previousProgram?: { content: ProgramContent; scene: Scene };
  checks: Partial<Record<CheckId, { fingerprint: string; actor: string; at: string; note: string }>>;
  scores: Record<string, number>; baseScores: Record<string, number>;
  rules: { mode: 'standard' | 'fearless' | 'custom'; scope: 'all' | 'team'; exceptionGames: number[]; remakeHistory: 'discard' | 'retain' };
  draftMode: 'auto' | 'manual' | 'compare'; clientDraft?: { draft: DraftState; players: Player[]; at: string };
  draftUndo: DraftState[]; assignments: { playerId: string; championId: string; role: string; team: Side; locked: boolean }[];
  attempt: number; invalidAttempts: { key: string; at: string; reason: string; draft: DraftState; result?: GameResult }[];
  corrections: { resultId: string; before: Side | null; after: Side; reason: string; at: string; actor: string; version: number }[];
  pause?: { kind: 'official' | 'signal' | 'replay'; reason: string; at: string; actor: string };
  entry: 'bp' | 'loading' | 'waiting' | 'verify' | 'live';
  analysisSeconds: number; analysisEndsAt?: number;
  feedHold: boolean; dynamicPreview: boolean; layout: 'single' | 'dual';
  versions: { game: string; resources: string; ocr: string };
  marks: { id: string; key: string; time: number; at: string; text: string; type: 'highlight' | 'danger' | 'objective' }[];
  objectives: { id: string; key: string; label: string; gameTime: number; dueTime?: number; reason: string; clockSession?: string; discontinuity?: number; gameVersion?: string }[];
  objectiveRules: { label: string; respawnSeconds: number }[];
  sourceEpoch?: number; audioEpoch?: number; diskEpoch?: number;
  cameraHints?: string; keyboardTarget?: 'game' | 'workbench';
  alerts?: { id: string; text: string; at: string; category?: string; acknowledgedAt?: string; resolvedAt?: string }[];
  clips: ReplayClip[]; playingClipId?: string;
  videos: VideoRecord[];
  rundown: { id: string; scene: Scene; title: string; seconds: number; status: 'pending' | 'ready' | 'aired' }[];
  hotkeys: { take: string; live: string; analysis: string; feeds: string; emergency: string; undo: string };
  audit: { id: string; type: string; actor: string; at: string; reason?: string }[];
  application?: { id?: string; version: number; status: 'requested' | 'applied' | 'failed' | 'confirmed'; detail: string; at: string };
  persistence?: { status: 'saving' | 'saved' | 'failed'; at: string; revision: number; detail?: string };
  control?: { owner: string; name: string };
}
export type ProductionCommand =
  | { op: 'check'; id: CheckId; note?: string }
  | { op: 'rules'; rules: ProductionState['rules']; reason?: string }
  | { op: 'draft-mode'; mode: ProductionState['draftMode']; resolution?: 'client' | 'manual' }
  | { op: 'draft-undo' | 'draft-clear'; reason: string }
  | { op: 'assign'; assignments: ProductionState['assignments'] }
  | { op: 'pause'; kind: 'official' | 'signal' | 'replay'; reason: string }
  | { op: 'resume'; reason: string }
  | { op: 'remake'; reason: string }
  | { op: 'accept-final'; reason: string }
  | { op: 'mark'; text: string; kind: 'highlight' | 'danger' | 'objective' }
  | { op: 'objective'; label: string; dueTime?: number; reason: string }
  | { op: 'objective-rules'; rules: ProductionState['objectiveRules'] }
  | { op: 'settings'; analysisSeconds?: number; feedHold?: boolean; dynamicPreview?: boolean; layout?: 'single' | 'dual'; versions?: ProductionState['versions']; hotkeys?: ProductionState['hotkeys']; cameraHints?: string; keyboardTarget?: 'game' | 'workbench' }
  | { op: 'ack-alert'; id: string }
  | { op: 'immediate'; action: 'live' | 'analysis-off' | 'feeds-off' | 'ticker' | 'undo'; text?: string }
  | { op: 'confirm-picture' }
  | { op: 'rundown'; items: ProductionState['rundown'] };
