import type { Asset, Team } from './types';

export type TournamentFormat = 'single-elimination' | 'double-elimination' | 'round-robin' | 'groups-knockout' | 'swiss';
export type BestOf = 'BO1' | 'BO3' | 'BO5' | 'BO7';
export interface TournamentConfig {
  name: string;
  format: TournamentFormat;
  teamIds: string[];
  bestOf: BestOf;
  finalBestOf: BestOf;
  startAt: string;
  intervalMinutes: number;
  legs: 1 | 2;
  groupCount: number;
  advancePerGroup: number;
  swissRounds: number;
  grandFinalReset: boolean;
}
export type TournamentEntry =
  | { kind: 'team'; teamId: string }
  | { kind: 'bye' }
  | { kind: 'winner' | 'loser'; matchId: string }
  | { kind: 'rank'; group: string; rank: number }
  | { kind: 'swiss'; round: number; slot: number };
export interface TournamentMatch {
  tournamentId: string;
  stage: 'knockout' | 'upper' | 'lower' | 'final' | 'reset' | 'league' | 'group' | 'swiss';
  round: number;
  order: number;
  group?: string;
  blue: TournamentEntry;
  red: TournamentEntry;
  state: 'waiting' | 'ready' | 'bye' | 'complete' | 'skipped';
  winnerTeamId?: string;
  loserTeamId?: string;
  resetOf?: string;
  pairingWarning?: string;
  manualResult?: { blue: number; red: number; reason: string; at: string };
}
export interface Tournament {
  id: string;
  config: TournamentConfig;
  createdAt: string;
  teams: Team[];
  groups: { id: string; teamIds: string[] }[];
  assetIds: string[];
  assets?: Asset[];
  status: 'scheduled' | 'live' | 'finished';
  championTeamId?: string;
  blockedReason?: string;
  history: { at: string; matchId: string; reason: string; before?: [number, number]; after: [number, number] }[];
}
export interface Standing {
  teamId: string; rank: number; played: number; wins: number; losses: number;
  points: number; gameWins: number; gameLosses: number; buchholz: number; byes: number;
}
export type ArchiveSource = 'live' | 'eog' | 'details' | 'timeline';
export interface ArchiveReceipt {
  status: 'pending' | 'saved' | 'unavailable';
  attempts: number;
  capturedAt?: string;
  nextAttemptAt?: number;
  detail?: string;
  sha256?: string;
  bytes?: number;
}
export interface GameArchive {
  sources: Partial<Record<ArchiveSource, ArchiveReceipt>>;
}
