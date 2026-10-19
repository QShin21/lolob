import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Check,
  ChevronRight,
  Search,
  ShieldCheck,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";
import { programState } from "../../shared/production";
import type { ControlSeat, Notice, Scene, StateContext } from "../../shared/types";
import { MonitorPane } from "../components/MonitorPane";
import { BroadcastCanvas } from "../components/BroadcastCanvas";
import { Notification, TakeControl } from "../components/ConsoleUI";
import { ProductionDesk } from "../components/ProductionDesk";
import { SeatRecovery, type SeatRecoveryProps } from "../components/SeatRecovery";
import {
  applicationLabel,
  pendingContent,
  sceneLabel,
} from "../../shared/presentation";
import { getTeam, sceneDetails, sceneInfo } from "../lib";
import { useRemoteViewport } from './useRemoteViewport';
import { customSceneFacts } from '../components/custom-scene-status';
import "./remote-workbench.css";

const roleNames = {
  readonly: "只读席",
  data: "资料席",
  subtitle: "字幕席",
  replay: "回放席",
  director: "主导播席",
};
const roleTasks = {
  readonly: {
    title: "核对节目",
    detail: "查看节目、预监与应用回执，发现问题后与当前控制者核对。",
  },
  data: {
    title: "准备内容与场景",
    detail: "选择预监，准备包装与选手画面。保存的内容由当前主导播核对切入。",
  },
  subtitle: {
    title: "准备待播字幕",
    detail: "对照正在播出的字幕修改草稿。保存到待播后，由当前主导播核对播出。",
  },
  replay: {
    title: "准备回放与播单",
    detail: "核对片段归属、入出点和待播顺序。播放与返回比赛由当前主导播执行。",
  },
  director: {
    title: "节目制作",
    detail: "准备场景与临场内容；节目控制权归属见上方状态。",
  },
};

export function Remote(
  ctx: StateContext & {
    connected: boolean;
    toast: Notice | null;
    dismissNotice: () => void;
    displaySeat?: ControlSeat;
    seatRecovery: SeatRecoveryProps;
  },
) {
  const { state, seat, displaySeat, seatRecovery, connected, toast, dismissNotice } = ctx;
  const viewport = useRemoteViewport();
  const [monitor, setMonitor] = useState<"program" | "preview">("program"),
    [seatIssue, setSeatIssue] = useState("");
  const seatIdentity = useRef(seat?.id);
  useEffect(() => {
    if (seatIdentity.current !== seat?.id) {
      seatIdentity.current = seat?.id;
      setSeatIssue("");
    }
  }, [seat?.id]);
  useEffect(() => {
    if (
      toast?.kind === "error" &&
      /重新连接操作席位|连接已授权的操作席位|席位.*(?:失效|撤销)|邀请.*失效|当前席位为只读/.test(
        toast.message,
      )
    )
      setSeatIssue(toast.message);
  }, [toast]);
  const role = displaySeat?.role ?? "readonly",
    onAir = programState(state),
    displayState = monitor === "program" ? onAir : state;
  const owner =
    !!seat &&
    seat.role === "director" &&
    state.production?.control?.owner === seat.id &&
    !seatIssue;
  const controller =
    state.production?.control?.name || "尚未连接的主导播控制席";
  const hasPreparationTask = role === "data" || role === "director";
  const pending = pendingContent(state),
    identity = roleTasks[role];
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const scene = monitor === "program" ? state.programScene : state.previewScene;
  const custom = displayState.customScenes?.find(item => item.id === scene);
  const customFacts = custom && customSceneFacts(custom, displayState);
  return (
    <main className={`remote-workbench ${owner ? "has-control" : ""} ${viewport.editing ? 'is-editing' : ''}`} data-keyboard={viewport.keyboardInset > 0 ? 'open' : 'closed'} style={{ '--remote-keyboard-inset': `${viewport.keyboardInset}px` } as CSSProperties}>
      <header className="remote-identity">
        <div className="remote-brand-line">
          <strong>RiftCast</strong>
          <span className={`remote-sync ${connected ? "is-connected" : ""}`}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}{" "}
            {connected ? seat ? "已同步" : "数据已同步 · 待验证席位" : "同步中断"}
          </span>
        </div>
        <div className="remote-seat-heading">
          <div>
            <h1>{displaySeat ? roleNames[role] : "正在验证席位"}</h1>
            <span title={displaySeat?.name}>{displaySeat?.name || "等待授权身份"}{displaySeat && !seat ? " · 尚未验证" : ""}</span>
          </div>
          {owner && (
            <span className="remote-own-control">
              <ShieldCheck size={16} />
              持有控制权
            </span>
          )}
        </div>
        <div className="remote-controller">
          <UserRound size={15} />
          <span>节目控制者</span>
          <strong title={controller}>{controller}</strong>
        </div>
      </header>
      {!connected && (
        <div className="remote-connection-warning" role="alert">
          <strong>正在重新连接导播工作站</strong>
          <p>当前显示最后收到的状态。本地草稿保留，恢复同步后再提交。</p>
        </div>
      )}
      <SeatRecovery {...seatRecovery}/>
      {seatIssue && seatRecovery.status === "verified" && (
        <div className="remote-connection-warning" role="alert">
          <strong>操作席位需要重新验证</strong>
          <p>
            {seatIssue}
            。本地输入已保留，请联系主机导播核对邀请和席位。重新打开有效邀请前先保留未保存文字。
          </p>
        </div>
      )}
      {toast && (
        <div className="remote-notice">
          <Notification notice={toast} dismiss={dismissNotice} />
        </div>
      )}
      <section className="remote-monitor" aria-label="节目与预监核对">
        <div className="remote-match">
          <span title={displayState.match.title}>
            {displayState.match.title}
          </span>
          <strong>
            {getTeam(displayState, "blue")?.tag || "蓝方"}
            <b>
              {displayState.match.blueScore} : {displayState.match.redScore}
            </b>
            {getTeam(displayState, "red")?.tag || "红方"}
          </strong>
          <small>
            GAME {displayState.match.game}
            {""}
          </small>
        </div>
        <div
          className="remote-monitor-switch"
          role="tablist"
          aria-label="监视画面"
        >
          {(["program", "preview"] as const).map((kind, index) => (
            <button
              id={`remote-${kind}-tab`}
              key={kind}
              role="tab"
              aria-selected={monitor === kind}
              aria-controls="remote-monitor-panel"
              tabIndex={monitor === kind ? 0 : -1}
              onClick={() => setMonitor(kind)}
              onKeyDown={(event) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? "program"
                      : event.key === "End"
                        ? "preview"
                        : index === 0
                          ? "preview"
                          : "program";
                  setMonitor(next);
                  document.getElementById(`remote-${next}-tab`)?.focus();
                }
              }}
            >
              <span>{kind === "program" ? "PGM" : "PVW"}</span>
              {kind === "program" ? "节目" : "预监"}
              {monitor === kind && <Check size={14} />}
            </button>
          ))}
        </div>
        <div
          className="remote-monitor-panel"
          id="remote-monitor-panel"
          role="tabpanel"
          aria-labelledby={`remote-${monitor}-tab`}
        >
          {local ? (
            <MonitorPane
              key={monitor}
              state={state}
              champions={ctx.champions}
              kind={monitor}
            />
          ) : (
            <div className={`remote-layout-monitor ${monitor}`}>
              <div className="remote-layout-label">
                <strong>
                  {monitor === "program" ? "PGM 节目排版" : "PVW 待播排版"}
                </strong>
                <span>
                  {sceneLabel(
                    displayState,
                    scene,
                    sceneDetails(displayState, scene).name,
                  )}
                </span>
              </div>
              <BroadcastCanvas
                bus={monitor}
                state={displayState}
                champions={ctx.champions}
                scene={scene}
              />
              <p>排版示意 · OBS 合成仅在导播主机核对</p>
            </div>
          )}
        </div>
        <div
          className={`remote-receipt ${state.production?.application?.status || ""}`}
        >
          <span>{applicationLabel(state)}</span>
          <small>
            {monitor === "preview"
              ? `${pending.length} 类内容已保存待播`
              : "以已切入的节目配置为准"}
          </small>
        </div>
        {state.production?.application?.status === "failed" && (
          <p className="remote-application-error" role="alert">
            {state.production.application.detail ||
              "应用未完成，请由当前控制者检查主机 OBS 后重试。"}
          </p>
        )}
        {custom && customFacts && <details className="remote-composition-facts"><summary>自定义构图与来源核对</summary><dl><div><dt>当前画面配置</dt><dd>{monitor === 'program' ? '已切入的节目快照' : '已保存待播'}</dd></div><div><dt>可见来源</dt><dd>图片 {customFacts.images} / 窗口 {customFacts.windows} / 共享 OBS {customFacts.sharedInputs}</dd></div><div><dt>隐藏图层</dt><dd>{customFacts.hidden}</dd></div></dl><p>{customFacts.missingImages.length ? `${customFacts.missingImages.length} 张可见图片缺少素材记录。` : '图片文件及捕获来源在 TAKE 前核验。'}窗口与共享输入需在主机核对实际画面；共享输入内容和音频可受 OBS 外部修改影响。</p></details>}
      </section>
      {!owner && (
        <div className="remote-handoff">
          <ShieldCheck size={17} />
          <p>
            {seat
              ? `节目切入由 ${controller} 执行。`
              : "席位验证完成后才能准备内容。"}
            {role === "director" && seat && (
              <span>主导播角色尚未持有当前节目控制权。</span>
            )}
          </p>
        </div>
      )}
      <section className="remote-role-task" aria-label={identity.title}>
        <header className="remote-task-heading">
          <h2>{identity.title}</h2>
          <p>{identity.detail}</p>
        </header>
        {hasPreparationTask && <fieldset className="remote-task-fields" disabled={!connected || !!seatIssue || !seat}><RemoteScenes ctx={ctx} /></fieldset>}
        <fieldset
          className="remote-task-fields"
          disabled={!connected || !!seatIssue || !seat}
          aria-label="当前席位制作任务"
        >
          {displaySeat && role === "subtitle" && (
            <ProductionDesk
              {...ctx}
              initialTask="subtitle"
              allowedTasks={["subtitle"]}
            />
          )}
          {displaySeat && role === "replay" && (
            <ProductionDesk
              {...ctx}
              initialTask="replay"
              allowedTasks={["replay", "rundown"]}
            />
          )}
          {displaySeat && role === "director" && (
            <ProductionDesk
              {...ctx}
              initialTask="subtitle"
              allowedTasks={
                owner
                  ? ["subtitle", "replay", "feeds", "rundown", "incident"]
                  : ["subtitle", "replay", "feeds", "rundown"]
              }
            />
          )}
          {displaySeat && role === "data" && (
            <ProductionDesk
              {...ctx}
              initialTask="graphics"
              allowedTasks={["graphics", "feeds"]}
            />
          )}
        </fieldset>
        {role === "readonly" && (
          <div className="remote-readonly">
            <dl>
              <div>
                <dt>正在节目</dt>
                <dd>{sceneDetails(onAir, state.programScene).name}</dd>
              </div>
              <div>
                <dt>已准备预监</dt>
                <dd>{sceneDetails(state, state.previewScene).name}</dd>
              </div>
              <div>
                <dt>待播内容</dt>
                <dd>{pending.join("、") || "与节目配置一致"}</dd>
              </div>
              <div>
                <dt>应用回执</dt>
                <dd>{applicationLabel(state)}</dd>
              </div>
            </dl>
            <p>
              需要修改内容时，由主机导播提供相应任务席位。此席位可持续核对画面与状态。
            </p>
          </div>
        )}
      </section>
      <details className="remote-composition-facts remote-overlay-check"><summary>字幕、暂停与回放核对</summary><dl><div><dt>节目字幕配置</dt><dd>{onAir.overlay.ticker ? onAir.overlay.tickerText || '内容为空' : '已撤下'}{state.programScene === 'teamfight' ? '；团战不绘制包装' : state.programScene.startsWith('custom:') ? '；自定义输出按 OBS 构图核对' : ''}</dd></div><div><dt>制作暂停记录</dt><dd>{state.production?.pause ? `${state.production.pause.reason}（${state.production.pause.actor}）` : '无暂停记录'}</dd></div><div><dt>引擎回放记录</dt><dd>{state.production?.playingClipId ? state.production.clips.find(clip => clip.id === state.production?.playingClipId)?.title || '片段待核对' : '未记录活动片段'}</dd></div></dl><p>这些是当前配置和引擎记录。实际画面、声音及平台接收由当前导播核对。</p></details>
      {owner && (
        <footer className="remote-take-dock">
          <div>
            <small>将切入当前预监</small>
            <strong title={sceneDetails(state, state.previewScene).name}>
              {sceneDetails(state, state.previewScene).name}
            </strong>
            <span>
              {pending.length
                ? `${pending.length} 类待播改动`
                : "可再次应用当前场景"}
            </span>
          </div>
          <TakeControl {...ctx} />
        </footer>
      )}
    </main>
  );
}

function RemoteScenes({ ctx }: { ctx: StateContext }) {
  const { state, send, notify, connected } = ctx;
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState<"all" | "custom">("all"),
    [busy, setBusy] = useState<Scene | null>(null),
    [error, setError] = useState("");
  const active = useRef(false);
  const scenes = (
    [
      ...Object.keys(sceneInfo),
      ...(state.customScenes ?? []).map((scene) => scene.id),
    ] as Scene[]
  ).filter(
    (scene) =>
      (filter !== "custom" || scene.startsWith("custom:")) &&
      sceneDetails(state, scene)
        .name.toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const prepare = async (scene: Scene) => {
    if (active.current || connected === false) return;
    active.current = true;
    setBusy(scene);
    setError("");
    try {
      await send({ type: "preview-scene", scene });
      notify(`${sceneDetails(state, scene).name} 已设为预监`, "success");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "场景准备未完成，请核对连接和权限",
      );
    } finally {
      active.current = false;
      setBusy(null);
    }
  };
  return (
    <section className="remote-scene-picker" aria-label="准备预监场景">
      <div className="remote-scenes-heading">
        <h3>准备预监场景</h3>
        <span>选择后仍需切入节目</span>
      </div>
      <label className="remote-scene-search">
        <Search size={16} />
        <input
          type="search"
          aria-label="搜索预监场景"
          placeholder="搜索场景"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className="remote-scene-filters" aria-label="场景范围">
        <button
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          全部场景
        </button>
        <button
          aria-pressed={filter === "custom"}
          onClick={() => setFilter("custom")}
        >
          自定义（{state.customScenes?.length ?? 0}）
        </button>
      </div>
      <div className="remote-scenes-list">
        {scenes.map((scene) => (
          <button
            className={`remote-scene-option ${state.previewScene === scene ? "is-preview" : ""}`}
            key={scene}
            disabled={!!busy || connected === false}
            aria-pressed={state.previewScene === scene}
            onClick={() => void prepare(scene)}
          >
            <span>
              <strong>{sceneDetails(state, scene).name}</strong>
              <small>
                {busy === scene
                  ? "准备中…"
                  : scene.startsWith("custom:")
                    ? "已保存的自定义场景"
                    : sceneDetails(state, scene).description}
              </small>
            </span>
            <span className="remote-scene-status">
              {state.programScene === scene && (
                <b className="is-program">PGM</b>
              )}
              {state.previewScene === scene && <b>PVW</b>}
              {state.previewScene !== scene && <ChevronRight size={16} />}
            </span>
          </button>
        ))}
        {!scenes.length && (
          <p className="remote-empty">
            {search
              ? "没有匹配场景，请修改搜索词。"
              : "暂无自定义场景，可在主机导播台创建后在这里准备预监。"}
          </p>
        )}
      </div>
      {error && (
        <p className="remote-task-error" role="alert">
          {error}
        </p>
      )}
      {filter === "custom" && (
        <p className="remote-source-boundary">
          移动端只选择已保存场景。应用窗口、OBS
          来源和图层在主机编辑，实际合成由主机核对。
        </p>
      )}
    </section>
  );
}
