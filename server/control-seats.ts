import { randomBytes, randomUUID } from 'node:crypto';
import type { SeatRole } from '../shared/production-types';
import { record, str, ValidationError } from './state';

export class ControlSeats {
  private seats = new Map<string, { id: string; name: string; role: SeatRole }>();
  private owner?: string;
  private requests = new Map<string, { fingerprint: string; version: number }>();
  issue(input: unknown, local: boolean, existingToken?: unknown) {
    const p = record(input), role = local ? (p.role ?? 'director') : 'data';
    const existing = this.resolve(existingToken);
    if (existing && p.fresh !== true) return { token: existingToken, ...existing, owner: this.owner === existing.id };
    if (!['readonly', 'data', 'subtitle', 'replay', 'director'].includes(String(role))) throw new ValidationError('操作席位无效');
    const token = randomBytes(24).toString('base64url'), seat = { id: randomUUID(), name: str(p.name ?? (local ? '主机导播' : '移动资料席'), 80), role: role as SeatRole };
    this.seats.set(token, seat); if (!this.owner && role === 'director') this.owner = seat.id;
    return { token, ...seat, owner: this.owner === seat.id };
  }
  resolve(token: unknown) { return typeof token === 'string' ? this.seats.get(token) : undefined; }
  claim(token: unknown, note: unknown) {
    const seat = this.resolve(token); if (seat?.role !== 'director') throw new ValidationError('只有主导播席位可以接管节目');
    if (!str(note, 300).trim()) throw new ValidationError('接管需填写理由');
    this.owner = seat.id; return { owner: seat.id, name: seat.name };
  }
  authorize(token: unknown, type: string, command?: Record<string, unknown>) {
    const seat = this.resolve(token);
    // Before a UI has established seats, local CLI remains a supported maintenance entry point.
    if (!this.seats.size && token === undefined) return { id: 'local', role: 'director' as const, name: '主机导播' };
    if (!seat) throw new ValidationError('请重新连接操作席位');
    const main = ['take', 'next-game', 'load-match', 'finalize-game', 'correct-result', 'set-mode', 'set-settings', 'output', 'engine', 'set-phase', 'obs-scene'].includes(type) || type === 'production' && ['immediate', 'pause', 'resume', 'remake', 'accept-final'].includes(String(command?.op));
    if (main && (seat.role !== 'director' || seat.id !== this.owner)) throw new ValidationError('节目切入与局号推进由当前主导播控制席执行');
    if (seat.role === 'readonly') throw new ValidationError('当前席位为只读');
    if (seat.role === 'data' && !['set-teams','set-schedule','set-match','select-player','preview-scene','set-draft','set-overlay','set-player-feed-control','save-recording','delete-recording','production'].includes(type)) throw new ValidationError('资料席仅可准备赛事、素材与待播内容');
    if (seat.role === 'subtitle' && type !== 'set-overlay') throw new ValidationError('字幕席仅可编辑待播字幕');
    if (seat.role === 'replay' && !(type === 'replay' || type === 'obs-production' || type === 'production' && ['mark','rundown','check'].includes(String(command?.op)))) throw new ValidationError('回放席仅可准备回放');
    return seat;
  }
  ownerInfo() { return [...this.seats.values()].find(seat => seat.id === this.owner); }
  established() { return this.seats.size > 0; }
  duplicate(seatId: string, requestId: unknown, fingerprint: string): boolean {
    if (requestId === undefined) return false;
    const key = `${seatId}:${str(requestId, 100)}`, previous = this.requests.get(key);
    if (previous && previous.fingerprint !== fingerprint) throw new ValidationError('重复请求 ID 的内容不一致');
    return !!previous;
  }
  remember(seatId: string, requestId: unknown, fingerprint: string, version: number) {
    if (requestId === undefined) return;
    this.requests.set(`${seatId}:${str(requestId, 100)}`, { fingerprint, version });
    if (this.requests.size > 2000) this.requests.delete(this.requests.keys().next().value!);
  }
}
