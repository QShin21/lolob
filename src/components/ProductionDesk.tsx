import { useMemoryState } from "../useMemoryState";
import { TaskTabs, TakeControl, EmptyState } from "./ConsoleUI";
import {
  pendingContent,
  applicationLabel,
  sceneLabel,
} from "../../shared/presentation";
import { PlayerFeedSwitcher } from "./PlayerFeedSwitcher";
import { GraphicControls } from "./GraphicControls";
import type { GameResult, Side } from "../../shared/types";
import type { ReplayClip } from "../../shared/production-types";
import { useEffect, useRef, useState } from "react";
import type { Scene, StateContext } from "../../shared/types";
import type { CheckId, ProductionCommand } from "../../shared/production-types";
import {
  checkValid,
  objectiveRemaining,
  dataHealth,
  productionKey,
  programState,
} from "../../shared/production";
import { api, getTeam, sceneInfo, time } from "../lib";
import "./production-desk.css";

type AudioBus = {
  name: string;
  available: boolean;
  db?: number;
  muted?: boolean;
  peakDb?: number;
  heldPeakDb?: number;
  meterAvailable?: boolean;
  silentSeconds?: number;
  monitor?: string;
  syncOffset?: number;
};
type ProductionStatus = {
  audio: AudioBus[];
  disk: { directory?: string; freeBytes?: number; detail: string };
  recording: { outputActive: boolean; outputDuration: number } | null;
  bufferActive: boolean | null;
  emergencyAvailable: boolean;
  gameSource: string;
  playback?: {
    id: string;
    remainingSeconds: number;
    cursorSeconds: number;
    sampledAt: string;
  } | null;
};
type EngineHealth = {
  connected: boolean;
  selection?: { gameWindow: string; micEnabled: boolean };
  performance?: {
    activeFps: number;
    sampleSeconds: number;
    rendering: { percent: number };
    encoding: { percent: number };
    network: {
      percent: number;
      bitrateKbps: number;
      reconnecting: boolean;
      reconnectingSeconds?: number;
    };
    issues: string[];
  };
};
const checks: [CheckId, string][] = [
  ["identity", "比赛身份与十人名单"],
  ["game", "正确游戏窗口与采集区"],
  ["data", "数据样本匹配本局"],
  ["audio", "30 秒试录与声音回看"],
  ["disk", "录制路径与磁盘空间"],
  ["program", "节目内容与音画同步"],
  ["platform", "平台接收端人工回看"],
];

export function ProductionBar(ctx: StateContext) {
  const { state, send, notify } = ctx,
    p = state.production,
    pgm = programState(state),
    pending = pendingContent(state);
  const [output, setOutput] = useState<{
    connected: boolean;
    streamActive: boolean;
    recordActive: boolean;
  } | null>(null);
  useEffect(() => {
    let stopped = false,
      fetching = false;
    const refresh = async () => {
      if (document.hidden || fetching) return;
      fetching = true;
      try {
        const result = await api<{
          connected: boolean;
          streamActive: boolean;
          recordActive: boolean;
        }>("/api/obs/engine");
        if (!stopped) setOutput(result);
      } catch {
        if (!stopped) setOutput(null);
      } finally {
        fetching = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  const run = (command: ProductionCommand) =>
    void send({ type: "production", command }).catch(() => {});
  const engine = async (action: string) => {
    try {
      await api("/api/obs/production", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      notify("OBS 已确认操作", "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "操作未完成", "error");
    }
  };
  return (
    <section className="production-bar" aria-label="固定播出与应急控制">
      <div className="onair-identity">
        <strong>
          PGM ·{" "}
          {p?.playingClipId
            ? "独立回放"
            : sceneLabel(
                pgm,
                state.programScene,
                sceneInfo[state.programScene].name,
              )}
        </strong>
        <small>
          {getTeam(pgm, "blue")?.tag} {pgm.match.blueScore}:{pgm.match.redScore}{" "}
          {getTeam(pgm, "red")?.tag} · G{pgm.match.game} ·{" "}
          {p?.control?.name ?? "等待席位"}
        </small>
        <span
          className={`application-status ${p?.application?.status ?? ""}`}
          role="status"
        >
          {applicationLabel(state)}
        </span>
        <small className="global-output-state">
          OBS{" "}
          {state.connections.obs.status === "connected" ? "已连接" : "待连接"} ·{" "}
          {output?.connected
            ? output.streamActive
              ? "推流中"
              : "未推流"
            : "推流待确认"}{" "}
          ·{" "}
          {output?.connected
            ? output.recordActive
              ? "录制中"
              : "未录制"
            : "录制待确认"}
        </small>
      </div>
      <div className="pending-content">
        <strong>
          PVW ·{" "}
          {sceneLabel(
            state,
            state.previewScene,
            sceneInfo[state.previewScene].name,
          )}
        </strong>
        <details>
          <summary>
            {pending.length ? `${pending.length} 类待播改动` : "与节目内容一致"}{" "}
            ·{" "}
            {p?.persistence?.status === "failed"
              ? "磁盘保存失败"
              : p?.persistence?.status === "saving"
                ? "保存中"
                : "已保存配置"}
          </summary>
          <p>
            {pending.join("、") || "实时采样持续同步"} · 待播 v
            {p?.configVersion} / 节目 v{p?.program?.version}
          </p>
        </details>
      </div>
      <TakeControl {...ctx} compact />
      <div className="emergency-actions">
        <button
          className="button small"
          onClick={() => void engine("return-live")}
        >
          回到比赛
        </button>
        <button
          className="button small danger"
          onClick={() => void engine("emergency")}
        >
          技术暂停
        </button>
        <details>
          <summary>应急 / 核对</summary>
          <div>
            <button
              className="button small"
              onClick={() => run({ op: "immediate", action: "analysis-off" })}
            >
              关闭分析
            </button>
            <button
              className="button small"
              onClick={() => run({ op: "immediate", action: "feeds-off" })}
            >
              关闭选手画面
            </button>
            <button
              className="button small"
              disabled={!p?.previousProgram}
              title={!p?.previousProgram ? "尚无上一版节目" : ""}
              onClick={() => run({ op: "immediate", action: "undo" })}
            >
              撤回切换
            </button>
            <button
              className="button small"
              disabled={p?.application?.status !== "applied"}
              onClick={() => run({ op: "confirm-picture" })}
            >
              确认节目画面
            </button>
            <small>游戏前台备用：Ctrl+Alt+Shift+P</small>
          </div>
        </details>
      </div>
    </section>
  );
}

type TaskId =
  | "audio"
  | "replay"
  | "subtitle"
  | "feeds"
  | "rundown"
  | "incident"
  | "camera"
  | "prepare"
  | "seats"
  | "graphics";
const taskItems: { id: TaskId; label: string }[] = [
  { id: "audio", label: "音频" },
  { id: "replay", label: "回放" },
  { id: "subtitle", label: "字幕" },
  { id: "feeds", label: "选手" },
  { id: "rundown", label: "顺序" },
  { id: "incident", label: "暂停 / 结果" },
  { id: "camera", label: "镜头" },
  { id: "prepare", label: "开播检查" },
  { id: "graphics", label: "包装" },
  { id: "seats", label: "席位" },
];
type TaskContext = StateContext & {
  status: ProductionStatus | null;
  busy: boolean;
  host: boolean;
  canOutput: boolean;
  run: (work: () => Promise<unknown>, success?: string) => Promise<void>;
  command: (c: ProductionCommand, message?: string) => void;
  obs: (data: Record<string, unknown>) => void;
};
export function ProductionDesk(
  ctx: StateContext & { initialTask?: TaskId; allowedTasks?: TaskId[] },
) {
  const { state, send, notify } = ctx,
    p = state.production;
  const [status, setStatus] = useState<ProductionStatus | null>(null),
    [engine, setEngine] = useState<EngineHealth | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [task, setTask] = useState<TaskId>(ctx.initialTask ?? "audio");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const active = useRef(false),
    surface = useRef<HTMLElement>(null);
  useEffect(() => {
    if (state.connections.obs.status !== "connected") {
      setStatus(null);
      setEngine(null);
      return;
    }
    let stopped = false,
      fetching = false;
    const refresh = async () => {
      if (
        fetching ||
        document.hidden ||
        active.current ||
        surface.current?.closest("[hidden]")
      )
        return;
      fetching = true;
      const [prod, health] = await Promise.allSettled([
        api<ProductionStatus>("/api/obs/production"),
        api<EngineHealth>("/api/obs/engine"),
      ]);
      if (!stopped) {
        if (prod.status === "fulfilled") setStatus(prod.value);
        if (health.status === "fulfilled") setEngine(health.value);
      }
      fetching = false;
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [local, state.connections.obs.status]);
  if (!p) return null;
  const run: TaskContext["run"] = async (work, success = "") => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
      if (success) notify(success, "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作未完成");
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  const command: TaskContext["command"] = (command, message = "") =>
    void run(() => send({ type: "production", command }), message);
  const obs: TaskContext["obs"] = (data) =>
    void run(async () => {
      setStatus(
        await api<ProductionStatus>("/api/obs/production", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      );
    }, "OBS 制作操作已确认");
  const canOutput =
    (!ctx.seat ||
      (ctx.seat.role === "director" &&
        (!p.control || p.control.owner === ctx.seat.id))) &&
    local;
  const taskContext: TaskContext = {
    ...ctx,
    status,
    busy,
    run,
    command,
    obs,
    host: local,
    canOutput,
  };
  const perf = engine?.performance,
    health = dataHealth(state);
  const tasks = taskItems.filter(
    (t) => !ctx.allowedTasks || ctx.allowedTasks.includes(t.id),
  );
  const current = tasks.some((t) => t.id === task) ? task : tasks[0]?.id;
  return (
    <section
      ref={surface}
      className="production-desk panel"
      aria-label="比赛日制作控制"
    >
      <div className="production-task-nav">
        <TaskTabs
          items={tasks.filter((t) =>
            ["audio", "replay", "subtitle", "feeds"].includes(t.id),
          )}
          value={current}
          onChange={setTask}
          label="临场制作任务"
        />
        <select
          aria-label="更多制作任务"
          value={
            ["audio", "replay", "subtitle", "feeds"].includes(current)
              ? ""
              : current
          }
          onChange={(e) => {
            if (e.target.value) setTask(e.target.value as TaskId);
          }}
        >
          <option value="">更多</option>
          {tasks
            .filter(
              (t) => !["audio", "replay", "subtitle", "feeds"].includes(t.id),
            )
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
        </select>
      </div>
      {error && (
        <div role="alert" className="production-error">
          {error}
          <button aria-label="关闭制作错误" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {p.alerts
        ?.filter((a) => !a.resolvedAt)
        .map((a) => (
          <div className="production-error" key={a.id}>
            {a.text}
            <button
              className="button small"
              disabled={!!a.acknowledgedAt || busy}
              onClick={() => command({ op: "ack-alert", id: a.id })}
            >
              {a.acknowledgedAt ? "已确认，等待恢复" : "确认告警"}
            </button>
          </div>
        ))}
      <div className="task-content">
        {tasks.map((t) => (
          <div
            hidden={current !== t.id}
            key={t.id}
            role="tabpanel"
            aria-label={t.label}
          >
            {t.id === "audio" ? (
              <AudioTask {...taskContext} />
            ) : t.id === "replay" ? (
              <ReplayTask {...taskContext} />
            ) : t.id === "subtitle" ? (
              <SubtitleTask {...taskContext} />
            ) : t.id === "feeds" ? (
              <PlayerFeedSwitcher {...ctx} />
            ) : t.id === "prepare" ? (
              <PreparationTask {...taskContext} />
            ) : t.id === "camera" ? (
              <CameraTask {...taskContext} />
            ) : t.id === "incident" ? (
              <IncidentTask {...taskContext} />
            ) : t.id === "rundown" ? (
              <RundownTask {...taskContext} />
            ) : t.id === "graphics" ? (
              <GraphicControls {...ctx} />
            ) : (
              <SeatTask {...taskContext} />
            )}
          </div>
        ))}
      </div>
      <details className="production-health-details">
        <summary>
          信号与输出 · OBS {engine?.connected ? "已连接" : "待连接"} · KDA{" "}
          {health.stats}/{health.total} · 经济 {health.gold}/{health.total}
        </summary>
        <div className="production-health">
          <span>
            采集源{" "}
            {engine?.selection?.gameWindow ? "已选择 · 请核对" : "待选择"}
          </span>
          <span>
            渲染{" "}
            {perf
              ? `${perf.activeFps.toFixed(1)} fps / 丢帧 ${perf.rendering.percent.toFixed(2)}%`
              : "待采样"}
          </span>
          <span>
            编码丢帧 {perf ? `${perf.encoding.percent.toFixed(2)}%` : "待采样"}
          </span>
          <span>
            发送{" "}
            {perf
              ? `${Math.round(perf.network.bitrateKbps)} kbps / 丢帧 ${perf.network.percent.toFixed(2)}%`
              : "待确认"}
          </span>
          <span>
            磁盘{" "}
            {status?.disk.freeBytes !== undefined
              ? `${(status.disk.freeBytes / 1024 ** 3).toFixed(1)} GB`
              : "待核对"}
          </span>
          <span>
            平台 {checkValid(state, "platform") ? "已人工回看" : "待回看"}
          </span>
          <span>
            状态采样窗口{" "}
            {perf ? `${perf.sampleSeconds.toFixed(1)} 秒` : "待采样"}
          </span>
        </div>
      </details>
    </section>
  );
}
function AudioTask(ctx: TaskContext) {
  const { state, send, notify, status, busy, command, obs, run } = ctx,
    p = state.production!,
    currentKey = productionKey(state),
    clipKey = productionKey(programState(state));
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="production-task">
      <h3>现场音频</h3>
      <label className="toggle-setting">
        <span>显示采访、音乐和回放通道</span>
        <input
          type="checkbox"
          checked={expanded}
          onChange={(e) => setExpanded(e.target.checked)}
        />
      </label>
      <div className="production-audio">
        {(
          status?.audio ??
          [
            "RiftCast 桌面音频",
            "RiftCast 解说麦克风",
            "RiftCast 采访",
            "RiftCast 音乐",
            "RiftCast 回放片段",
          ].map((name) => ({ name, available: false }) as AudioBus)
        )
          .filter((_, index) => expanded || index < 2)
          .map((bus) => (
            <AudioStrip
              key={bus.name}
              bus={bus}
              busy={busy || !ctx.canOutput}
              obs={obs}
            />
          ))}
      </div>
      <button
        className="button small"
        disabled={busy}
        onClick={() => obs({ action: "tracks" })}
      >
        停播配置成品 / 游戏 / 解说三轨录制
      </button>
    </div>
  );
}

function AudioStrip({
  bus,
  busy,
  obs,
}: {
  bus: AudioBus;
  busy: boolean;
  obs: TaskContext["obs"];
}) {
  const [gain, setGain] = useState(bus.db ?? 0),
    editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setGain(bus.db ?? 0);
  }, [bus.db]);
  const submit = (value: number) => {
    if (!editing.current) return;
    editing.current = false;
    obs({ action: "audio", name: bus.name, db: value });
  };
  return (
    <div>
      <strong>{bus.name.replace("RiftCast ", "")}</strong>
      <span>
        {!bus.available
          ? "来源待接入"
          : !bus.meterAvailable
            ? "电平待采样"
            : `采样 ${bus.peakDb!.toFixed(1)} dB${(bus.heldPeakDb ?? bus.peakDb!) > -1 ? " · 接近削波" : ""}`}
      </span>
      <span className="audio-gain">
        {editing.current ? "目标增益" : "增益"}{" "}
        {bus.available ? gain.toFixed(1) : "—"} dB ·{" "}
        {bus.muted ? "静音" : "输出"}
        {bus.heldPeakDb !== undefined
          ? ` · 峰值保持 ${bus.heldPeakDb.toFixed(1)} dB`
          : ""}
      </span>
      <meter
        min={-60}
        max={0}
        value={bus.peakDb ?? -60}
        aria-label={`${bus.name} 电平`}
      />
      <input
        type="range"
        aria-label={`${bus.name} 音量`}
        min={-60}
        max={6}
        step={0.5}
        value={gain}
        disabled={!bus.available || busy}
        onChange={(e) => {
          editing.current = true;
          setGain(Number(e.target.value));
        }}
        onPointerUp={(e) => submit(Number(e.currentTarget.value))}
        onKeyUp={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          )
            submit(Number(e.currentTarget.value));
        }}
        onBlur={(e) => submit(Number(e.currentTarget.value))}
      />
      <button
        className="button small"
        disabled={!bus.available || busy}
        onClick={() =>
          obs({ action: "audio", name: bus.name, muted: !bus.muted })
        }
      >
        {bus.muted ? "取消静音" : "静音"}
      </button>
      <details className="audio-advanced">
        <summary>监听与同步</summary>
        <p>音量与静音立即作用于节目；峰值保持约 3.5 秒。</p>
        <select
          aria-label={`${bus.name} 监听`}
          disabled={!bus.available || busy}
          value={bus.monitor ?? "OBS_MONITORING_TYPE_NONE"}
          onChange={(e) =>
            obs({ action: "audio", name: bus.name, monitor: e.target.value })
          }
        >
          <option value="OBS_MONITORING_TYPE_NONE">关闭监听</option>
          <option value="OBS_MONITORING_TYPE_MONITOR_ONLY">仅监听</option>
          <option value="OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT">
            监听并送节目
          </option>
        </select>
        <input
          type="number"
          aria-label={`${bus.name} 同步偏移毫秒`}
          min={-10000}
          max={10000}
          defaultValue={bus.syncOffset ?? 0}
          disabled={!bus.available || busy}
          onBlur={(e) => {
            if (Number(e.target.value) !== bus.syncOffset)
              obs({
                action: "audio",
                name: bus.name,
                syncOffset: Number(e.target.value),
              });
          }}
        />
        <small>ms · 监听请使用独立耳机，避免返送重复采集。</small>
      </details>
    </div>
  );
}

function PreparationTask(ctx: TaskContext) {
  const { state, send, notify, status, busy, command, obs, run } = ctx,
    p = state.production!,
    currentKey = productionKey(state),
    clipKey = productionKey(programState(state));
  const [resourceStatus, setResourceStatus] = useState("");
  return (
    <div className="production-task">
      <h3>
        比赛日检查与固定版本 ·{" "}
        {checks.filter(([id]) => checkValid(state, id)).length}/7
      </h3>
      <div className="production-checks">
        {checks.map(([id, label]) => (
          <div key={id}>
            <span className={checkValid(state, id) ? "green-text" : ""}>
              {checkValid(state, id) ? "✓" : "○"} {label}
            </span>
            <small>
              {checkValid(state, id)
                ? `${p.checks[id]?.actor} · ${new Date(p.checks[id]!.at).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" })}`
                : "待人工确认"}
            </small>
            <button
              className="button small"
              disabled={busy}
              onClick={() => command({ op: "check", id, note: "人工核对" })}
            >
              确认
            </button>
          </div>
        ))}
      </div>
      <p className="muted">
        游戏来源或音频设备改变后，对应检查会失效；OBS
        已连接仍需分别核对画面、声音和接收端。
      </p>
      <div className="production-form">
        {(["game", "resources", "ocr"] as const).map((key, i) => (
          <label key={key}>
            {["比赛补丁", "静态资源版本", "OCR 布局版本"][i]}
            <input
              defaultValue={p.versions[key]}
              key={`${key}-${p.versions[key]}`}
              onBlur={(e) => {
                if (e.target.value !== p.versions[key])
                  command({
                    op: "settings",
                    versions: { ...p.versions, [key]: e.target.value },
                  });
              }}
            />
          </label>
        ))}
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await api<{ detail: string }>(
                "/api/resources/cache",
                {
                  method: "POST",
                  body: JSON.stringify({ version: p.versions.resources }),
                },
              );
              setResourceStatus(result.detail);
            })
          }
        >
          停播准备离线素材
        </button>
      </div>
      <button
        className="button small"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const report = await api<{
              detail: string;
              missing: string[];
              remote: string[];
            }>("/api/resources/inventory");
            setResourceStatus(
              `${report.detail}${report.missing.length ? " · 缺失：" + report.missing.join(" / ") : ""}${report.remote.length ? " · 远程图片请先上传至本机素材库" : ""}`,
            );
          })
        }
      >
        检查全部素材
      </button>
      <p>{resourceStatus}</p>
      {p.versions.game && p.versions.game !== p.versions.resources && (
        <p className="muted">
          比赛补丁与 Data Dragon 版本标记不同，请实际核对本场资源。
        </p>
      )}
      <a href="/api/archive" download>
        导出赛事资料、结果修订、视频与片段索引
      </a>
      <p className="muted">
        当前局内 API、LCU 与 Replay
        连接状态可在「连接与输出」核对；更新客户端后重新校准 OCR。
      </p>
    </div>
  );
}

function CameraTask(ctx: TaskContext) {
  const { state, send, notify, status, busy, command, obs, run } = ctx,
    p = state.production!,
    currentKey = productionKey(state),
    clipKey = productionKey(programState(state));
  const [markNote, setMarkNote] = useMemoryState(currentKey + ":mark", ""),
    [refreshSeconds, setRefreshSeconds] = useState("300");
  return (
    <div className="production-task">
      <h3>镜头提示、分析时长与选手保持</h3>
      <p className="muted">
        当前游戏捕获供节目和预监共用。镜头按键送到游戏观战窗口；工作台用于准备包装。本机键位在下方填写并经观战客户端核对。下列选手按钮用于准备选手数据包装。事件提示仅提醒导播。
      </p>
      <div className="production-form">
        <label>
          实际键盘控制对象
          <select
            value={p.keyboardTarget ?? "workbench"}
            onChange={(e) =>
              command({
                op: "settings",
                keyboardTarget: e.target.value as "game" | "workbench",
              })
            }
          >
            <option value="workbench">浏览器工作台</option>
            <option value="game">游戏观战窗口 · 手动切回焦点</option>
          </select>
        </label>
        <label>
          本机已核对的跟随 / 手动 / 迷雾键位
          <input
            defaultValue={p.cameraHints}
            onBlur={(e) =>
              command({ op: "settings", cameraHints: e.target.value })
            }
          />
        </label>
      </div>
      <div className="production-follow">
        {state.players.map((player) => (
          <button
            className="button small"
            key={player.id}
            onClick={() =>
              void send({ type: "select-player", playerId: player.id }).catch(
                () => {},
              )
            }
          >
            {player.name} · {player.role}
          </button>
        ))}
      </div>
      <div className="production-form">
        <label>
          分析播出时长 / 秒
          <input
            type="number"
            min={3}
            max={120}
            defaultValue={p.analysisSeconds}
            onBlur={(e) =>
              command({
                op: "settings",
                analysisSeconds: Number(e.target.value),
              })
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={p.feedHold}
            onChange={(e) =>
              command({ op: "settings", feedHold: e.target.checked })
            }
          />
          保持选手画面
        </label>
        <label>
          <input
            type="checkbox"
            checked={p.dynamicPreview}
            onChange={(e) =>
              command({ op: "settings", dynamicPreview: e.target.checked })
            }
          />
          主预监原生动态显示 · HUD 30 FPS
        </label>
        <label>
          观战布局
          <select
            value={p.layout}
            onChange={(e) =>
              command({
                op: "settings",
                layout: e.target.value as "single" | "dual",
              })
            }
          >
            <option value="single">单屏主控</option>
            <option value="dual">双屏观战</option>
          </select>
        </label>
      </div>
      <p>
        最新事件：{state.events.at(-1)?.text ?? "等待事件"} ·{" "}
        {p.marks.filter((m) => m.key === currentKey).at(-1)?.text ??
          "尚无人工提示"}
      </p>
      <div className="production-form">
        <input
          placeholder="危险、精彩或资源提示"
          value={markNote}
          onChange={(e) => setMarkNote(e.target.value)}
        />
        {(["danger", "highlight", "objective"] as const).map((kind, i) => (
          <button
            className="button small"
            key={kind}
            disabled={busy || !markNote.trim()}
            onClick={() => command({ op: "mark", text: markNote, kind })}
          >
            {["危险标记", "标记精彩", "资源标记"][i]}
          </button>
        ))}
      </div>
      <div className="production-form">
        <label>
          资源刷新间隔 / 秒
          <input
            type="number"
            min="1"
            max="3600"
            value={refreshSeconds}
            onChange={(e) => setRefreshSeconds(e.target.value)}
          />
        </label>
        <button
          className="button small"
          disabled={busy || !markNote.trim()}
          onClick={() =>
            command({
              op: "objective",
              label: markNote,
              reason: "导播人工确认",
            })
          }
        >
          确认资源事件
        </button>
        <button
          className="button small"
          disabled={busy || !markNote.trim()}
          onClick={() => {
            const seconds = Number(refreshSeconds);
            if (seconds > 0)
              command({
                op: "objective",
                label: markNote,
                dueTime: state.gameTime + seconds,
                reason: "本场版本人工确认",
              });
          }}
        >
          确认资源倒计时
        </button>
      </div>
      {p.objectives
        .filter((o) => o.key === currentKey)
        .slice(-4)
        .map((o) => (
          <p key={o.id}>
            {o.label} ·{" "}
            {objectiveRemaining(state, o) !== null
              ? `剩余 ${time(objectiveRemaining(state, o)!)}`
              : "计时待确认"}{" "}
            · {o.reason}
          </p>
        ))}
    </div>
  );
}

function ReplayTask(ctx: TaskContext) {
  const {
      state,
      send,
      notify,
      status,
      busy,
      command,
      obs,
      run,
      host,
      canOutput,
    } = ctx,
    p = state.production!,
    currentKey = productionKey(state),
    clipKey = productionKey(programState(state));
  const [clipTitle, setClipTitle] = useMemoryState(
      currentKey + ":clip-title",
      "",
    ),
    [allClips, setAllClips] = useState(false);
  return (
    <div className="production-task">
      <h3>独立回放缓冲与片段队列 · {p.clips.length} 个片段</h3>
      <p className="muted">
        缓冲初始为 60 秒。片段保留录制中的原比分和时钟，OBS 回放场景关闭实时
        HUD。当前游戏客户端继续向前。
      </p>
      {!host && (
        <p className="request-error">
          回放编排在导播主机完成，此席位可核对片段与待播顺序。
        </p>
      )}
      {host && !canOutput && (
        <p>片段准备完成后，由当前主导播控制席切入或返回比赛。</p>
      )}
      <fieldset className="task-fieldset" disabled={!host}>
        <label>
          片段标题
          <input
            value={clipTitle}
            onChange={(e) => setClipTitle(e.target.value)}
            placeholder="例如 23:40 大龙团战"
            maxLength={120}
          />
        </label>
        <div className="inline-buttons">
          <button
            className="button"
            disabled={busy || !canOutput || status?.bufferActive === true}
            onClick={() => obs({ action: "start-buffer" })}
          >
            启动缓冲
          </button>
          <button
            className="button"
            disabled={busy || !status?.bufferActive}
            onClick={() =>
              obs({ action: "save-clip", title: clipTitle || undefined })
            }
          >
            保存精彩片段
          </button>
          <button
            className="button"
            disabled={busy || !canOutput || !status?.bufferActive}
            onClick={() => obs({ action: "stop-buffer" })}
          >
            停止缓冲
          </button>
          <button
            className="button primary"
            disabled={busy || !canOutput}
            onClick={() => obs({ action: "return-live" })}
          >
            立即回到比赛
          </button>
        </div>
        {p.playingClipId && (
          <p className="feed-onair-summary" role="status">
            正在播出：{p.clips.find((c) => c.id === p.playingClipId)?.title} ·{" "}
            {status?.playback
              ? `剩余 ${status.playback.remainingSeconds.toFixed(1)} 秒（OBS 采样）`
              : "进度待确认"}{" "}
            · 到达出点后返回比赛
          </p>
        )}
        {(p.playingClipId ||
          ["economy", "gold-ranking", "ranking"].includes(
            state.programScene,
          )) && (
          <div className="production-current-game">
            <strong>当前比赛监视器 · 游戏来源</strong>
            <LiveGameImage />
            <span>
              当前比赛 {time(state.gameTime)} · 分析与回放播出期间继续观察
            </span>
          </div>
        )}
        <label>
          片段范围
          <select
            value={allClips ? "all" : "current"}
            onChange={(e) => setAllClips(e.target.value === "all")}
          >
            <option value="current">当前节目对局</option>
            <option value="all">全部对局</option>
          </select>
        </label>
        {!p.clips.some((c) => allClips || c.key === clipKey) && (
          <EmptyState title="尚无本局回放片段">
            启动缓冲，在精彩时刻保存片段；完成预监核对后切入。
          </EmptyState>
        )}
        {p.clips
          .filter((c) => allClips || c.key === clipKey)
          .map((clip) => (
            <ClipEditor
              key={clip.id}
              clip={clip}
              busy={busy}
              current={clip.key === clipKey}
              playing={!!p.playingClipId}
              canOutput={canOutput}
              obs={obs}
            />
          ))}
      </fieldset>
    </div>
  );
}

function IncidentTask(ctx: TaskContext) {
  const { state, send, notify, status, busy, command, obs, run } = ctx,
    p = state.production!,
    currentKey = productionKey(state),
    clipKey = productionKey(programState(state));
  const [pauseReason, setPauseReason] = useMemoryState(
      currentKey + ":pause",
      "",
    ),
    [remakeReason, setRemakeReason] = useMemoryState(
      currentKey + ":remake",
      "",
    ),
    [correctionReason, setCorrectionReason] = useMemoryState(
      currentKey + ":correction",
      "",
    ),
    [resultId, setResultId] = useState(""),
    [pauseKind, setPauseKind] = useState<"official" | "signal" | "replay">(
      "official",
    );
  const result =
    state.gameResults?.find((r) => r.id === resultId) ??
    state.gameResults
      ?.filter((r) => r.seriesId === state.match.seriesId)
      .at(-1);
  return (
    <div className="production-task">
      <h3>正式暂停、信号恢复、重赛与结果纠正</h3>
      <div className="incident-card">
        <h3>暂停与信号恢复</h3>
        {p.pause ? (
          <p role="status">
            <strong>
              {p.pause.kind === "official"
                ? "正式暂停"
                : p.pause.kind === "signal"
                  ? "信号故障"
                  : "录像暂停"}
            </strong>{" "}
            · {p.pause.reason} · 已经过 <Elapsed since={p.pause.at} />
          </p>
        ) : (
          <p>当前未记录暂停</p>
        )}
        <label>
          暂停 / 恢复理由
          <input
            value={pauseReason}
            onChange={(e) => setPauseReason(e.target.value)}
            maxLength={300}
          />
        </label>
        <div className="inline-buttons">
          <select
            aria-label="暂停类型"
            value={pauseKind}
            onChange={(e) => setPauseKind(e.target.value as typeof pauseKind)}
          >
            <option value="official">裁判正式暂停</option>
            <option value="signal">信号故障</option>
            <option value="replay">录像暂停</option>
          </select>
          <button
            className="button"
            disabled={busy || !pauseReason.trim()}
            onClick={() =>
              command({ op: "pause", kind: pauseKind, reason: pauseReason })
            }
          >
            记录暂停
          </button>
          <button
            className="button"
            disabled={busy || !pauseReason.trim() || !p.pause}
            onClick={() => command({ op: "resume", reason: pauseReason })}
          >
            核对后恢复就绪
          </button>
        </div>
        <small>恢复就绪后，请核对预监并切入比赛。</small>
      </div>
      <div className="incident-card">
        <h3>
          本局重赛 · GAME {state.match.game} / 尝试 {p.attempt}
        </h3>
        <label>
          裁判重赛理由
          <input
            value={remakeReason}
            onChange={(e) => setRemakeReason(e.target.value)}
            maxLength={300}
          />
        </label>
        <p>将作废当前尝试，保留审计记录，并创建下一次尝试。</p>
        <HoldButton
          disabled={busy || !remakeReason.trim()}
          onExecute={() => command({ op: "remake", reason: remakeReason })}
        >
          按住 1 秒重赛第 {state.match.game} 局
        </HoldButton>
      </div>
      {result && (
        <div className="incident-card">
          <h3>纠正已保存结果</h3>
          <select
            aria-label="纠正结果的局"
            value={result.id}
            onChange={(e) => setResultId(e.target.value)}
          >
            {state.gameResults
              ?.filter((r) => r.seriesId === state.match.seriesId)
              .map((r) => (
                <option value={r.id} key={r.id}>
                  GAME {r.game} ·{" "}
                  {r.winner ? resultTeam(r, r.winner) : "胜方待确认"}
                </option>
              ))}
          </select>
          <p>
            原结果：
            {result.winner ? resultTeam(result, result.winner) : "待确认"} ·
            系列赛 {state.match.blueScore}:{state.match.redScore}
          </p>
          <label>
            结果纠正理由
            <input
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              maxLength={300}
            />
          </label>
          <p>确认后将重算系列赛比分和赛程，并保留修订记录。</p>
          <div className="inline-buttons">
            {(["blue", "red"] as const).map((side) => (
              <HoldButton
                key={side}
                disabled={busy || !correctionReason.trim()}
                onExecute={() =>
                  void run(
                    () =>
                      send({
                        type: "correct-result",
                        resultId: result.id,
                        winner: side,
                        reason: correctionReason,
                      }),
                    "结果已修订并保存",
                  )
                }
              >
                按住确认 {resultTeam(result, side)} 获胜
              </HoldButton>
            ))}
          </div>
        </div>
      )}
      <div className="production-video-index">
        {p.videos.slice(-10).map((v) => (
          <p key={v.id}>
            {v.title} · GAME {v.game} · 尝试 {v.attempt} ·{" "}
            {v.file || "录制进行中"} · 视频{" "}
            {v.startVideoSeconds?.toFixed(1) ?? "待确认"}–
            {v.endVideoSeconds?.toFixed(1) ?? "录制中"}s ·{" "}
            {v.detail || "录制待结束"}{" "}
            {v.file && (
              <a href={`/api/videos/${v.id}/file`}>打开对应录像文件</a>
            )}
          </p>
        ))}
      </div>
      <p className="muted">
        长期记录与片段索引继续保留；快捷列表显示最近项目，赛事包含全部结果与索引。快照列表最多保留
        100 条，旧快照可从有效结果记录导出。
      </p>
    </div>
  );
}

function RundownTask(ctx: TaskContext) {
  const { state, send, notify, status, busy, command, obs, run } = ctx,
    p = state.production!,
    currentKey = productionKey(state),
    clipKey = productionKey(programState(state));
  const [rundownScene, setRundownScene] = useState<Scene>("live");
  return (
    <div className="production-task">
      <h3>待播顺序</h3>
      <div className="production-form">
        <select
          value={rundownScene}
          onChange={(e) => setRundownScene(e.target.value as Scene)}
        >
          {Object.entries(sceneInfo).map(([scene, info]) => (
            <option value={scene} key={scene}>
              {info.name}
            </option>
          ))}
        </select>
        <button
          className="button"
          onClick={() =>
            command({
              op: "rundown",
              items: [
                ...p.rundown,
                {
                  id: crypto.randomUUID(),
                  scene: rundownScene,
                  title: sceneInfo[rundownScene].name,
                  seconds: 15,
                  status: "pending",
                },
              ],
            })
          }
        >
          加入待播顺序
        </button>
      </div>
      {p.rundown.map((item, index) => (
        <div className="production-rundown" key={item.id}>
          <span>
            <b>
              {index + 1}. {item.title}
            </b>{" "}
            · {item.seconds}s ·{" "}
            {item.status === "aired"
              ? "已播"
              : item.status === "ready"
                ? "预备"
                : "待准备"}
          </span>
          <button
            className="button small"
            onClick={() =>
              void run(async () => {
                await send({ type: "preview-scene", scene: item.scene });
                await send({
                  type: "production",
                  command: {
                    op: "rundown",
                    items: p.rundown.map((r) =>
                      r.id === item.id ? { ...r, status: "ready" } : r,
                    ),
                  },
                });
              })
            }
          >
            预备
          </button>
          <TakeControl {...ctx} scene={item.scene} compact />
          <button
            className="button small"
            disabled={
              state.programScene !== item.scene ||
              !["applied", "confirmed"].includes(p.application?.status ?? "")
            }
            onClick={() =>
              command({
                op: "rundown",
                items: p.rundown.map((r) =>
                  r.id === item.id ? { ...r, status: "aired" } : r,
                ),
              })
            }
          >
            核对后标记已播
          </button>
          <button
            className="button small"
            aria-label={`上移 ${item.title}`}
            disabled={index === 0}
            onClick={() => {
              const items = [...p.rundown];
              [items[index - 1], items[index]] = [
                items[index],
                items[index - 1],
              ];
              command({ op: "rundown", items });
            }}
          >
            ↑
          </button>
          <button
            className="button small"
            aria-label={`下移 ${item.title}`}
            disabled={index === p.rundown.length - 1}
            onClick={() => {
              const items = [...p.rundown];
              [items[index + 1], items[index]] = [
                items[index],
                items[index + 1],
              ];
              command({ op: "rundown", items });
            }}
          >
            ↓
          </button>
          <label>
            秒
            <input
              type="number"
              min="1"
              max="3600"
              defaultValue={item.seconds}
              onBlur={(e) =>
                command({
                  op: "rundown",
                  items: p.rundown.map((r) =>
                    r.id === item.id
                      ? { ...r, seconds: Number(e.target.value) }
                      : r,
                  ),
                })
              }
            />
          </label>
          <button
            className="button small"
            onClick={() =>
              command({
                op: "rundown",
                items: p.rundown.filter((r) => r.id !== item.id),
              })
            }
          >
            移除
          </button>
        </div>
      ))}
    </div>
  );
}

function SubtitleTask({
  state,
  send,
  command,
  busy,
  notify,
  seat,
}: TaskContext) {
  const [text, setText] = useMemoryState(
      productionKey(state) + ":subtitle",
      state.overlay.tickerText,
    ),
    [savedVersion, setSavedVersion] = useMemoryState(
      productionKey(state) + ":subtitle-version",
      state.production?.configVersion,
    ),
    version = useRef(savedVersion),
    original = useRef(state.overlay.tickerText);
  const pgm = programState(state),
    dirty = text !== state.overlay.tickerText;
  useEffect(() => {
    if (text === original.current) {
      setText(state.overlay.tickerText);
      version.current = state.production?.configVersion;
    }
    original.current = state.overlay.tickerText;
  }, [state.overlay.tickerText]);
  return (
    <div className="production-task">
      <h3>字幕准备与播出</h3>
      <div className="subtitle-onair">
        <b>当前节目</b>
        <p>{pgm.overlay.ticker ? pgm.overlay.tickerText : "字幕已撤下"}</p>
      </div>
      <label>
        字幕模板
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) setText(e.target.value);
          }}
        >
          <option value="">选择常用模板</option>
          <option>比赛即将开始，请稍候</option>
          <option>比赛暂停，正在处理技术问题</option>
          <option>本局结束，下一局即将开始</option>
          <option>感谢收看本场比赛</option>
        </select>
      </label>
      <label>
        待播字幕
        <textarea
          aria-label="待播字幕"
          rows={3}
          maxLength={500}
          value={text}
          onChange={(e) => {
            if (text === state.overlay.tickerText) {
              version.current = state.production?.configVersion;
              setSavedVersion(version.current);
            }
            setText(e.target.value);
          }}
        />
      </label>
      <p>
        {text.length} / 500 字 · {dirty ? "本地未保存" : "已存入待播"}
      </p>
      <div className="inline-buttons">
        <button
          className="button"
          disabled={busy || !dirty}
          onClick={() =>
            void send({
              type: "set-overlay",
              expectedConfigVersion: version.current,
              patch: { ticker: true, tickerText: text },
            })
              .then(() => {
                version.current = (state.production?.configVersion ?? 0) + 1;
                notify("字幕已保存到待播，请核对后切入", "success");
              })
              .catch(() => {})
          }
        >
          保存到待播
        </button>
        <button
          className="button"
          disabled={busy || !dirty}
          onClick={() => {
            setText(state.overlay.tickerText);
            version.current = state.production?.configVersion;
          }}
        >
          放弃修改
        </button>
        {seat?.role === "director" &&
          (!state.production?.control ||
            state.production.control.owner === seat.id) && (
            <>
              <button
                className="button primary"
                disabled={
                  busy ||
                  !text.trim() ||
                  state.connections.obs.status !== "connected"
                }
                onClick={() =>
                  command({ op: "immediate", action: "ticker", text })
                }
              >
                立即播出字幕
              </button>
              <button
                className="button"
                disabled={busy || !pgm.overlay.ticker}
                onClick={() =>
                  command({ op: "immediate", action: "ticker", text: "" })
                }
              >
                立即撤下
              </button>
            </>
          )}
      </div>
      <small>普通保存等待整体切入；立即播出由主导播执行。</small>
    </div>
  );
}

function SeatTask({ state, busy, run, command }: TaskContext) {
  const [reason, setReason] = useMemoryState("seat:reason", ""),
    [name, setName] = useState("协作席位"),
    [role, setRole] = useState("data"),
    [url, setUrl] = useState("");
  const p = state.production!,
    local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  return (
    <div className="production-task">
      <h3>控制席与快捷键</h3>
      <p>节目控制者：{p.control?.name ?? "等待主导播连接"}</p>
      <label>
        接管理由
        <input
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button
        className="button"
        disabled={busy || !reason.trim()}
        onClick={() =>
          void run(
            () =>
              api("/api/control/claim", {
                method: "POST",
                body: JSON.stringify({ reason }),
              }),
            "已接管节目控制",
          )
        }
      >
        凭理由接管主导播席
      </button>
      {local && (
        <div className="incident-card">
          <h4>邀请协作席</h4>
          <label>
            席位名称
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            权限
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {[
                ["readonly", "只读"],
                ["data", "资料"],
                ["subtitle", "字幕"],
                ["replay", "回放"],
                ["director", "主导播"],
              ].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const invite = await api<{ url?: string }>(
                  "/api/control/invite",
                  { method: "POST", body: JSON.stringify({ role, name }) },
                );
                setUrl(invite.url ?? "请先启用局域网控制");
              })
            }
          >
            生成席位邀请
          </button>
          {url && <input aria-label="移动席位邀请链接" readOnly value={url} />}
        </div>
      )}
      <details>
        <summary>快捷键配置 · 输入框中暂停响应</summary>
        {Object.entries(p.hotkeys).map(([key, value]) => (
          <label key={key}>
            {
              (
                {
                  take: "切入节目",
                  live: "回到比赛",
                  analysis: "关闭分析",
                  feeds: "关闭选手",
                  emergency: "技术暂停",
                  undo: "撤回",
                } as Record<string, string>
              )[key]
            }
            <input
              defaultValue={value}
              onBlur={(e) => {
                if (e.target.value !== value)
                  command({
                    op: "settings",
                    hotkeys: { ...p.hotkeys, [key]: e.target.value },
                  });
              }}
            />
          </label>
        ))}
      </details>
    </div>
  );
}

function ClipEditor({
  clip,
  busy,
  current,
  playing,
  canOutput,
  obs,
}: {
  clip: ReplayClip;
  busy: boolean;
  current: boolean;
  playing: boolean;
  canOutput: boolean;
  obs: TaskContext["obs"];
}) {
  const [start, setStart] = useState(clip.inPoint),
    [end, setEnd] = useState(clip.outPoint),
    [audio, setAudio] = useState(clip.audio);
  useEffect(() => {
    setStart(clip.inPoint);
    setEnd(clip.outPoint);
    setAudio(clip.audio);
  }, [clip.inPoint, clip.outPoint, clip.audio]);
  const invalid =
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end > clip.duration ||
      end <= start,
    dirty =
      start !== clip.inPoint || end !== clip.outPoint || audio !== clip.audio;
  return (
    <article className="production-clip">
      <strong>{clip.title}</strong>
      <small>
        {current ? "本局" : "其他局"} · 保存于{" "}
        {new Date(clip.savedAt).toLocaleTimeString("zh-CN")} ·{" "}
        {time(clip.duration)} ·{" "}
        {clip.status === "saved"
          ? "等待解码预监"
          : clip.status === "ready"
            ? "预监就绪"
            : "曾经播出"}
      </small>
      {clip.status !== "saved" && !playing && (
        <video
          controls
          preload="metadata"
          src={`/api/clips/${clip.id}/file#t=${start},${end}`}
          aria-label={`${clip.title} 画面与声音预监`}
        />
      )}
      <div className="clip-trim">
        <label>
          入点 {start.toFixed(1)} 秒
          <input
            type="range"
            min="0"
            max={clip.duration}
            step="0.1"
            value={start}
            onChange={(e) =>
              setStart(Math.min(Number(e.target.value), end - 0.1))
            }
          />
          <input
            aria-label="精确入点秒"
            type="number"
            min="0"
            max={end - 0.1}
            step="0.1"
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
          />
        </label>
        <label>
          出点 {end.toFixed(1)} 秒
          <input
            type="range"
            min="0"
            max={clip.duration}
            step="0.1"
            value={end}
            onChange={(e) =>
              setEnd(Math.max(Number(e.target.value), start + 0.1))
            }
          />
          <input
            aria-label="精确出点秒"
            type="number"
            min={start + 0.1}
            max={clip.duration}
            step="0.1"
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
          />
        </label>
      </div>
      <label>
        声音
        <select
          value={audio}
          onChange={(e) => setAudio(e.target.value as typeof audio)}
        >
          <option value="original">片段原声</option>
          <option value="commentary">现场解说</option>
        </select>
      </label>
      <p>
        预计播出 {Math.max(0, end - start).toFixed(1)} 秒
        {invalid ? " · 请设置有效入点和出点" : ""}
      </p>
      <div className="inline-buttons">
        <button
          className="button"
          disabled={busy || !dirty || invalid || playing}
          onClick={() =>
            obs({
              action: "edit-clip",
              id: clip.id,
              inPoint: start,
              outPoint: end,
              audio,
            })
          }
        >
          保存剪辑
        </button>
        <button
          className="button"
          disabled={busy || !current || playing || dirty}
          onClick={() => obs({ action: "prepare-clip", id: clip.id })}
        >
          解码预监
        </button>
        <button
          className="button primary"
          disabled={
            busy ||
            !canOutput ||
            clip.status === "saved" ||
            !current ||
            playing ||
            dirty
          }
          onClick={() => obs({ action: "play-clip", id: clip.id })}
        >
          切入片段
        </button>
      </div>
      {(!current || dirty) && (
        <small>
          {!current ? "请使用当前节目对局的片段" : "先保存剪辑，再重新预监核对"}
        </small>
      )}
    </article>
  );
}

function resultTeam(result: GameResult, side: Side) {
  return (
    result.teams.find(
      (t) => t.id === (side === "blue" ? result.blueTeamId : result.redTeamId),
    )?.name ?? (side === "blue" ? "蓝方" : "红方")
  );
}
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{time((now - Date.parse(since)) / 1000)}</>;
}
function LiveGameImage() {
  const surface = useRef<HTMLDivElement>(null);
  const [stamp, setStamp] = useState(Date.now()),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !surface.current?.closest("[hidden]"))
        setStamp(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div ref={surface}>
      {failed && <p>游戏来源暂不可用，请检查捕获窗口</p>}
      <img
        hidden={failed}
        src={`/api/obs/game-frame?t=${stamp}`}
        onLoad={() => setFailed(false)}
        onError={() => setFailed(true)}
        alt="持续前进的当前游戏画面"
      />
    </div>
  );
}
export function HoldButton({
  children,
  onExecute,
  disabled = false,
}: {
  children: React.ReactNode;
  onExecute: () => void;
  disabled?: boolean;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    [holding, setHolding] = useState(false);
  const stop = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      aria-label={typeof children === "string" ? children : undefined}
      className={`button small danger ${holding ? "holding" : ""}`}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setHolding(true);
        timer.current = setTimeout(() => {
          stop();
          onExecute();
        }, 1000);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          setHolding(true);
          timer.current = setTimeout(() => {
            stop();
            onExecute();
          }, 1000);
        }
      }}
      onKeyUp={stop}
      onBlur={stop}
    >
      <span className="hold-progress" aria-hidden="true" />
      {children}
      {holding && <small>保持按住…</small>}
    </button>
  );
}
