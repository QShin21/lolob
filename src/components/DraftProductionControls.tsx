import { useId } from "react";
import type { StateContext } from "../../shared/types";
import { FearlessControls } from "./FearlessControls";
import { DraftAssignments } from "./DraftAssignments";
import { DraftSyncControls } from "./DraftSyncControls";
import { DraftRuleControls } from "./DraftRuleControls";
import { canPrepareDraft } from "./draft-permissions";

export type DraftControlTask = "assignments" | "sync" | "rules";
export function DraftProductionControls(
  ctx: StateContext & {
    task: DraftControlTask;
    onTaskChange: (task: DraftControlTask) => void;
    hideNavigation?: boolean;
  },
) {
  const { state, task, onTaskChange } = ctx,
    p = state.production,
    tabId = useId();
  if (!p) return <p className="bp-empty">制作状态尚未就绪，请等待同步。</p>;
  const tabs: { id: DraftControlTask; label: string; detail?: string }[] = [
    {
      id: "assignments",
      label: "最终归属",
      detail: `${p.assignments.filter((a) => a.locked && state.draft[`${a.team}Picks`].includes(a.championId) && state.players.some((player) => player.id === a.playerId && player.team === a.team)).length}/10`,
    },
    { id: "sync", label: "接管与客户端差异" },
    { id: "rules", label: "规则与历史" },
  ];
  return (
    <section className="bp-production" aria-label="BP 归属与同步控制">
      <div className="bp-task-tabs" role="tablist" aria-label="BP 制作任务" hidden={ctx.hideNavigation}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`${tabId}-${tab.id}`}
            role="tab"
            aria-selected={task === tab.id}
            aria-controls={`${tabId}-${tab.id}-panel`}
            tabIndex={task === tab.id ? 0 : -1}
            onClick={() => onTaskChange(tab.id)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
              if (next >= 0) {
                event.preventDefault();
                onTaskChange(tabs[next].id);
                document.getElementById(`${tabId}-${tabs[next].id}`)?.focus();
              }
            }}
          >
            {tab.label}
            {tab.detail && <span>{tab.detail}</span>}
          </button>
        ))}
      </div>
      {!canPrepareDraft(ctx) && (
        <p className="bp-permission-note">
          {ctx.connected === false
            ? "同步中断，保留本地输入；恢复连接后再保存。"
            : ctx.seat
              ? "当前席位可核对 BP，修改由资料席或主导播席执行。"
              : "正在验证操作席位，验证后显示可执行操作。"}
        </p>
      )}
      <div
        id={`${tabId}-assignments-panel`}
        role="tabpanel"
        aria-labelledby={`${tabId}-assignments`}
        hidden={task !== "assignments"}
      >
        <DraftAssignments {...ctx} />
      </div>
      <div
        id={`${tabId}-sync-panel`}
        role="tabpanel"
        aria-labelledby={`${tabId}-sync`}
        hidden={task !== "sync"}
      >
        <DraftSyncControls {...ctx} />
      </div>
      <div
        id={`${tabId}-rules-panel`}
        role="tabpanel"
        aria-labelledby={`${tabId}-rules`}
        hidden={task !== "rules"}
      >
        <DraftRuleControls {...ctx} />
        <FearlessControls {...ctx} />
      </div>
    </section>
  );
}
