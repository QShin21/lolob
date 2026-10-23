export type TwitchAudienceDisplay = 'hidden' | 'poll' | 'prediction' | 'chat-vote';
export interface TwitchAudienceChoice { id: string; title: string; votes: number; points?: number }
export interface TwitchAudienceQuestion {
  id: string; title: string; status: string; choices: TwitchAudienceChoice[];
  startedAt?: string; endsAt?: string; winningChoiceId?: string;
}
export interface TwitchChatVote extends TwitchAudienceQuestion { status: 'ACTIVE' | 'COMPLETED'; totalVoters: number }
export interface TwitchAudienceState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'; detail: string;
  channel?: { id: string; login: string };
  capabilities: { polls: boolean; predictions: boolean; chat: boolean };
  display: TwitchAudienceDisplay; poll?: TwitchAudienceQuestion; prediction?: TwitchAudienceQuestion;
  chatVote?: TwitchChatVote; updatedAt?: string; warnings: string[];
}
export function initialTwitchAudienceState(): TwitchAudienceState {
  return { status: 'disconnected', detail: '等待连接 Twitch 频道', capabilities: { polls: false, predictions: false, chat: false }, display: 'hidden', warnings: [] };
}
