import type { BroadcastState, Side } from '../../shared/types';
import { getTeam } from '../lib';
import './live-top.css';

/** Extend only the empty ends of the native spectator scoreboard. */
export function LiveTop({ state }: { state: BroadcastState }) {
  const needed = Math.min(5, Math.floor((Number(state.match.format.match(/\d+/)?.[0]) || 3) / 2) + 1);
  return <section className="lt-native-extension" aria-label="队名与系列赛胜场">
    {(['blue', 'red'] as Side[]).map(side => <div key={side} className={`lt-native-team ${side}`}>
      <strong title={getTeam(state, side)?.name}>{getTeam(state, side)?.tag || (side === 'blue' ? 'BLUE' : 'RED')}</strong>
      <span aria-label={`${side === 'blue' ? '蓝方' : '红方'}系列赛 ${state.match[`${side}Score`]} 胜`}>
        {Array.from({ length: needed }, (_, i) => <i key={i} className={i < state.match[`${side}Score`] ? 'won' : ''} />)}
      </span>
    </div>)}
  </section>;
}
