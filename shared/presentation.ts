import type { BroadcastState, ControlSeat, EconomyPoint, Scene } from "./types";

/** Compare editorial content only. Telemetry and configuration counters are not pending edits. */
export function pendingContent(state: BroadcastState): string[] {
  const p = state.production,
    onAir = p?.program;
  if (!onAir) return ["首次节目准备"];
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  const items: string[] = [];
  if (state.previewScene !== state.programScene) items.push("场景");
  if (!same(state.match, onAir.match)) items.push("比赛身份 / 比分");
  if (!same(state.teams, onAir.teams)) items.push("战队 / 名单");
  if (!same(state.schedule, onAir.schedule)) items.push("赛程");
  const {
    ticker,
    tickerText,
    playerFeedControl,
    playerFeedPairs,
    playerFeeds,
    ...look
  } = state.overlay;
  const {
    ticker: oldTicker,
    tickerText: oldText,
    playerFeedControl: oldControl,
    playerFeedPairs: oldPairs,
    playerFeeds: oldFeeds,
    ...oldLook
  } = onAir.overlay;
  if (ticker !== oldTicker || tickerText !== oldText) items.push("字幕");
  // nextSwitchAt advances automatically; it is not an operator edit.
  const feed = (control: typeof playerFeedControl) => ({
    mode: control?.mode,
    activeIndex: control?.mode === "auto" ? undefined : control?.activeIndex,
  });
  if (
    !same(
      [feed(playerFeedControl), playerFeedPairs, playerFeeds],
      [feed(oldControl), oldPairs, oldFeeds],
    )
  )
    items.push("选手画面");
  if (!same(look, oldLook)) items.push("包装");
  if (state.selectedPlayerId !== onAir.selectedPlayerId) items.push("焦点选手");
  if (p?.draftMode !== "auto" && !same(state.draft, onAir.draft))
    items.push("BP");
  if (!same(p?.assignments, onAir.assignments)) items.push("英雄归属");
  if (!same(p?.rules, onAir.rules)) items.push("赛事规则");
  return items;
}

export function takeBlockReason(
  state: BroadcastState,
  seat?: ControlSeat,
  connected = true,
): string {
  if (!connected) return "同步中断，等待重新连接";
  if (
    seat &&
    (seat.role !== "director" ||
      (state.production?.control && state.production.control.owner !== seat.id))
  )
    return "由当前主导播席切入节目";
  if (state.connections.obs.status !== "connected")
    return "先连接 OBS，再核对预监";
  if (state.production?.application?.status === "requested")
    return "等待 OBS 应用本次切入";
  return "";
}

export function applicationLabel(state: BroadcastState): string {
  const app = state.production?.application;
  return app?.status === "confirmed"
    ? "画面已人工核对"
    : app?.status === "applied"
      ? "OBS 已应用 · 待人工核对"
      : app?.status === "failed"
        ? "应用失败 · 需重试"
        : app?.status === "requested"
          ? "切入请求已接收 · 等待 OBS"
          : "尚未切入";
}

export function sceneLabel(
  state: BroadcastState,
  scene: Scene,
  fallback: string,
): string {
  if (scene !== "ranking") return fallback;
  const player = state.players.find((p) => p.id === state.selectedPlayerId);
  return player ? `个人数据 · ${player.name}` : "十人数据榜";
}

export interface EconomySegment {
  from: EconomyPoint;
  to: EconomyPoint;
  side: "blue" | "red";
}
/** Break absent samples and backwards clocks, split a lead change at the zero crossing. */
export function economySegments(
  points: EconomyPoint[],
  maxGap = 30,
): EconomySegment[] {
  const result: EconomySegment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    if (
      ![a.time, a.blue, a.red, b.time, b.blue, b.red].every(Number.isFinite) ||
      b.time <= a.time ||
      b.time - a.time > maxGap
    )
      continue;
    const da = a.blue - a.red,
      db = b.blue - b.red;
    if (da * db < 0) {
      const fraction = Math.abs(da) / (Math.abs(da) + Math.abs(db));
      const middle = {
        time: a.time + (b.time - a.time) * fraction,
        blue: a.blue + (b.blue - a.blue) * fraction,
        red: a.red + (b.red - a.red) * fraction,
      };
      result.push(
        { from: a, to: middle, side: da >= 0 ? "blue" : "red" },
        { from: middle, to: b, side: db >= 0 ? "blue" : "red" },
      );
    } else
      result.push({ from: a, to: b, side: (da || db) >= 0 ? "blue" : "red" });
  }
  return result;
}
