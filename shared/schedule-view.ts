import type { BroadcastState } from "./types";
export function schedulePage(state: BroadcastState) {
  const view = state.overlay.scheduleView ?? {
    page: 0,
    filter: "all",
    day: "",
  };
  const day = (iso: string) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  const matches = state.schedule
    .filter((m) =>
      view.filter === "upcoming"
        ? m.status !== "finished"
        : view.filter === "day"
          ? Number.isFinite(Date.parse(m.scheduledAt)) &&
            day(m.scheduledAt) === view.day
          : true,
    )
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const pages = Math.max(1, Math.ceil(matches.length / 4)),
    index = Math.max(0, Math.min(pages - 1, Math.floor(view.page) || 0));
  return {
    matches: matches.slice(index * 4, index * 4 + 4),
    total: matches.length,
    pages,
    index,
  };
}
