import type { BroadcastState } from './types';

export function gameClockMatchKey(state: BroadcastState): string {
  return JSON.stringify([state.mode, state.match.seriesId, state.match.game, state.match.blueTeamId, state.match.redTeamId]);
}

export interface DisplayClockInput {
  time: number;
  sampledAt?: string;
  speed: number;
  paused: boolean;
  connected: boolean;
  sessionKey: string;
  sampleKey: string;
  validForMs: number;
}

export function displayClockInput(state: BroadcastState, transportConnected = true): DisplayClockInput {
  const matchKey = gameClockMatchKey(state);
  if (state.mode === 'demo') return {
    time: state.gameTime, speed: 1, paused: state.paused || state.phase !== 'live', connected: transportConnected,
    sessionKey: matchKey, sampleKey: JSON.stringify([state.gameTime, state.paused, state.phase]), validForMs: 2500,
  };
  const sample = state.gameClock;
  if (!sample || sample.matchKey !== matchKey || !Number.isFinite(sample.gameTime) || sample.gameTime < 0 || !Number.isFinite(sample.speed) || sample.speed < 0 || !Number.isFinite(sample.validForMs) || sample.validForMs < 0 || !Number.isFinite(Date.parse(sample.sampledAt))) return {
    time: state.gameTime, speed: 0, paused: true, connected: false,
    sessionKey: `${matchKey}:waiting`, sampleKey: String(state.gameTime), validForMs: 0,
  };
  return {
    time: sample.gameTime, sampledAt: sample.sampledAt, speed: sample.speed, paused: sample.paused,
    connected: transportConnected && state.connections[sample.source].status === 'connected',
    sessionKey: JSON.stringify([matchKey, sample.sessionId, sample.discontinuity, sample.source]),
    sampleKey: JSON.stringify([sample.sampledAt, sample.gameTime, sample.speed, sample.paused]),
    validForMs: Math.max(0, sample.validForMs),
  };
}

/** Display interpolation only. Raw samples and recording times never pass through this clock. */
export class DisplayGameClock {
  private anchor?: { time: number; at: number; speed: number; correction: number; correctionMs: number; deadline: number };
  private input?: DisplayClockInput;

  read(now: number): number {
    if (!this.anchor) return 0;
    const elapsed = Math.max(0, Math.min(now, this.anchor.deadline) - this.anchor.at);
    return Math.max(0, this.anchor.time + elapsed / 1000 * this.anchor.speed + this.anchor.correction * Math.min(1, elapsed / this.anchor.correctionMs));
  }

  update(input: DisplayClockInput, now: number, wallNow: number): void {
    const previous = this.input;
    const current = this.anchor ? this.read(now) : input.time;
    const newSession = !previous || previous.sessionKey !== input.sessionKey;
    if (!newSession && previous.sampleKey === input.sampleKey && previous.connected === input.connected) return;
    this.input = input;
    if (!newSession && !input.connected) {
      this.anchor = { time: current, at: now, speed: 0, correction: 0, correctionMs: 1000, deadline: now };
      return;
    }
    const age = input.sampledAt ? Math.max(0, wallNow - Date.parse(input.sampledAt)) : 0;
    const remaining = Math.max(0, input.validForMs - age);
    const speed = input.connected && !input.paused && remaining > 0 ? input.speed : 0;
    const candidate = Math.max(0, input.time + (speed ? Math.min(age, input.validForMs) / 1000 * speed : 0));
    const difference = candidate - current;
    const continuous = !newSession && previous?.connected && input.connected && !previous.paused && !input.paused && previous.speed === input.speed && Math.abs(difference) < Math.max(2, input.speed * .5);
    // Small sampling jitter is corrected gradually, preserving forward motion between polls.
    const correction = continuous && speed > 0 ? difference : 0;
    const correctionMs = correction < 0 ? Math.max(1000, -correction / Math.max(.01, speed * .5) * 1000) : 1000;
    this.anchor = { time: continuous && speed > 0 ? current : candidate, at: now, speed, correction, correctionMs, deadline: now + remaining };
  }
}
