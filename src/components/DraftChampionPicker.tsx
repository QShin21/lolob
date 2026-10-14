import { useEffect, useId, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import type { Champion, Side, StateContext } from "../../shared/types";
import { productionKey } from "../../shared/production";
import { championFor, getTeam } from "../lib";
import { ChampionImage } from "./BroadcastCanvas";
import {
  draftRuleLabel,
  historyPicksForTeam,
  seriesDraftHistory,
  usedDraftChampions,
} from "./FearlessControls";

export type DraftSlot = { side: Side; kind: "Picks" | "Bans"; index: number };
export const draftSlotName = (slot: DraftSlot) =>
  `${slot.side === "blue" ? "B" : "R"}${slot.index + 1}${slot.kind === "Bans" ? " 禁用" : " 选择"}`;
const sameChampion = (champions: Champion[], a: string, b: string) =>
  !!a &&
  !!b &&
  (a === b ||
    (championFor(champions, a)?.id === championFor(champions, b)?.id &&
      !!championFor(champions, a)));

export function DraftChampionPicker({
  ctx,
  slot,
  trigger,
  onClose,
}: {
  ctx: StateContext;
  slot: DraftSlot;
  trigger: HTMLButtonElement | null;
  onClose: () => void;
}) {
  const { state, champions, seat, connected, send, notify } = ctx;
  const dialog = useRef<HTMLDialogElement>(null),
    searchInput = useRef<HTMLInputElement>(null),
    titleId = useId(),
    noteId = useId();
  const key = `${slot.side}${slot.kind}` as const;
  const [choice, setChoice] = useState(state.draft[key][slot.index] ?? ""),
    [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [baseVersion, setBaseVersion] = useState(
    state.production?.configVersion,
  );
  const currentSlots = JSON.stringify([
    state.draft.bluePicks,
    state.draft.redPicks,
    state.draft.blueBans,
    state.draft.redBans,
  ]);
  const [baseSlots, setBaseSlots] = useState(currentSlots);
  const initialKey = useRef(productionKey(state)),
    active = useRef(false);
  const allowed =
    !!seat && ["director", "data"].includes(seat.role) && connected !== false;
  const changedGame = initialKey.current !== productionKey(state),
    changedVersion =
      baseVersion !== state.production?.configVersion ||
      baseSlots !== currentSlots;
  const used = usedDraftChampions(state, slot.side),
    history = seriesDraftHistory(state);
  const blocked = (id: string) => {
    if (!id || slot.kind !== "Picks") return "";
    if ([...used].some((usedId) => sameChampion(champions, usedId, id)))
      return state.production?.rules.scope === "team"
        ? "本队前局已用"
        : "双方前局已用";
    for (const side of ["blue", "red"] as const) {
      const index = state.draft[`${side}Picks`].findIndex(
        (picked, index) =>
          !(side === slot.side && index === slot.index) &&
          sameChampion(champions, picked, id),
      );
      if (index >= 0)
        return `${side === "blue" ? "蓝方 B" : "红方 R"}${index + 1} 已选择`;
    }
    return "";
  };
  const historyLabel = (id: string) => {
    const games = history.filter((game) =>
      (state.production?.rules.scope === "team"
        ? historyPicksForTeam(game, state.match[`${slot.side}TeamId`])
        : [...game.bluePicks, ...game.redPicks]
      ).some((picked) => sameChampion(champions, picked, id)),
    );
    return games.length
      ? `历史 GAME ${games.map((game) => game.game).join("、")}`
      : "";
  };
  useEffect(() => {
    const element = dialog.current;
    if (!element?.open) element?.showModal();
    searchInput.current?.focus();
    return () => {
      element?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, [trigger]);
  const save = async () => {
    if (
      active.current ||
      !allowed ||
      changedGame ||
      changedVersion ||
      blocked(choice)
    )
      return;
    active.current = true;
    setBusy(true);
    setError("");
    const values = [...state.draft[key]];
    values[slot.index] = choice;
    try {
      await send({
        type: "set-draft",
        expectedConfigVersion: baseVersion,
        patch: { [key]: values },
      });
      notify(`${draftSlotName(slot)} 已保存到待播，BP 已由人工接管`, "success");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "英雄未保存，请核对后重试");
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  const visible = champions.filter((champion) =>
    `${champion.name} ${champion.id} ${champion.title}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  return (
    <dialog
      ref={dialog}
      className="bp-champion-dialog"
      aria-labelledby={titleId}
      aria-describedby={noteId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        // Cancel the search input's native "clear" action as well as dialog cancel.
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          if (!busy) onClose();
        }
      }}
    >
      <header className="bp-picker-heading">
        <div>
          <small>
            {getTeam(state, slot.side)?.name ||
              (slot.side === "blue" ? "蓝色方" : "红色方")}
          </small>
          <h2 id={titleId}>{draftSlotName(slot)}英雄</h2>
        </div>
        <button
          className="bp-icon-button"
          aria-label="关闭英雄选择"
          disabled={busy}
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </header>
      <p className="bp-picker-note" id={noteId}>
        {slot.kind === "Picks" ? draftRuleLabel(state) : "编辑本局禁用英雄"}
        。保存进入人工接管与待播，选手归属另行确认。
      </p>
      <label className="bp-picker-search">
        <Search size={18} />
        <input
          ref={searchInput}
          type="search"
          aria-label="搜索英雄"
          placeholder="搜索英雄名称 / 英文 ID"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className="bp-picker-count">
        <span>{visible.length} 位英雄</span>
        <span>
          当前槽位：
          {championFor(champions, state.draft[key][slot.index])?.name ||
            state.draft[key][slot.index] ||
            "未选择"}
        </span>
      </div>
      <div className="bp-picker-results" aria-label="英雄候选">
        {visible.map((champion) => {
          const reason = blocked(champion.id),
            selected = sameChampion(champions, choice, champion.id),
            previous = historyLabel(champion.id);
          return (
            <button
              type="button"
              className={`bp-candidate ${selected ? "is-selected" : ""} ${reason ? "is-unavailable" : ""}`}
              key={champion.id}
              aria-pressed={selected}
              aria-disabled={!!reason || busy}
              title={[champion.name, reason, previous]
                .filter(Boolean)
                .join(" · ")}
              onClick={() => {
                if (!reason && !busy) {
                  setChoice(champion.id);
                  setError("");
                }
              }}
            >
              <ChampionImage champions={champions} id={champion.id} />
              <strong>{champion.name}</strong>
              <small>
                {reason ||
                  previous ||
                  (selected ? "已选择，待保存" : champion.title)}
              </small>
              {selected && <Check className="bp-candidate-check" size={15} />}
            </button>
          );
        })}
        {!visible.length && (
          <p className="bp-empty">
            {champions.length
              ? "没有匹配英雄，试试中文名或英文 ID。"
              : "英雄资料尚未载入，请检查连接后重新打开。"}
          </p>
        )}
      </div>
      <footer className="bp-picker-footer">
        {changedGame ? (
          <p className="bp-error" role="alert">
            比赛或局号已改变。请关闭面板，在当前比赛重新选择槽位。
          </p>
        ) : (
          changedVersion && (
            <div className="bp-conflict" role="status">
              <p>
                待播 BP 或配置已更新，保留了你的选择。当前槽位为「
                {championFor(champions, state.draft[key][slot.index])?.name ||
                  state.draft[key][slot.index] ||
                  "未选择"}
                」。
              </p>
              <button
                className="bp-button"
                disabled={busy}
                onClick={() => {
                  setBaseVersion(state.production?.configVersion);
                  setBaseSlots(currentSlots);
                  setError("");
                }}
              >
                已核对当前槽位，继续编辑
              </button>
            </div>
          )
        )}
        {!allowed && (
          <p className="bp-error">
            {connected === false
              ? "同步中断，保留选择，重新连接后再保存。"
              : "当前席位没有 BP 准备权限，请由资料席或主导播处理。"}
          </p>
        )}
        {error && (
          <p className="bp-error" role="alert">
            {error}
          </p>
        )}
        <div className="bp-picker-selection">
          <ChampionImage champions={champions} id={choice} />
          <div>
            <strong>
              {championFor(champions, choice)?.name || choice || "清空此槽位"}
            </strong>
            <small>
              {blocked(choice) || `将保存至 ${draftSlotName(slot)}`}
            </small>
          </div>
          <button
            className="bp-button"
            disabled={busy}
            onClick={() => setChoice("")}
          >
            清空
          </button>
        </div>
        <div className="bp-picker-actions">
          <button className="bp-button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            className="bp-button bp-primary"
            disabled={
              busy ||
              !allowed ||
              changedGame ||
              changedVersion ||
              !!blocked(choice)
            }
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "保存此槽位到待播"}
          </button>
        </div>
      </footer>
    </dialog>
  );
}
