import { useState } from "react";
import { useConfigDraft } from "../useConfigDraft";
import type { StateContext } from "../../shared/types";
import { getTeam } from "../lib";
import { SaveBar } from "./ConsoleUI";
import { schedulePage } from "../../shared/schedule-view";
import "./task-panels.css";
import "./graphic-controls.css";

const emptyInterview = {
  name: "",
  team: "",
  role: "",
  topic: "赛后采访",
  dock: "left" as const,
};
export function GraphicControls({ state, send, notify }: StateContext) {
  const editor = useConfigDraft(
    {
      interview: state.overlay.interview ?? emptyInterview,
      view: state.overlay.scheduleView ?? {
        page: 0,
        filter: "all" as const,
        day: "",
      },
    },
    state.production?.configVersion,
  );
  const { interview, view } = editor.draft,
    dirty = editor.dirty,
    [busy, setBusy] = useState(false);
  const setInterview = (value: typeof interview) =>
      editor.setDraft((d) => ({ ...d, interview: value })),
    setView = (value: typeof view) =>
      editor.setDraft((d) => ({ ...d, view: value }));
  const page = schedulePage({
    ...state,
    overlay: { ...state.overlay, scheduleView: view },
  });
  return (
    <div className="production-task graphic-controls tpanel">
      <div className="graphic-controls-body">
        <section className="tpanel-section graphic-interview">
          <h3 className="tpanel-subtitle">采访名牌</h3>
          <div className="graphic-interview-layout">
            <div className="graphic-fields">
              <label className="field">
                <span>套用选手</span>
                <select
                  value=""
                  onChange={(e) => {
                    const p = state.players.find((p) => p.id === e.target.value);
                    if (p)
                      setInterview({
                        ...interview,
                        name: p.name,
                        team: getTeam(state, p.team)?.name ?? "",
                        role: p.role,
                      });
                  }}
                >
                  <option value="">选择一名选手</option>
                  {state.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.role}
                    </option>
                  ))}
                </select>
              </label>
              {(["name", "team", "role", "topic"] as const).map((key, index) => (
                <label className="field" key={key}>
                  <span>
                    {["姓名 / 通用标题", "战队", "职务 / 分路", "采访主题"][index]}
                  </span>
                  <input
                    value={interview[key]}
                    maxLength={key === "topic" ? 120 : 80}
                    onChange={(e) =>
                      setInterview({ ...interview, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label className="field">
                <span>名牌停靠</span>
                <select
                  value={interview.dock}
                  onChange={(e) =>
                    setInterview({
                      ...interview,
                      dock: e.target.value as "left" | "right",
                    })
                  }
                >
                  <option value="left">左下安全区</option>
                  <option value="right">右下安全区</option>
                </select>
              </label>
            </div>
            <div
              className={`interview-safe-preview tpanel-media ${interview.dock}`}
              aria-label="采访名牌安全区示意"
            >
              <span>采访画面</span>
              <b>
                {interview.name || "赛后采访"}
                <small>
                  {interview.team} · {interview.role}
                </small>
              </b>
              <i>底部字幕安全区</i>
            </div>
          </div>
        </section>
        <section className="tpanel-section graphic-schedule">
          <h3 className="tpanel-subtitle">赛程看板</h3>
          <div className="graphic-fields">
            <label className="field">
              <span>赛程范围</span>
              <select
                value={view.filter}
                onChange={(e) =>
                  setView({
                    ...view,
                    page: 0,
                    filter: e.target.value as typeof view.filter,
                  })
                }
              >
                <option value="all">全部赛程</option>
                <option value="upcoming">进行中与接下来</option>
                <option value="finished">仅已完成</option>
                <option value="day">指定比赛日（北京时间）</option>
              </select>
            </label>
            {view.filter === "day" && (
              <label className="field">
                <span>比赛日</span>
                <input
                  type="date"
                  value={view.day}
                  onChange={(e) =>
                    setView({ ...view, page: 0, day: e.target.value })
                  }
                />
              </label>
            )}
          </div>
          <div className="graphic-pager">
            <p>
              第 {page.index + 1} / {page.pages} 页 · 共 {page.total} 场 · 每页 4 场
            </p>
            <div className="inline-buttons">
              <button
                className="button small"
                disabled={page.index === 0}
                onClick={() => setView({ ...view, page: page.index - 1 })}
              >
                上一页
              </button>
              <button
                className="button small"
                disabled={page.index >= page.pages - 1}
                onClick={() => setView({ ...view, page: page.index + 1 })}
              >
                下一页
              </button>
            </div>
          </div>
          <p className="tpanel-readout graphic-page-matches">
            {page.matches.map((m) => m.title).join(" / ") || "当前条件没有赛程"}
          </p>
        </section>
        {editor.conflict && (
          <div
            className="request-error gl-callout graphic-conflict"
            data-tone="warn"
            role="alert"
          >
            <div className="tpanel-callout-body">
              <strong>待播配置已被其他席位修改</strong>
              <p>
                当前待播采访：{state.overlay.interview?.name || "通用标题"} ·{" "}
                {state.overlay.interview?.topic || "赛后采访"}
              </p>
              <p>
                本地草稿：{interview.name || "通用标题"} · {interview.topic}
              </p>
              <p>
                最新赛程：第 {(state.overlay.scheduleView?.page ?? 0) + 1} 页 /{" "}
                {state.overlay.scheduleView?.filter ?? "all"}；本地第{" "}
                {view.page + 1} 页 / {view.filter}
              </p>
            </div>
            <button className="button small" onClick={editor.rebase}>
              已核对，合并保留本地改动
            </button>
          </div>
        )}
      </div>
      <SaveBar
        dirty={dirty}
        busy={busy}
        onDiscard={editor.discard}
        onSave={async () => {
          setBusy(true);
          try {
            await send({
              type: "set-overlay",
              expectedConfigVersion: editor.baseVersion.current,
              patch: { interview, scheduleView: view },
            });
            notify("采访与赛程已保存到待播", "success");
          } catch {
            /* preserve draft */
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
