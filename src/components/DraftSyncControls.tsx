import { useRef, useState } from "react";
import { RefreshCw, Undo2 } from "lucide-react";
import type { StateContext } from "../../shared/types";
import type { ProductionCommand } from "../../shared/production-types";
import { championFor, getTeam } from "../lib";
import { ChampionImage } from "./BroadcastCanvas";
import { canPrepareDraft } from "./draft-permissions";

export function DraftSyncControls(ctx: StateContext) {
  const { state, champions, send, notify } = ctx,
    p = state.production!,
    client = p.clientDraft;
  const [reason, setReason] = useState(""),
    [accepted, setAccepted] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(false),
    allowed = canPrepareDraft(ctx),
    // A countdown tick is not a new decision to acknowledge. Picks, bans and
    // roster ownership changing still require the operator to check again.
    sampleKey = client
      ? JSON.stringify({
          bluePicks: client.draft.bluePicks,
          redPicks: client.draft.redPicks,
          blueBans: client.draft.blueBans,
          redBans: client.draft.redBans,
          bluePreselect: client.draft.bluePreselect,
          redPreselect: client.draft.redPreselect,
          locked: client.draft.locked,
          players: client.players.map((player) => [
            player.id,
            player.team,
            player.championId,
            player.role,
          ]),
        })
      : "";
  const command = async (command: ProductionCommand, message: string) => {
    if (active.current || !allowed) return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      await send({
        type: "production",
        expectedConfigVersion: p.configVersion,
        command,
      });
      notify(message, "success");
      setAccepted("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "BP 操作未完成");
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="bp-sync-controls">
      <div className="bp-section-heading">
        <div>
          <h3>接管与客户端核对</h3>
          <p>
            {p.draftMode === "auto"
              ? state.mode === "demo"
                ? "当前使用演示 BP 数据；手工保存槽位会进入人工接管。"
                : "客户端样本正在同步到 BP；手工保存槽位会进入人工接管。"
              : "人工内容保留在待播，新的客户端样本只用于核对。"}
          </p>
        </div>
        <span>
          {p.draftMode === "auto"
            ? state.mode === "demo"
              ? "演示数据"
              : "自动同步"
            : p.draftMode === "manual"
              ? "人工接管"
              : "差异核对"}
        </span>
      </div>
      <div className="bp-actions">
        <button
          className="bp-button"
          disabled={!allowed || busy || p.draftMode === "manual"}
          onClick={() =>
            void command(
              { op: "draft-mode", mode: "manual" },
              "已进入人工接管，客户端样本继续保留供核对",
            )
          }
        >
          人工接管
        </button>
        <button
          className="bp-button"
          disabled={!allowed || busy || p.draftMode === "compare"}
          onClick={() =>
            void command(
              { op: "draft-mode", mode: "compare" },
              "已进入差异核对，待播内容保持人工控制",
            )
          }
        >
          进入差异核对
        </button>
      </div>
      {client ? (
        <>
          <div className="bp-client-stamp">
            <span>
              LCU 样本 {new Date(client.at).toLocaleTimeString("zh-CN")}
            </span>
            <span>
              {state.connections.lcu.status === "connected"
                ? "客户端已连接"
                : "客户端未连接，显示最后样本"}
            </span>
          </div>
          <div className="bp-comparison-teams">
            {(["blue", "red"] as const).map((side) => (
              <section key={side}>
                <h4>{getTeam(state, side)?.name}</h4>
                <div className="bp-comparison-labels">
                  <span>槽位</span>
                  <span>待播内容</span>
                  <span>客户端样本</span>
                  <span>核对</span>
                </div>
                {(["Picks", "Bans"] as const).flatMap((kind) =>
                  Array.from({ length: 5 }, (_, index) => {
                    const own = state.draft[`${side}${kind}`][index] || "",
                      remote = client.draft[`${side}${kind}`][index] || "";
                    return (
                      <div
                        className={`bp-comparison-row ${own !== remote ? "has-difference" : ""}`}
                        key={`${kind}:${index}`}
                      >
                        <b>
                          {kind === "Picks"
                            ? side === "blue"
                              ? "B"
                              : "R"
                            : "禁"}
                          {index + 1}
                        </b>
                        <span>
                          <ChampionImage champions={champions} id={own} />
                          {championFor(champions, own)?.name || own || "未选择"}
                        </span>
                        <span>
                          <ChampionImage champions={champions} id={remote} />
                          {championFor(champions, remote)?.name ||
                            remote ||
                            "未选择"}
                        </span>
                        <small>{own === remote ? "一致" : "有差异"}</small>
                      </div>
                    );
                  }),
                )}
                <p className="bp-inline-note">
                  客户端预选：
                  {client.draft[`${side}Preselect`]
                    ?.map((id) => championFor(champions, id)?.name || id)
                    .join("、") || "无"}
                </p>
              </section>
            ))}
          </div>
        </>
      ) : (
        <p className="bp-empty">
          尚未收到可核对的客户端样本。恢复自动同步后，将等待下一份客户端 BP
          数据。
        </p>
      )}
      {p.draftMode !== "auto" && (
        <div className="bp-sync-restore">
          {client && (
            <label className="bp-lock">
              <input
                type="checkbox"
                checked={accepted === sampleKey}
                disabled={busy || !allowed}
                onChange={(event) =>
                  setAccepted(event.target.checked ? sampleKey : "")
                }
              />
              已核对，将用上述客户端 BP 和名单替换待播内容
            </label>
          )}
          <button
            className="bp-button bp-primary"
            disabled={!allowed || busy || (!!client && accepted !== sampleKey)}
            onClick={() =>
              void command(
                { op: "draft-mode", mode: "auto", resolution: "client" },
                "已恢复客户端自动同步，请核对待播内容",
              )
            }
          >
            <RefreshCw size={15} />
            {client ? "使用客户端样本，恢复同步" : "恢复自动同步，等待样本"}
          </button>
        </div>
      )}
      <details className="bp-recovery">
        <summary>
          <Undo2 size={15} />
          回退与清空无效 BP
        </summary>
        <p>
          回退或清空会进入人工接管，并撤销本局尚未正式登记的 BP
          历史。前局历史保留。
        </p>
        <label>
          操作理由
          <input
            value={reason}
            placeholder="填写裁判判定或修正原因"
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <div className="bp-actions">
          <button
            className="bp-button"
            disabled={!allowed || busy || !reason.trim() || !p.draftUndo.length}
            onClick={() =>
              void command(
                { op: "draft-undo", reason },
                "已回退一步 BP，请重新核对待播",
              )
            }
          >
            回退一步（{p.draftUndo.length} 步可用）
          </button>
          <button
            className="bp-button bp-danger"
            disabled={!allowed || busy || !reason.trim()}
            onClick={() =>
              void command(
                { op: "draft-clear", reason },
                "已清空无效 BP，前局历史保留",
              )
            }
          >
            清空本局无效 BP
          </button>
        </div>
      </details>
      {error && (
        <p className="bp-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
