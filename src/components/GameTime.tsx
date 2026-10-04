import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { BroadcastState } from '../../shared/types';
import { DisplayGameClock, displayClockInput } from '../../shared/game-clock';
import { time } from '../lib';

const GameClockConnection = createContext(true);
export const GameClockConnectionProvider = GameClockConnection.Provider;

export function useGameClock(state: BroadcastState): number {
  const connected = useContext(GameClockConnection);
  const controller = useRef<DisplayGameClock | null>(null);
  if (!controller.current) controller.current = new DisplayGameClock();
  const input = displayClockInput(state, connected);
  const signature = JSON.stringify(input);
  const [seconds, setSeconds] = useState(() => Math.floor(input.time));
  useEffect(() => {
    controller.current!.update(input, performance.now(), Date.now());
    setSeconds(Math.floor(controller.current!.read(performance.now())));
  }, [signature]);
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(Math.floor(controller.current!.read(performance.now()))), 50);
    return () => window.clearInterval(timer);
  }, []);
  return seconds;
}

/** A text-only component keeps existing clock typography and avoids rerendering the whole HUD. */
export function GameTime({ state }: { state: BroadcastState }) {
  return <>{time(useGameClock(state))}</>;
}
