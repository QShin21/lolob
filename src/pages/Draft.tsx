import { useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  CircleDot,
  Eye,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import type { StateContext } from "../../shared/types";
import { productionKey } from "../../shared/production";
import { championFor, getTeam } from "../lib";
import { TakeControl } from "../components/ConsoleUI";
import { BroadcastCanvas, ChampionImage } from "../components/BroadcastCanvas";
import {
  DraftProductionControls,
  type DraftControlTask,
} from "../components/DraftProductionControls";
import {
  DraftChampionPicker,
  draftSlotName,
  type DraftSlot,
} from "../components/DraftChampionPicker";
import {
  draftRuleLabel,
  usedDraftChampions,
} from "../components/FearlessControls";
import "./draft-workbench.css";

export function Draft(ctx: StateContext) {
  const { state, champions, send, notify, seat, connected } = ctx;
  const trigger = useRef<HTMLButtonElement | null>(null),
    productionSection = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<DraftSlot | null>(null),
    [task, setTask] = useState<DraftControlTask>("assignments"),
    [preview, setPreview] = useState(false);
  const [preparing, setPreparing] = useState(false),
    [error, setError] = useState("");
  const canPrepare =
    !!seat && ["director", "data"].includes(seat.role) && connected !== false;
  const owner =
    !!seat &&
    seat.role === "director" &&
    state.production?.control?.owner === seat.id;
  const mode = state.production?.draftMode ?? "auto",
    activeTeam = getTeam(state, state.draft.activeTeam);
  const activeKind = /禁|ban/i.test(state.draft.action) ? "Bans" : "Picks";
  const nextIndex = Array.from({ length: 5 }, (_, index) => index).find(
    (index) => !state.draft[`${state.draft.activeTeam}${activeKind}`][index],
  );
  const nextSlot: DraftSlot | undefined =
    nextIndex === undefined ||
    state.draft.locked ||
    /等待/.test(state.draft.action)
      ? undefined
      : { side: state.draft.activeTeam, kind: activeKind, index: nextIndex };
  const openTask = (next: DraftControlTask) => {
    setTask(next);
    requestAnimationFrame(() => {
      productionSection.current?.scrollIntoView({
        block: "nearest",
        behavior: "auto",
      });
      productionSection.current
        ?.querySelector<HTMLButtonElement>(`[role="tab"][aria-selected="true"]`)
        ?.focus();
    });
  };
  const editSlot = (next: DraftSlot, button: HTMLButtonElement) => {
    trigger.current = button;
    setSlot(next);
  };
  const preparePreview = async () => {
    if (!canPrepare || preparing) return;
    setPreparing(true);
    setError("");
    try {
      await send({ type: "preview-scene", scene: "draft" });
      notify("BP 已设为预监，请在导播台核对实际合成画面", "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "预监准备未完成");
    } finally {
      setPreparing(false);
    }
  };
  return (
    <div className="bp-workbench">
      <header className="bp-round">
        <div
          className={`bp-round-clock ${state.draft.activeTeam} ${state.draft.locked ? "is-complete" : ""}`}
        >
          <b>
            {state.draft.locked ? (
              <Check size={26} aria-hidden="true" />
            ) : (
              Math.max(0, Math.ceil(state.draft.timer))
            )}
          </b>
          <span>{state.draft.locked ? "已锁定" : "秒"}</span>
        </div>
        <div className="bp-round-copy">
          <h1>
            {state.draft.locked
              ? "选择已完成，核对最终归属"
              : `${activeTeam?.tag || (state.draft.activeTeam === "blue" ? "蓝方" : "红方")} ${state.draft.action || "等待 BP"}`}
          </h1>
          <p>
            <span>GAME {state.match.game}</span>
            {nextSlot && <strong>待处理 {draftSlotName(nextSlot)}</strong>}
            <span>{draftRuleLabel(state)}</span>
          </p>
        </div>
        <div className="bp-round-tools">
          <span className="bp-source">
            <CircleDot size={14} />
            {mode === "auto"
              ? state.mode === "demo"
                ? "演示 BP 数据"
                : "客户端自动同步"
              : mode === "manual"
                ? "人工接管"
                : "客户端差异核对"}
          </span>
          <button className="bp-button" onClick={() => openTask("sync")}>
            <RefreshCw size={14} />
            接管与差异
          </button>
        </div>
      </header>
      {(!canPrepare || error) && (
        <div
          className={error ? "bp-error" : "bp-permission-note"}
          role={error ? "alert" : "status"}
        >
          {error ||
            (connected === false
              ? "同步中断，保留最后 BP 与本地草稿，重新连接后再保存。"
              : seat
                ? "当前席位可核对 BP；修改槽位由资料席或主导播席执行。"
                : "正在验证操作席位。")}
        </div>
      )}
      <div className="bp-team-boards">
        {(["blue", "red"] as const).map((side) => {
          const team = getTeam(state, side),
            picks = state.draft[`${side}Picks`],
            preselect = state.draft[`${side}Preselect`] ?? [],
            locked =
              state.production?.assignments.filter(
                (a) =>
                  a.team === side &&
                  a.locked &&
                  picks.includes(a.championId) &&
                  state.players.some(
                    (player) =>
                      player.id === a.playerId && player.team === side,
                  ),
              ).length ?? 0;
          return (
            <section
              className="bp-team"
              data-side={side}
              key={side}
              aria-label={`${team?.name || (side === "blue" ? "蓝方" : "红方")} BP`}
            >
              <header className="bp-team-heading">
                <div>
                  <span>{side === "blue" ? "蓝色方" : "红色方"}</span>
                  <h2 title={team?.name}>{team?.name || "等待战队"}</h2>
                </div>
                <strong>{state.match[`${side}Score`]}</strong>
                <small>
                  {picks.filter(Boolean).length}/5 已选
                  <br />
                  {locked}/5 人工归属
                </small>
              </header>
              <div className="bp-pick-head">
                <span>选择顺序 / 英雄</span>
                <span>最终选手归属</span>
              </div>
              <div className="bp-pick-list">
                {Array.from({ length: 5 }, (_, index) => {
                  const id = picks[index] || "",
                    assignment = state.production?.assignments.find(
                      (a) => a.team === side && a.locked && a.championId === id,
                    ),
                    player = assignment
                      ? state.players.find(
                          (player) =>
                            player.id === assignment.playerId &&
                            player.team === side,
                        )
                      : state.draft.locked
                        ? state.players.find(
                            (player) =>
                              player.team === side &&
                              player.championId === id &&
                              player.role !== "待分路",
                          )
                        : undefined;
                  const current =
                    nextSlot?.side === side &&
                    nextSlot.kind === "Picks" &&
                    nextSlot.index === index;
                  return (
                    <button
                      className={`bp-pick-row ${current ? "is-current" : ""}`}
                      key={index}
                      disabled={!canPrepare}
                      aria-label={`${side === "blue" ? "蓝方 B" : "红方 R"}${index + 1}，${championFor(champions, id)?.name || id || "未选择"}，编辑英雄`}
                      onClick={(event) =>
                        editSlot(
                          { side, kind: "Picks", index },
                          event.currentTarget,
                        )
                      }
                    >
                      <b className="bp-pick-order">
                        {side === "blue" ? "B" : "R"}
                        {index + 1}
                      </b>
                      <ChampionImage champions={champions} id={id} />
                      <span className="bp-pick-champion">
                        <strong>
                          {championFor(champions, id)?.name || id || "等待选择"}
                        </strong>
                        <small>
                          {current
                            ? "当前待处理槽位"
                            : id
                              ? mode === "auto"
                                ? "已选择"
                                : "待播已选择"
                              : "尚未选择"}
                        </small>
                      </span>
                      <span className="bp-pick-owner">
                        {player ? (
                          <>
                            <strong title={player.name}>{player.name}</strong>
                            <small>
                              <Check size={12} />
                              {assignment
                                ? `${assignment.role} · 归属已确认`
                                : `${player.role || "待分路"} · ${state.mode === "demo" ? "演示归属" : "客户端归属"}`}
                            </small>
                          </>
                        ) : (
                          <>
                            <strong>归属待确认</strong>
                            <small>按选择顺序显示</small>
                          </>
                        )}
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  );
                })}
              </div>
              {preselect.length > 0 && (
                <div className="bp-preselection">
                  <span>预选，尚未锁定</span>
                  {preselect.map((id, index) => (
                    <strong key={`${id}:${index}`}>
                      <ChampionImage champions={champions} id={id} />
                      {championFor(champions, id)?.name || id}
                    </strong>
                  ))}
                </div>
              )}
              <div className="bp-ban-heading">
                <strong>本局禁用</strong>
                <span>{usedDraftChampions(state, side).size} 位历史禁选</span>
              </div>
              <div className="bp-ban-list">
                {Array.from({ length: 5 }, (_, index) => {
                  const id = state.draft[`${side}Bans`][index] || "",
                    current =
                      nextSlot?.side === side &&
                      nextSlot.kind === "Bans" &&
                      nextSlot.index === index;
                  return (
                    <button
                      className={`bp-ban ${current ? "is-current" : ""}`}
                      key={index}
                      disabled={!canPrepare}
                      title={`${side === "blue" ? "蓝方" : "红方"}禁用 ${index + 1}：${championFor(champions, id)?.name || id || "未选择"}`}
                      onClick={(event) =>
                        editSlot(
                          { side, kind: "Bans", index },
                          event.currentTarget,
                        )
                      }
                    >
                      <span>禁 {index + 1}</span>
                      <ChampionImage champions={champions} id={id} />
                      <strong>
                        {championFor(champions, id)?.name || id || "未禁用"}
                      </strong>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="bp-board-footer">
        <span>
          <LockKeyhole size={14} />
          选择顺序与选手归属分别核对；槽位修改保存到待播。
        </span>
        <button
          className="bp-button"
          disabled={!canPrepare || preparing}
          onClick={() => void preparePreview()}
        >
          <Eye size={15} />
          {preparing
            ? "准备中…"
            : state.previewScene === "draft"
              ? "BP 已在预监"
              : "将 BP 设为预监"}
        </button>
      </div>
      <div ref={productionSection}>
        <DraftProductionControls
          key={productionKey(state)}
          {...ctx}
          task={task}
          onTaskChange={setTask}
        />
      </div>
      <details
        className="bp-layout-review"
        open={preview}
        onToggle={(event) => setPreview(event.currentTarget.open)}
      >
        <summary>BP 包装排版核对</summary>
        {preview && (
          <>
            <div className="bp-section-heading">
              <p>待播排版示意。实际合成与画面应用回执在导播台核对。</p>
              <div className="bp-actions">
                <button
                  className="bp-button"
                  disabled={!canPrepare || preparing}
                  onClick={() => void preparePreview()}
                >
                  设为预监
                </button>
                {owner ? (
                  <TakeControl {...ctx} scene="draft" compact />
                ) : (
                  <span>
                    由 {state.production?.control?.name || "当前主导播控制席"}{" "}
                    切入
                  </span>
                )}
              </div>
            </div>
            <BroadcastCanvas
              state={state}
              champions={champions}
              scene="draft"
            />
          </>
        )}
      </details>
      {slot && (
        <DraftChampionPicker
          ctx={ctx}
          slot={slot}
          trigger={trigger.current}
          onClose={() => setSlot(null)}
        />
      )}
    </div>
  );
}
