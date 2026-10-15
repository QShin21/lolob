import {PostgamePageControl} from '../components/PostgamePageControl';
import { useEffect, useRef, useState } from "react";
import { Archive, ArrowRight, Check, Circle, Film, Trophy } from "lucide-react";
import type { BroadcastAction, StateContext } from "../../shared/types";
import type { OutputAction } from "../../shared/obs-output";
import {
  currentGameResult,
  frozenGameState,
  gameResultAwaitingTerminalSample,
  gameResultKey,
} from "../../shared/game-results";
import { checkValid, programState } from "../../shared/production";
import { api, getTeam, time } from "../lib";
import { useMemoryState } from "../useMemoryState";
import { TaskTabs } from "../components/ConsoleUI";
import { BroadcastCanvas } from "../components/BroadcastCanvas";
import { HoldButton } from "../components/ProductionDesk";
import { OutputSignals } from "../components/OutputSignals";
import type { ObsEngineStatus } from "../components/EmbeddedObs";
import "../components/domain-workspace.css";
import "./wrap-workspace.css";

type Props = StateContext & {
  onSettings: () => void;
  onRecords: () => void;
  onManage: () => void;
  onNextGame?: () => void;
  onNewSeries?: () => void;
  onReport?: () => void;
  streamReady: boolean;
};
export function WrapUp({
  state,
  champions,
  send,
  notify,
  seat,
  connected,
  onSettings,
  onRecords,
  onManage,
  onNextGame = onManage,
  onNewSeries = onNextGame,
  onReport = onRecords,
}: Props) {
  const result = currentGameResult(state),
    view = frozenGameState(state),
    key = gameResultKey(state),
    attempt = state.production?.attempt ?? 1;
  const [tab, setTab] = useState<"result" | "report" | "video" | "corrections">(
    "result",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState("");
  const pending = useRef(false);
  const [acceptReason, setAcceptReason] = useMemoryState(
    key + ":wrap-accept",
    "",
  );
  const [remakeReason, setRemakeReason] = useMemoryState(
    key + ":wrap-remake",
    "",
  );
  const [correctionReason, setCorrectionReason] = useMemoryState(
    key + ":wrap-correction",
    "",
  );
  const [selectedResult, setSelectedResult] = useState("");
  const results =
    state.gameResults?.filter((r) => r.seriesId === state.match.seriesId) ?? [];
  const correction =
    results.find((r) => r.id === selectedResult) ?? result ?? results.at(-1);
  const waiting = gameResultAwaitingTerminalSample(result),
    winner = result?.winner ? getTeam(view, result.winner) : undefined;
  const videos =
    state.production?.videos.filter(
      (v) =>
        v.seriesId === state.match.seriesId &&
        v.game === state.match.game &&
        v.attempt === attempt,
    ) ?? [];
  const controller =
    !!seat &&
    connected === true &&
    seat.role === "director" &&
    state.production?.control?.owner === seat.id;
  const canSave =
    !!seat && connected && (seat.role === "director" || seat.role === "data");
  const reportConfirmed =
    !!result &&
    gameResultKey(programState(state)) === result.key &&
    state.programScene === "postgame" &&
    checkValid(state, "program");
  const nextReason = !controller
    ? `由当前主导播 ${state.production?.control?.name ?? "待确认"} 推进`
    : !result
      ? "先保存本局结果"
      : waiting
        ? "等待终局样本或凭理由采用现有记录"
        : !result.winner
          ? "先确认本局胜方"
          : result.seriesComplete
            ? "本场系列赛已经结束"
            : "";
  async function act(
    action: BroadcastAction,
    message: string,
    after?: () => void,
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setReceipt("");
    try {
      await send(action);
      setReceipt(message);
      notify(message);
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作未完成，当前输入已保留");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const checks = [
    {
      title: "本局胜方",
      ready: !!result?.winner,
      detail: winner ? `${winner.name} 获胜` : "等待裁判或客户端确认",
    },
    {
      title: "终局数据",
      ready: !!result && !waiting,
      detail: !result
        ? "本局尚未结算"
        : waiting
          ? "已保存观察，等待终局样本"
          : result.terminalSampleComplete === false
            ? "已凭理由采用，缺失仍保留"
            : "终局已保存并冻结",
    },
    {
      title: "节目报告",
      ready: reportConfirmed,
      detail: reportConfirmed
        ? "本局本版节目已人工核对"
        : "准备报告后，在导播台核对节目版本",
    },
    {
      title: "本局录像",
      ready: videos.some((v) => v.verified === true),
      detail: videos.some((v) => v.file)
        ? "文件已索引，请核对可播放性"
        : "未取得对应录像文件",
    },
  ];
  return (
    <section
      className="domain-workspace wrap-workbench"
      aria-label="赛后收尾工作面"
    >
      <header className="domain-heading">
        <div>
          <h1>赛后收尾</h1>
          <p>
            {state.match.title} · 第 {state.match.game} 局 · 尝试 {attempt}
          </p>
        </div>
        <span>
          {state.match.format} · {time(view.gameTime)}
          <small className="wrap-series-id">{state.match.seriesId}</small>
        </span>
      </header>
      <div className="wrap-identity">
        <div data-side="blue">
          <span>蓝方</span>
          <strong>{getTeam(view, "blue")?.name ?? "未提供战队"}</strong>
        </div>
        <b>
          {view.match.blueScore}
          <i>:</i>
          {view.match.redScore}
        </b>
        <div data-side="red">
          <span>红方</span>
          <strong>{getTeam(view, "red")?.name ?? "未提供战队"}</strong>
        </div>
        <span className="wrap-result-label">
          {winner
            ? `${winner.tag} 获胜`
            : result
              ? "胜方待确认"
              : "本局尚未结算"}
        </span>
      </div>
      {error && (
        <div className="domain-note error" role="alert">
          {error}
        </div>
      )}
      {receipt && !error && (
        <p className="wrap-receipt" role="status">
          {receipt}
        </p>
      )}
      <div className="wrap-stage">
        <div className="wrap-task">
          <TaskTabs
            items={[
              { id: "result", label: "胜方与终局" },
              { id: "report", label: "报告核对" },
              { id: "video", label: "录像与归档" },
              { id: "corrections", label: "重赛与修订" },
            ]}
            value={tab}
            onChange={setTab}
            label="收尾任务"
          />
          <div className="wrap-task-body domain-scroll">
            {tab === "result" && (
              <>
                <h2>{result ? "核对本局结果" : "保存本局末次观测"}</h2>
                <p>
                  {result
                    ? result.source === "manual"
                      ? "本局由人工结算，已保存观测数据。"
                      : "客户端已确认对局结束，本局已自动保存。"
                    : "客户端确认结束后会自动保存。若无法取得结束信号，可明确结算当前局，再核对胜方和终局样本。"}
                </p>
                {!result ? (
                  <div className="wrap-finalize">
                    <dl className="domain-facts">
                      <div>
                        <dt>当前采集</dt>
                        <dd>
                          {state.players.length} 名选手 · {state.events.length}{" "}
                          条事件
                        </dd>
                      </div>
                      <div>
                        <dt>本局时间</dt>
                        <dd>{time(state.gameTime)}</dd>
                      </div>
                      <div>
                        <dt>数据模式</dt>
                        <dd>
                          {state.mode === "demo"
                            ? "虚构演示数据"
                            : "本地客户端采集"}
                        </dd>
                      </div>
                    </dl>
                    <button
                      className="button primary"
                      disabled={
                        !controller ||
                        busy ||
                        !state.players.length ||
                        state.gameTime <= 0
                      }
                      onClick={() =>
                        void act(
                          { type: "finalize-game" },
                          "已保存末次观测记录，请核对终局样本与胜方",
                        )
                      }
                    >
                      手动结算当前局并冻结数据
                    </button>
                    <small>
                      结算会保存本局结果；不填写胜方时不会累加系列赛比分。
                    </small>
                  </div>
                ) : (
                  <>
                    <div className="wrap-winner-choices">
                      {(["blue", "red"] as const).map((side) => (
                        <section key={side} data-side={side}>
                          <span>{side === "blue" ? "蓝方" : "红方"}</span>
                          <h3>{getTeam(view, side)?.name ?? "战队未提供"}</h3>
                          {result.winner ? (
                            <strong>
                              {result.winner === side
                                ? "已确认获胜"
                                : "本局未获胜"}
                            </strong>
                          ) : (
                            <button
                              className="button"
                              disabled={!controller || busy}
                              onClick={() =>
                                void act(
                                  { type: "finalize-game", winner: side },
                                  `已确认 ${getTeam(view, side)?.name ?? side} 获胜并更新系列赛比分`,
                                )
                              }
                            >
                              确认 {getTeam(view, side)?.name ?? side} 获胜
                            </button>
                          )}
                        </section>
                      ))}
                    </div>
                    <section className="wrap-terminal">
                      <h3>{waiting ? "终局样本仍待补齐" : "终局记录已冻结"}</h3>
                      <p>
                        {waiting
                          ? "本局观测已保存。接口恢复后继续等待终局样本；裁判确认接口不可用时，填写理由采用现有记录。缺失数据不会补成零。"
                          : result.terminalSampleComplete === false
                            ? "本局已采用现有记录，仍含缺失字段或末次观察值；导出保留原采样时间。"
                            : "历史数据、阵容和系列赛比分保存在本局记录中，下一局不会覆盖。"}
                      </p>
                      {waiting && (
                        <>
                          <label>
                            采用现有终局记录的理由
                            <textarea
                              aria-label="采用现有终局记录的理由"
                              maxLength={300}
                              value={acceptReason}
                              onChange={(e) => setAcceptReason(e.target.value)}
                              placeholder="填写裁判确认理由"
                            />
                          </label>
                          <button
                            className="button"
                            disabled={
                              !controller || busy || !acceptReason.trim()
                            }
                            onClick={() =>
                              void act(
                                {
                                  type: "production",
                                  command: {
                                    op: "accept-final",
                                    reason: acceptReason,
                                  },
                                },
                                "已确认采用现有记录，缺失字段继续保留",
                              )
                            }
                          >
                            凭理由采用现有记录
                          </button>
                        </>
                      )}
                    </section>
                  </>
                )}
              </>
            )}
            {tab === "report" && (
              <>
                <div className="wrap-section-heading">
                  <h2>第 {state.match.game} 局赛后报告</h2>
                  <span>
                    {result ? (waiting ? "观测归档" : "冻结记录") : "尚未结算"}
                  </span>
                </div>
                {result ? (
                  <>
<PostgamePageControl state={state} send={send} />
                    <BroadcastCanvas
                      state={{ ...view, selectedPlayerId: null }}
                      champions={champions}
                      scene="postgame"
                    />
                    <p>
                      本页是本局归档排版预览，不代表已经切入。先准备预监，再在导播台
                      TAKE、查看应用回执并核对节目版本。
                    </p>
                    <div className="domain-actions">
                      <button
                        className="button primary"
                        disabled={busy || !canSave}
                        onClick={() =>
                          void act(
                            { type: "preview-scene", scene: "postgame" },
                            `第 ${result.game} 局赛后报告已设为预监`,
                            onReport,
                          )
                        }
                      >
                        赛后报告发送至预监
                      </button>
                      <button
                        className="button"
                        disabled={busy || !canSave}
                        onClick={() =>
                          void act(
                            { type: "preview-scene", scene: "interview" },
                            "采访已设为预监",
                            onReport,
                          )
                        }
                      >
                        准备采访
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="domain-empty">
                    先确认本局结束，再核对对应局的冻结报告。
                  </div>
                )}
              </>
            )}
            {tab === "video" && (
              <>
                <h2>本局录像与数据归档</h2>
                <p>按系列赛、局号和尝试匹配。数据快照与视频文件分别保存。</p>
                {videos.length ? (
                  videos.map((v) => (
                    <article className="wrap-video" key={v.id}>
                      <Film size={20} />
                      <div>
                        <h3>{v.title}</h3>
                        <p>
                          {v.file || "录制尚未结束"} ·{" "}
                          {v.detail || "状态待核对"}
                        </p>
                        <small>
                          视频范围 {v.startVideoSeconds?.toFixed(1) ?? "未提供"}
                          –{v.endVideoSeconds?.toFixed(1) ?? "未结束"} 秒 ·{" "}
                          {v.playable
                            ? "可播放"
                            : v.file
                              ? "播放状态待核对"
                              : "尚无文件"}
                        </small>
                        {v.file && (
                          <a
                            className="button small"
                            href={`/api/videos/${encodeURIComponent(v.id)}/file`}
                          >
                            打开对应录像文件
                          </a>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="domain-note">
                    尚无本局录像索引。请在输出页检查 REC
                    状态，不能用数据归档代替录像验收。
                  </div>
                )}
                <div className="wrap-export">
                  <h3>本局数据</h3>
                  <div className="domain-actions">
                    {result && (
                      <>
                        <a
                          className="button"
                          href={`/api/export?format=json&recordingId=${encodeURIComponent(result.snapshot.id)}`}
                          download
                        >
                          导出本局 JSON
                        </a>
                        <a
                          className="button"
                          href={`/api/export?format=csv&recordingId=${encodeURIComponent(result.snapshot.id)}`}
                          download
                        >
                          导出本局 CSV
                        </a>
                      </>
                    )}
                    <button
                      className="button"
                      disabled={busy || !canSave}
                      onClick={() =>
                        void act(
                          { type: "save-recording" },
                          "对局数据快照已保存",
                          onRecords,
                        )
                      }
                    >
                      另存当前快照
                    </button>
                    <button className="button" onClick={onRecords}>
                      <Archive size={15} />
                      全部比赛记录
                    </button>
                  </div>
                </div>
              </>
            )}
            {tab === "corrections" && (
              <>
                <h2>重赛与结果修订</h2>
                <section className="wrap-correction">
                  <h3>
                    重赛第 {state.match.game} 局 · 当前尝试 {attempt}
                  </h3>
                  <p>
                    作废当前尝试并保留审计与已有归档，创建下一次尝试。不会删除录像文件。
                  </p>
                  <label>
                    裁判重赛理由
                    <textarea
                      maxLength={300}
                      value={remakeReason}
                      onChange={(e) => setRemakeReason(e.target.value)}
                    />
                  </label>
                  <HoldButton
                    disabled={!controller || busy || !remakeReason.trim()}
                    onExecute={() =>
                      void act(
                        {
                          type: "production",
                          command: { op: "remake", reason: remakeReason },
                        },
                        "当前尝试已作废，已创建重赛尝试",
                        onNextGame,
                      )
                    }
                  >
                    按住 1 秒重赛第 {state.match.game} 局
                  </HoldButton>
                </section>
                {correction && (
                  <section className="wrap-correction">
                    <h3>修订已保存胜方</h3>
                    <label>
                      纠正结果的局
                      <select
                        value={correction.id}
                        onChange={(e) => setSelectedResult(e.target.value)}
                      >
                        {results.map((r) => (
                          <option key={r.id} value={r.id}>
                            第 {r.game} 局 · 尝试{" "}
                            {r.snapshot.result?.attempt ?? 1} ·{" "}
                            {r.winner
                              ? getTeam(
                                  { ...state, match: r.match, teams: r.teams },
                                  r.winner,
                                )?.name
                              : "胜方待确认"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      修订将重算系列赛比分与赛程，并保留理由、操作者和版本记录。
                    </p>
                    <label>
                      结果纠正理由
                      <textarea
                        maxLength={300}
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                      />
                    </label>
                    <div className="domain-actions">
                      {(["blue", "red"] as const).map((side) => (
                        <HoldButton
                          key={side}
                          disabled={
                            !controller || busy || !correctionReason.trim()
                          }
                          onExecute={() =>
                            void act(
                              {
                                type: "correct-result",
                                resultId: correction.id,
                                winner: side,
                                reason: correctionReason,
                              },
                              "结果已修订，系列赛比分已重算",
                            )
                          }
                        >
                          按住确认{" "}
                          {getTeam(
                            {
                              ...state,
                              match: correction.match,
                              teams: correction.teams,
                            },
                            side,
                          )?.name ?? side}{" "}
                          获胜
                        </HoldButton>
                      ))}
                    </div>
                  </section>
                )}
                <details className="wrap-history">
                  <summary>本系列赛修订与作废记录</summary>
                  {state.production?.corrections
                    .filter((c) => results.some((r) => r.id === c.resultId))
                    .map((c) => (
                      <p key={`${c.resultId}-${c.version}`}>
                        v{c.version} · {c.actor} · {c.reason}
                      </p>
                    ))}
                  {state.production?.invalidAttempts
                    .filter(
                      (a) =>
                        a.result?.seriesId === state.match.seriesId ||
                        (!!state.match.seriesId &&
                          a.key.includes(state.match.seriesId)),
                    )
                    .map((a) => (
                      <p key={a.key}>已作废尝试 · {a.reason}</p>
                    ))}
                </details>
              </>
            )}
          </div>
        </div>
        <aside className="wrap-checklist domain-scroll">
          <h2>本局核对</h2>
          {checks.map((c) => (
            <button
              key={c.title}
              className="wrap-check"
              data-ready={c.ready}
              onClick={() =>
                setTab(
                  c.title === "节目报告"
                    ? "report"
                    : c.title === "本局录像"
                      ? "video"
                      : "result",
                )
              }
            >
              {c.ready ? <Check size={17} /> : <Circle size={17} />}
              <span>
                <strong>{c.title}</strong>
                <small>{c.detail}</small>
              </span>
            </button>
          ))}
          <div className="wrap-next">
            <h3>{result?.seriesComplete ? "系列赛已结束" : "继续本系列赛"}</h3>
            <button
              className="button primary"
              disabled={busy || !!nextReason}
              title={nextReason || "保留系列赛比分并进入下一局 BP"}
              onClick={() =>
                void act(
                  { type: "next-game" },
                  `已进入第 ${state.match.game + 1} 局准备，上局记录已保留`,
                  onNextGame,
                )
              }
            >
              {result?.seriesComplete ? (
                <Trophy size={15} />
              ) : (
                <ArrowRight size={15} />
              )}
              下一局 · GAME {state.match.game + 1}
            </button>
            {nextReason && <small>{nextReason}</small>}
            <button className="button" onClick={onManage}>
              载入另一场比赛
            </button>
            <button className="button small" onClick={onNewSeries}>
              前往 BP 规则开启新系列赛
            </button>
          </div>
          <WrapOutput
            controller={controller}
            notify={notify}
            onSettings={onSettings}
          />
        </aside>
      </div>
    </section>
  );
}

function WrapOutput({
  controller,
  notify,
  onSettings,
}: {
  controller: boolean;
  notify: StateContext["notify"];
  onSettings: () => void;
}) {
  const [status, setStatus] = useState<ObsEngineStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const operation = useRef({ pending: false, generation: 0 });
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  useEffect(() => {
    let alive = true,
      fetching = false;
    const refresh = async () => {
      if (fetching || document.hidden || operation.current.pending) return;
      fetching = true;
      const generation = operation.current.generation;
      try {
        const next = await api<ObsEngineStatus>("/api/obs/engine");
        if (alive && generation === operation.current.generation) {
          setStatus(next);
          setError(next.error || "");
        }
      } catch {
        if (alive && generation === operation.current.generation) {
          setStatus(null);
          setError("输出状态暂不可用，请打开输出页核对");
        }
      } finally {
        fetching = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  async function stop(action: OutputAction) {
    if (operation.current.pending) return;
    operation.current.pending = true;
    operation.current.generation++;
    setBusy(true);
    setError("");
    try {
      const next = await api<ObsEngineStatus>("/api/obs/engine/output", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setStatus(next);
      if (
        (action === "stop-stream" && next.streamActive !== false) ||
        (action === "stop-record" && next.recordActive !== false) ||
        (action === "stop-virtual-camera" &&
          (next.virtualCamActive !== false ||
            next.companionAudio?.active ||
            next.companionAudio?.managing))
      )
        throw Error(
          next.companionAudio?.error ||
            next.error ||
            "停止或恢复尚未确认，请核对实际输出状态",
        );
      setError(next.error || "");
      notify(
        action === "stop-stream"
          ? "RTMP 已停止"
          : action === "stop-record"
            ? "本机录制已停止"
            : "伴侣音画已停止；外部直播状态请在伴侣确认",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "停止操作未完成");
    } finally {
      operation.current.pending = false;
      operation.current.generation++;
      setBusy(false);
    }
  }
  const allowed = controller && local && status?.connected && !busy;
  return (
    <section className="wrap-output">
      <h3>结束本场输出</h3>
      <OutputSignals status={status} />
      <p>
        先在伴侣结束直播，再停止伴侣音画。RTMP 和 REC
        分别停止；局间继续播出时保持所需通道。
      </p>
      {status?.streamActive && (
        <HoldButton
          disabled={!allowed}
          onExecute={() => void stop("stop-stream")}
        >
          按住停止 RTMP
        </HoldButton>
      )}
      {(status?.virtualCamActive ||
        status?.companionAudio?.active ||
        status?.companionAudio?.managing) && (
        <HoldButton
          disabled={!allowed}
          onExecute={() => void stop("stop-virtual-camera")}
        >
          按住停止伴侣音画并恢复
        </HoldButton>
      )}
      {status?.recordActive && (
        <HoldButton
          disabled={!allowed}
          onExecute={() => void stop("stop-record")}
        >
          按住停止本机录制
        </HoldButton>
      )}
      {error && (
        <p role="alert" className="wrap-output-error">
          {error}
        </p>
      )}
      <button className="button small" onClick={onSettings}>
        打开输出与恢复
      </button>
    </section>
  );
}
