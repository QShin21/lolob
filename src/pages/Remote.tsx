import { useState } from "react";
import { programState } from "../../shared/production";
import type { Notice, Scene, StateContext } from "../../shared/types";
import { Brand } from "../components/Icons";
import { MonitorPane } from "../components/MonitorPane";
import { Notification, TakeControl, TaskTabs } from "../components/ConsoleUI";
import { ProductionDesk } from "../components/ProductionDesk";
import { applicationLabel, pendingContent } from "../../shared/presentation";
import { sceneInfo } from "../lib";
const roleNames = {
  readonly: "只读席",
  data: "资料席",
  subtitle: "字幕席",
  replay: "回放席",
  director: "主导播席",
};
export function Remote(
  ctx: StateContext & {
    connected: boolean;
    toast: Notice | null;
    dismissNotice: () => void;
  },
) {
  const { state, seat, send, connected, toast, dismissNotice } = ctx,
    [monitor, setMonitor] = useState<"program" | "preview">("program");
  const displayState = monitor === "program" ? programState(state) : state;
  const role = seat?.role ?? "readonly",
    canPrepare = role === "data" || role === "director";
  return (
    <div className="remote-page">
      <header>
        <Brand />
        <span className={connected ? "green-text" : "red-text"}>
          {connected ? "已同步" : "同步中断"}
        </span>
      </header>
      <h1>{roleNames[role]}</h1>
      <p>
        {seat?.name ?? "正在验证席位"} · 节目控制者{" "}
        {state.production?.control?.name ?? "待连接"}
      </p>
      <p className="muted">
        {monitor === "program" ? "PGM" : "PVW"} · {displayState.match.title} ·
        GAME {displayState.match.game} · {pendingContent(state).length}{" "}
        类待播改动
      </p>
      <TaskTabs
        items={[
          { id: "program", label: "PGM 节目" },
          { id: "preview", label: "PVW 预监" },
        ]}
        value={monitor}
        onChange={setMonitor}
        label="监视画面"
      />
      <MonitorPane state={state} champions={ctx.champions} kind={monitor} />
      <p role="status">{applicationLabel(state)}</p>
      {canPrepare && (
        <section className="remote-scene-grid" aria-label="准备场景">
          {(Object.keys(sceneInfo) as Scene[]).map((scene) => (
            <button
              className={`button ${state.previewScene === scene ? "primary" : ""}`}
              key={scene}
              onClick={() =>
                void send({ type: "preview-scene", scene }).catch(() => {})
              }
            >
              {sceneInfo[scene].name}
              {state.programScene === scene && <small>PGM</small>}
            </button>
          ))}
        </section>
      )}
      {role === "subtitle" && (
        <ProductionDesk
          {...ctx}
          initialTask="subtitle"
          allowedTasks={["subtitle"]}
        />
      )}{" "}
      {role === "replay" && (
        <ProductionDesk
          {...ctx}
          initialTask="replay"
          allowedTasks={["replay", "rundown"]}
        />
      )}{" "}
      {role === "director" && (
        <ProductionDesk
          {...ctx}
          initialTask="subtitle"
          allowedTasks={["subtitle", "replay", "feeds", "rundown", "incident"]}
        />
      )}{" "}
      {role === "data" && (
        <ProductionDesk
          {...ctx}
          initialTask="graphics"
          allowedTasks={["graphics", "feeds"]}
        />
      )}{" "}
      {role === "readonly" && (
        <div className="empty-state">
          当前席位可以核对节目与预监。需要编辑时，请由主机导播生成对应权限的邀请。
        </div>
      )}
      <div className="remote-bottom">
        <TakeControl {...ctx} />
      </div>
      <Notification notice={toast} dismiss={dismissNotice} />
    </div>
  );
}
