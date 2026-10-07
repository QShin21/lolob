import { test } from "node:test";
import assert from "node:assert/strict";
import { createSeed, applyAction, normalizeSavedState } from "./state";
import {
  captureProgram,
  ensureProduction,
  programState,
} from "../shared/production";
import {
  pendingContent,
  economySegments,
  takeBlockReason,
  applicationLabel,
  sceneLabel,
} from "../shared/presentation";
import { schedulePage } from "../shared/schedule-view";
import { playerFeedPairs } from "../shared/player-feeds";

test("pending presentation counts editorial changes without counting live telemetry or rotation timers", () => {
  let s = createSeed();
  s.previewScene = s.programScene;
  const p = ensureProduction(s);
  p.program = captureProgram(s);
  assert.deepEqual(pendingContent(s), []);
  s.gameTime += 4;
  s.players[0].kills++;
  s.stats.blue.gold = 88888;
  p.configVersion++;
  assert.deepEqual(pendingContent(s), []);
  s = applyAction(s, { type: "set-match", patch: { title: "未播新标题" } });
  s = applyAction(s, {
    type: "set-overlay",
    patch: { ticker: true, tickerText: "待播字幕" },
  });
  assert.deepEqual(pendingContent(s), ["比赛身份 / 比分", "字幕"]);
  s.overlay.playerFeedControl = {
    mode: "auto",
    activeIndex: 3,
    nextSwitchAt: 200,
  };
  s.production!.program!.overlay.playerFeedControl = {
    mode: "auto",
    activeIndex: 1,
    nextSwitchAt: 100,
  };
  assert.ok(!pendingContent(s).includes("选手画面"));
});
test("TAKE eligibility distinguishes offline, role, owner, waiting and applied states", () => {
  const s = createSeed(),
    p = ensureProduction(s),
    owner = { id: "owner", name: "主导播", role: "director" as const };
  p.control = { owner: "owner", name: "主导播" };
  assert.match(takeBlockReason(s, owner), /连接 OBS/);
  s.connections.obs.status = "connected";
  assert.match(takeBlockReason(s, owner, false), /同步中断/);
  assert.match(takeBlockReason(s, { ...owner, role: "subtitle" }), /主导播/);
  assert.match(takeBlockReason(s, { ...owner, id: "another" }), /主导播/);
  p.application = {
    version: 1,
    status: "requested",
    detail: "request",
    at: new Date().toISOString(),
  };
  assert.match(takeBlockReason(s, owner), /等待 OBS/);
  assert.match(applicationLabel(s), /等待 OBS/);
  p.application.status = "failed";
  assert.equal(takeBlockReason(s, owner), "");
  assert.match(applicationLabel(s), /失败/);
  p.application.status = "applied";
  assert.match(applicationLabel(s), /待人工核对/);
  p.application.status = "confirmed";
  assert.match(applicationLabel(s), /已人工核对/);
});
test("gold curves split a lead crossing at zero and preserve missing/backwards clock gaps", () => {
  const p = [
    { time: 0, blue: 100, red: 0 },
    { time: 10, blue: 0, red: 100 },
    { time: 50, blue: 100, red: 0 },
    { time: 5, blue: 500, red: 0 },
  ];
  const segments = economySegments(p);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].side, "blue");
  assert.equal(segments[1].side, "red");
  assert.equal(segments[0].to.time, 5);
  assert.equal(segments[0].to.blue - segments[0].to.red, 0);
  assert.deepEqual(
    economySegments([
      { time: 0, blue: NaN, red: 0 },
      { time: 1, blue: 1, red: 0 },
    ]),
    [],
  );
});
test("schedule pagination covers every match, clamps stale pages and uses Beijing calendar days", () => {
  const s = createSeed();
  s.schedule = Array.from({ length: 9 }, (_, i) => ({
    ...s.schedule[0],
    id: String(i),
    scheduledAt: `2026-10-0${i + 1}T17:00:00Z`,
    status: i === 0 ? "finished" : "scheduled",
  }));
  s.overlay.scheduleView = { filter: "all", page: 2, day: "" };
  assert.deepEqual(
    schedulePage(s).matches.map((m) => m.id),
    ["8"],
  );
  s.overlay.scheduleView.page = 999;
  assert.equal(schedulePage(s).index, 2);
  s.overlay.scheduleView = { filter: "day", page: 0, day: "2026-10-02" };
  assert.deepEqual(
    schedulePage(s).matches.map((m) => m.id),
    ["0"],
  );
  s.overlay.scheduleView = { filter: "upcoming", page: 0, day: "" };
  assert.equal(schedulePage(s).total, 8);
});
test("interview, schedule and crop edits remain staged, survive restart and reject malformed input", () => {
  let s = createSeed();
  const before = structuredClone(programState(s).overlay),
    pairs = playerFeedPairs(s.overlay);
  pairs[0].blue.focusX = 80;
  pairs[0].blue.focusY = 20;
  s = applyAction(s, {
    type: "set-overlay",
    patch: {
      interview: {
        name: "测试选手",
        team: "战队",
        role: "中单",
        topic: "赛后采访",
        dock: "right",
      },
      scheduleView: { filter: "all", page: 1, day: "" },
      playerFeedPairs: pairs,
    },
  });
  assert.deepEqual(programState(s).overlay, before);
  const restored = normalizeSavedState(s);
  assert.equal(restored.overlay.interview?.dock, "right");
  assert.equal(restored.overlay.playerFeedPairs?.[0].blue.focusX, 80);
  assert.throws(() =>
    applyAction(s, {
      type: "set-overlay",
      patch: {
        interview: {
          name: "x".repeat(81),
          team: "",
          role: "",
          topic: "",
          dock: "left",
        },
      },
    }),
  );
  assert.throws(() =>
    applyAction(s, {
      type: "set-overlay",
      patch: {
        playerFeedPairs: pairs.map((p, i) =>
          i ? p : { ...p, blue: { ...p.blue, focusX: 101 } },
        ),
      },
    }),
  );
  assert.throws(() =>
    applyAction(s, {
      type: "set-overlay",
      patch: { scheduleView: { filter: "day", day: "invalid", page: 0 } },
    }),
  );
});
test("ranking scene announces the actual person selected for broadcast", () => {
  const s = createSeed();
  s.selectedPlayerId = null;
  assert.equal(sceneLabel(s, "ranking", "ranking"), "十人数据榜");
  s.selectedPlayerId = s.players[0].id;
  assert.equal(
    sceneLabel(s, "ranking", "ranking"),
    `个人数据 · ${s.players[0].name}`,
  );
});
