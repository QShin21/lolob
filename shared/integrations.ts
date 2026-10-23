import type { BroadcastState } from './types';

export const integrationEvents = ['game.event', 'game.changed', 'phase.changed', 'program.changed', 'result.saved'] as const;
export type IntegrationEvent = typeof integrationEvents[number];
export interface WebhookConfig { id: string; name: string; url: string; enabled: boolean; events: IntegrationEvent[]; secret: string }
export interface IntegrationConfig { version: 1; allowedOrigins?: string[]; keyHash: string; webhooks: WebhookConfig[] }
export interface IntegrationDelivery { id: string; name: string; event: string; at: string; status: 'queued' | 'sent' | 'failed'; attempts: number; detail?: string }
export interface IntegrationStatus { allowedOrigins?: string[]; webhooks: Omit<WebhookConfig, 'secret'>[]; hasKey: boolean; deliveries: IntegrationDelivery[]; pending: number }
export interface DataFeed { schemaVersion: 1; revision: number; generatedAt: string; gameTime: number; phase: BroadcastState['phase']; match: BroadcastState['match']; teams: Pick<BroadcastState['teams'][number], 'id' | 'name' | 'tag' | 'color' | 'logo'>[]; players: BroadcastState['players']; stats: BroadcastState['stats']; events: BroadcastState['events']; economy: BroadcastState['economy']; draft: BroadcastState['draft']; neutralObjectives: BroadcastState['neutralObjectives']; fightSegment: BroadcastState['fightSegment']; programScene: BroadcastState['programScene']; gameClock: BroadcastState['gameClock'] }
