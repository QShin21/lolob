import { useState } from "react";
import { sceneLabel } from "../../shared/presentation";
import { Maximize2 } from "lucide-react";
import type { BroadcastState, Champion } from "../../shared/types";
import { programState } from "../../shared/production";
import { sceneDetails, outputUrl } from "../lib";
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
  const source = kind === "program" ? programState(state) : state;
  return (
    <section className={`monitor-pane ${kind}`} data-live={live}>
      <div className="monitor-label">
        <span className={`bus-tag ${kind === "preview" ? "pvw" : "pgm"}`}>
          {kind === "preview" ? "PVW" : "PGM"}
        </span>
        <strong>{sceneLabel(source, scene, sceneDetails(source, scene).name)}</strong>
        <small>{kind === "preview" ? "预监画面" : "节目播出"}</small>
        <a
          href={outputUrl(kind === "preview")}
          target="_blank"
          rel="noreferrer"
          title="打开 HUD 浏览器源"
          aria-label={`打开${kind === "preview" ? "预监" : "节目"} HUD 浏览器源`}
        >
          <Maximize2 size={14} />
        </a>
      </div>
      <div className="monitor-surface">
        {layoutOnly ? (
          <>
            <BroadcastCanvas
              bus={kind}
              state={source}
              champions={champions}
              scene={scene}
            />
            <span className="layout-only-label">
              排版示意 · 窗口与游戏画面请查看实时监视
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
        <span className="monitor-state">
          <span
            className={`status-dot ${live ? (kind === "program" ? "red" : "green") : "gray"}`}
          />{" "}
          {layoutOnly ? "排版示意 · 非 OBS 合成" : live
            ? previewStatus.transport === "native"
                ? "原生动态 · OBS 合成"
                : "周期采样 · OBS 合成"
            : previewStatus?.phase === "paused"
              ? "预览已暂停"
              : "等待实时画面"}
        </span>
        <span className="monitor-meta">
          {!layoutOnly && live && previewStatus.fps > 0
            ? `${previewStatus.fps.toFixed(1)} fps · `
            : ""}
          16:9
          {previewStatus?.updatedAt && previewStatus.transport === "screenshot"
            ? ` · 采样 ${new Date(previewStatus.updatedAt).toLocaleTimeString("zh-CN")}`
            : ""}
        </span>
        <button
          className="text-button"
          onClick={() => setLayoutOnly(!layoutOnly)}
        >
          {layoutOnly ? "返回实时监视" : "查看场景排版"}
        </button>
      </div>
    </section>
  );
}
