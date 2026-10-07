import { ChampionImage } from "./BroadcastCanvas";
import { productionKey } from "../../shared/production";
import { useEffect, useRef, useState } from "react";
import type { StateContext } from "../../shared/types";
import type { ProductionState } from "../../shared/production-types";
import { championFor, getTeam } from "../lib";

export function DraftProductionControls({
  state,
  champions,
  send,
  notify,
}: StateContext) {
  const p = state.production,
    [reason, setReason] = useState(""),
    [assignments, setAssignments] = useState<ProductionState["assignments"]>(
      [],
    );
  const [exception, setException] = useState("");
  const mappingVersion = useRef(p?.configVersion),
    mappingDirty = useRef(false),
    mappingKey = useRef(productionKey(state));
  const currentAssignments = () =>
    state.players.map(
      (player) =>
        state.production?.assignments.find((a) => a.playerId === player.id) ?? {
          playerId: player.id,
          championId: player.championId,
          role: player.role,
          team: player.team,
          locked: false,
        },
    );
  const [ackVersion, setAckVersion] = useState(0);
  useEffect(() => {
    if (mappingKey.current !== productionKey(state)) {
      mappingDirty.current = false;
      mappingKey.current = productionKey(state);
      setReason("");
    }
    if (mappingDirty.current) return;
    mappingVersion.current = state.production?.configVersion;
    setAssignments(
      state.players.map(
        (player) =>
          state.production?.assignments.find(
            (a) => a.playerId === player.id,
          ) ?? {
            playerId: player.id,
            championId: player.championId,
            role: player.role,
            team: player.team,
            locked: false,
          },
      ),
    );
  }, [
    state.players.map((p) => `${p.id}:${p.championId}`).join("|"),
    JSON.stringify(state.production?.assignments),
    productionKey(state),
  ]);
  if (!p) return null;
  const command = (c: Parameters<typeof send>[0]) =>
    void send(c).catch(() => {});
  const client = p.clientDraft;
  const swap = (index: number, id: string) => {
    const other = assignments.findIndex(
      (a) => a.playerId === id && a.team === assignments[index].team,
    );
    if (other < 0) return;
    mappingDirty.current = true;
    setAssignments(
      assignments.map((a, i) =>
        i === index
          ? { ...a, championId: assignments[other].championId, locked: false }
          : i === other
            ? { ...a, championId: assignments[index].championId, locked: false }
            : a,
      ),
    );
  };
  return (
    <section className="panel production-draft">
      <div className="panel-head">
        <h2>赛事规则、BP 接管与最终归属</h2>
        <span className="badge">
          {p.draftMode === "auto"
            ? "自动同步"
            : p.draftMode === "manual"
              ? "人工接管"
              : "差异核对"}
        </span>
      </div>
      <details>
        <summary>赛前规则设置</summary>
        <div className="production-form">
          <label>
            本场规则
            <select
              value={p.rules.mode}
              onChange={(e) =>
                command({
                  type: "production",
                  command: {
                    op: "rules",
                    reason: reason || undefined,
                    rules: {
                      ...p.rules,
                      mode: e.target.value as typeof p.rules.mode,
                    },
                  },
                })
              }
            >
              <option value="standard">普通 BP · 可重复英雄</option>
              <option value="fearless">全局禁选</option>
              <option value="custom">自定义范围与例外局</option>
            </select>
          </label>
          <label>
            禁用范围
            <select
              value={p.rules.scope}
              onChange={(e) =>
                command({
                  type: "production",
                  command: {
                    op: "rules",
                    reason: reason || undefined,
                    rules: {
                      ...p.rules,
                      scope: e.target.value as "all" | "team",
                    },
                  },
                })
              }
            >
              <option value="all">双方已用英雄</option>
              <option value="team">本队已用英雄</option>
            </select>
          </label>
          <label>
            重赛历史
            <select
              value={p.rules.remakeHistory}
              onChange={(e) =>
                command({
                  type: "production",
                  command: {
                    op: "rules",
                    reason: reason || undefined,
                    rules: {
                      ...p.rules,
                      remakeHistory: e.target.value as "discard" | "retain",
                    },
                  },
                })
              }
            >
              <option value="discard">作废并重新 BP</option>
              <option value="retain">保留本次阵容</option>
            </select>
          </label>
          <label>
            裁判例外局 / 逗号分隔
            <input
              value={exception}
              placeholder={p.rules.exceptionGames.join(",") || "例如 5"}
              onChange={(e) => setException(e.target.value)}
            />
          </label>
          <button
            className="button small"
            disabled={!reason.trim()}
            onClick={() =>
              command({
                type: "production",
                command: {
                  op: "rules",
                  reason: reason || undefined,
                  rules: {
                    ...p.rules,
                    exceptionGames: exception
                      ? exception.split(",").map(Number)
                      : [],
                  },
                },
              })
            }
          >
            凭理由确认例外局
          </button>
        </div>
      </details>
      <div className="production-form">
        <input
          placeholder="BP 回退、作废或例外理由"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          className="button small"
          onClick={() =>
            command({
              type: "production",
              command: { op: "draft-mode", mode: "manual" },
            })
          }
        >
          人工接管
        </button>
        <button
          className="button small"
          onClick={() =>
            command({
              type: "production",
              command: { op: "draft-mode", mode: "compare" },
            })
          }
        >
          差异核对
        </button>
        <button
          className="button small"
          onClick={() =>
            command({
              type: "production",
              command: { op: "draft-mode", mode: "auto", resolution: "client" },
            })
          }
        >
          核对后使用客户端
        </button>
        <button
          className="button small"
          disabled={!reason.trim() || !p.draftUndo.length}
          onClick={() =>
            command({
              type: "production",
              command: { op: "draft-undo", reason },
            })
          }
        >
          回退一步
        </button>
        <button
          className="button small"
          disabled={!reason.trim()}
          onClick={() =>
            command({
              type: "production",
              command: { op: "draft-clear", reason },
            })
          }
        >
          清空无效 BP
        </button>
      </div>
      {client && p.draftMode !== "auto" && (
        <div className="draft-diff-grid">
          {(["blue", "red"] as const).map((side) => (
            <section key={side}>
              <h3>{getTeam(state, side)?.tag} · 待播 / 客户端</h3>
              {Array.from({ length: 5 }, (_, i) => {
                const own = state.draft[`${side}Picks`][i] ?? "",
                  remote = client.draft[`${side}Picks`][i] ?? "";
                return (
                  <div className="draft-diff-row" key={i}>
                    <b>
                      {side === "blue" ? "B" : "R"}
                      {i + 1}
                    </b>
                    <ChampionImage champions={champions} id={own} />
                    <span>{championFor(champions, own)?.name || "待选择"}</span>
                    <span>{own === remote ? "一致" : "→"}</span>
                    <ChampionImage champions={champions} id={remote} />
                    <span>
                      {championFor(champions, remote)?.name || "待选择"}
                    </span>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
      <details>
        <summary>
          确认最终归属 · {assignments.filter((a) => a.locked).length}/
          {assignments.length}
        </summary>
        <p className="muted">
          先按 B1 / R1
          选择顺序播出。最终交换完成后确认每名选手的英雄与分路。交换会清除双方锁定，请重新核对后保存；未确认项保留待定。
        </p>
        <div className="assignment-grid">
          {(["blue", "red"] as const).map((side) => (
            <section key={side}>
              <h3>{getTeam(state, side)?.name}</h3>
              {assignments.map((a, index) =>
                a.team !== side ? null : (
                  <div className="production-form" key={a.playerId}>
                    <strong>
                      {state.players.find((p) => p.id === a.playerId)?.name} ·{" "}
                      {a.team === "blue" ? "蓝" : "红"}
                    </strong>
                    <select
                      aria-label={`${state.players.find((p) => p.id === a.playerId)?.name} 最终英雄`}
                      value={a.championId}
                      onChange={(e) => {
                        mappingDirty.current = true;
                        setAssignments(
                          assignments.map((v, i) =>
                            i === index
                              ? { ...v, championId: e.target.value }
                              : v,
                          ),
                        );
                      }}
                    >
                      <option value="">待确认</option>
                      {state.draft[`${a.team}Picks`].map((id) => (
                        <option value={id} key={id}>
                          {championFor(champions, id)?.name || id}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`${state.players.find((p) => p.id === a.playerId)?.name} 确认分路`}
                      value={a.role}
                      onChange={(e) => {
                        mappingDirty.current = true;
                        setAssignments(
                          assignments.map((v, i) =>
                            i === index ? { ...v, role: e.target.value } : v,
                          ),
                        );
                      }}
                    >
                      <option value="待分路">待确认</option>
                      {["上单", "打野", "中单", "下路", "辅助"].map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </select>
                    <select
                      aria-label={`${state.players.find((p) => p.id === a.playerId)?.name} 交换英雄`}
                      value=""
                      onChange={(e) => swap(index, e.target.value)}
                    >
                      <option value="">与队友交换英雄…</option>
                      {assignments
                        .filter(
                          (v) => v.team === a.team && v.playerId !== a.playerId,
                        )
                        .map((v) => (
                          <option key={v.playerId} value={v.playerId}>
                            {
                              state.players.find((p) => p.id === v.playerId)
                                ?.name
                            }{" "}
                            ·{" "}
                            {championFor(champions, v.championId)?.name ||
                              "待选择"}
                          </option>
                        ))}
                    </select>
                    <label>
                      <input
                        type="checkbox"
                        checked={a.locked}
                        onChange={(e) => {
                          mappingDirty.current = true;
                          setAssignments(
                            assignments.map((v, i) =>
                              i === index
                                ? { ...v, locked: e.target.checked }
                                : v,
                            ),
                          );
                        }}
                      />
                      锁定归属
                    </label>
                  </div>
                ),
              )}
            </section>
          ))}
        </div>
        {mappingDirty.current && (
          <p role="status">本地有未保存的英雄归属修改</p>
        )}
        {mappingDirty.current && mappingVersion.current !== p.configVersion && (
          <div className="request-error" role="alert">
            <strong>配置已更新，请核对当前待播归属</strong>
            <p>
              {p.assignments
                .map(
                  (a) =>
                    `${state.players.find((v) => v.id === a.playerId)?.name}：${championFor(champions, a.championId)?.name || a.championId}`,
                )
                .join("；") || "当前待播尚未锁定归属"}
            </p>
            <button
              className="button small"
              onClick={() => {
                mappingVersion.current = p.configVersion;
                setAckVersion(ackVersion + 1);
              }}
            >
              已核对，保留本地修改继续保存
            </button>
          </div>
        )}
        <div className="save-bar">
          <button
            className="button"
            onClick={() => {
              mappingDirty.current = false;
              mappingVersion.current = p.configVersion;
              setAssignments(currentAssignments());
            }}
          >
            放弃归属修改
          </button>
          <button
            className="button primary small"
            onClick={() =>
              void send({
                type: "production",
                expectedConfigVersion: mappingVersion.current,
                command: {
                  op: "assign",
                  assignments: assignments.filter((a) => a.locked),
                },
              })
                .then(() => {
                  mappingDirty.current = false;
                  setAssignments(currentAssignments());
                  notify("已确认归属保存到待播", "success");
                })
                .catch(() => {})
            }
          >
            保存已确认归属到待播
          </button>
        </div>
      </details>
    </section>
  );
}
