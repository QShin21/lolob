/** Read the current interval every tick so edits take effect without restarting. */
export function clientPollScheduler(poll: () => void) {
  let lastPoll = -Infinity;
  return (now: number, interval: number) => {
    if (now - lastPoll < interval) return;
    lastPoll = now;
    poll();
  };
}
