import { useRef, useState } from "react";
import { TakeControl } from "../components/ConsoleUI";
import { Swords } from "lucide-react";
import type { StateContext } from "../../shared/types";
import { getTeam, championFor } from "../lib";
import { BroadcastCanvas, ChampionImage } from "../components/BroadcastCanvas";
import { DraftProductionControls } from "../components/DraftProductionControls";
import {
  FearlessControls,
  usedDraftChampions,
} from "../components/FearlessControls";
export function Draft(ctx: StateContext) {
  const { state, champions, send, notify } = ctx;
  const trigger = useRef<HTMLButtonElement | null>(null);
  const closePicker = () => {
    setSlot(null);
    trigger.current?.focus();
  };
  const [slot, setSlot] = useState<{
    side: "blue" | "red";
    kind: "Picks" | "Bans";
    index: number;
  } | null>(null);
  const [search, setSearch] = useState("");
  const assign = async (id: string) => {
    if (!slot) return;
    const key = `${slot.side}${slot.kind}` as
      | "bluePicks"
      | "redPicks"
      | "blueBans"
      | "redBans";
    const values = [...state.draft[key]];
    values[slot.index] = id;
    try {
      await send({ type: "set-draft", patch: { [key]: values } });
      closePicker();
      notify("BP 已保存到待播，请核对后切入");
    } catch {
      /* message handled by send */
    }
  };
  return (
    <div className="draft-workspace">
      <DraftProductionControls {...{ state, champions, send, notify }} />
      <div className="draft-current-action" role="status">
        <strong>
          {getTeam(state, state.draft.activeTeam)?.tag} · {state.draft.action}
        </strong>
        <b>{Math.ceil(state.draft.timer)} 秒</b>
        <span>
          {state.production?.draftMode === "auto"
            ? "客户端自动同步"
            : "人工准备"}{" "}
          · GAME {state.match.game}
        </span>
        <div className="inline-buttons">
          <button
            className="button small"
            onClick={() =>
              void send({
                type: "production",
                command: { op: "draft-mode", mode: "manual" },
              }).catch(() => {})
            }
          >
            人工接管
          </button>
          <button
            className="button small"
            onClick={() =>
              void send({
                type: "production",
                command: { op: "draft-mode", mode: "compare" },
              }).catch(() => {})
            }
          >
            差异核对
          </button>
        </div>
      </div>
      <div className="draft-edit-grid">
        {(["blue", "red"] as const).map((side) => (
          <section className="panel" key={side}>
            <div className="panel-head">
              <h2 className={`${side}-text`}>
                {getTeam(state, side)?.tag} · {getTeam(state, side)?.name}
              </h2>
            </div>
            {(["Picks", "Bans"] as const).map((kind) => (
              <div key={kind} className="draft-slot-section">
                <span className="eyebrow">
                  {kind === "Picks" ? "英雄选择" : "英雄禁用"}
                </span>
                <div className="draft-slots">
                  {Array.from({ length: 5 }, (_, i) => {
                    const id = state.draft[
                      `${side}${kind}` as keyof typeof state.draft
                    ] as string[];
                    return (
                      <button
                        key={i}
                        className={
                          slot?.side === side &&
                          slot.kind === kind &&
                          slot.index === i
                            ? "selected"
                            : ""
                        }
                        onClick={(e) => {
                          trigger.current = e.currentTarget;
                          setSlot({ side, kind, index: i });
                        }}
                      >
                        <ChampionImage champions={champions} id={id[i]} />
                        <strong>
                          {championFor(champions, id[i])?.name || "选择英雄"}
                        </strong>
                        <small>
                          {kind === "Picks"
                            ? `${side === "blue" ? "B" : "R"}${i + 1} · 选择顺序`
                            : `BAN ${i + 1}`}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
      {slot && (
        <section
          className="panel champion-picker"
          aria-label="英雄选择面板"
          onKeyDown={(e) => {
            if (e.key === "Escape") closePicker();
          }}
        >
          <div className="panel-head">
            <h2>
              选择英雄 · {slot.side === "blue" ? "蓝色方" : "红色方"}{" "}
              {slot.kind === "Picks" ? "PICK" : "BAN"} {slot.index + 1}
            </h2>
            <div className="inline-buttons">
              <input
                aria-label="搜索英雄"
                autoFocus
                placeholder="搜索英雄名称 / 英文 ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="button small" onClick={() => void assign("")}>
                清空槽位
              </button>
              <button className="button small" onClick={closePicker}>
                关闭
              </button>
            </div>
          </div>
          <div className="champion-picker-grid">
            {champions
              .filter((c) =>
                `${c.name} ${c.id}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((c) => (
                <button
                  key={c.id}
                  disabled={
                    slot.kind === "Picks" &&
                    usedDraftChampions(state, slot.side).has(c.id)
                  }
                  title={
                    usedDraftChampions(state, slot.side).has(c.id)
                      ? "全局 BP：前局已使用"
                      : c.name
                  }
                  onClick={() => void assign(c.id)}
                >
                  <ChampionImage champions={champions} id={c.id} />
                  <span>{c.name}</span>
                </button>
              ))}
          </div>
        </section>
      )}
      <details className="panel draft-preview">
        <summary>BP 包装预览</summary>
        <div className="panel-head">
          <h2>
            <Swords size={17} />
            BP 画面预览
          </h2>
          <div className="inline-buttons">
            <button
              className="button small"
              onClick={() =>
                void send({ type: "preview-scene", scene: "draft" }).catch(
                  () => {},
                )
              }
            >
              设为预监
            </button>
            <TakeControl {...ctx} scene="draft" compact />
          </div>
        </div>
        <BroadcastCanvas state={state} champions={champions} scene="draft" />
        <div className="draft-source-note">
          {state.mode === "demo"
            ? "演示 BP · 点击下方槽位手动编排英雄"
            : "本地 BP · 手工编辑自动进入人工接管，客户端样本保留供核对"}
        </div>
      </details>
      <details className="panel">
        <summary>全局 BP 历史与规则核对</summary>
        <FearlessControls {...{ state, champions, send, notify }} />
      </details>
    </div>
  );
}
