import { useState } from "react";
import { sceneLabel } from "../../shared/presentation";
import { Maximize2 } from "lucide-react";
import type { BroadcastState, Champion } from "../../shared/types";
import { programState } from "../../shared/production";
import { sceneInfo, outputUrl } from "../lib";
import { ObsLivePreview, type ObsPreviewStatus } from "./ObsLivePreview";
import { BroadcastCanvas } from "./BroadcastCanvas";
export function MonitorPane({
  state,
  champions,
  kind,
  purpose = "monitor",
}: {
  state: BroadcastState;
  champions: Champion[];
  kind: "preview" | "program";
  purpose?: "program" | "monitor" | "dynamic";
}) {
  const scene = kind === "preview" ? state.previewScene : state.programScene;
  const [previewStatus, setPreviewStatus] = useState<ObsPreviewStatus | null>(
    null,
  );
  const live = previewStatus?.phase === "live";
  const [layoutOnly, setLayoutOnly] = useState(false);
  return (
    <section className={`monitor-pane ${kind}`}>
      <div className="monitor-label">
        <span>
          <i />
          {kind === "preview" ? "PVW" : "PGM"}{" "}
          <b>{kind === "preview" ? "预监画面" : "节目播出"}</b>
        </span>
        <span>
          {sceneLabel(
            kind === "program" ? programState(state) : state,
            scene,
            sceneInfo[scene].name,
          )}
        </span>
        <a
          href={outputUrl(kind === "preview")}
          target="_blank"
          rel="noreferrer"
          title="打开 HUD 浏览器源"
        >
          <Maximize2 size={13} />
        </a>
      </div>
      <div className="monitor-surface">
        {layoutOnly ? (
          <>
            <BroadcastCanvas
              state={kind === "program" ? programState(state) : state}
              champions={champions}
              scene={scene}
            />
            <span className="layout-only-label">
              HUD 排版示意 · 未合成游戏画面
            </span>
          </>
        ) : (
          <ObsLivePreview
            kind={kind}
            purpose={purpose}
            connected={state.connections.obs.status === "connected"}
            onStatus={setPreviewStatus}
          />
        )}
      </div>
      <div className="monitor-footer">
        <button
          className="text-button"
          onClick={() => setLayoutOnly(!layoutOnly)}
        >
          {layoutOnly ? "返回实时监视" : "查看 HUD 排版"}
        </button>
        <span>
          <span
            className={`status-dot ${live ? (kind === "program" ? "red" : "green") : "gray"}`}
          />{" "}
          {live
            ? kind === "program"
              ? "节目合成画面"
              : previewStatus.transport === "native"
                ? "动态预监 · 共用游戏来源"
                : "每秒采样 · 共用游戏来源"
            : previewStatus?.phase === "paused"
              ? "预览已暂停"
              : "等待实时画面"}
        </span>
        <span>
          {live && previewStatus.fps > 0
            ? `${previewStatus.fps.toFixed(1)} fps · `
            : ""}
          16:9
          {previewStatus?.updatedAt && previewStatus.transport === "screenshot"
            ? ` · 采样 ${new Date(previewStatus.updatedAt).toLocaleTimeString("zh-CN")}`
            : ""}
        </span>
      </div>
    </section>
  );
}
