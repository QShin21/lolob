import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { StateContext } from "../../shared/types";
import type { ProductionState } from "../../shared/production-types";
import { championFor, getTeam } from "../lib";
import { ChampionImage } from "./BroadcastCanvas";
import { canPrepareDraft } from "./draft-permissions";

const lanes = ["上单", "打野", "中单", "下路", "辅助"];
type Assignment = ProductionState["assignments"][number];
const assignmentList = (ctx: StateContext): Assignment[] =>
  ctx.state.players.map(
    (player) =>
      ctx.state.production?.assignments.find(
        (a) => a.playerId === player.id && a.team === player.team,
      ) ?? {
        playerId: player.id,
        championId: player.championId,
        role: player.role,
        team: player.team,
        locked: false,
      },
  );

export function DraftAssignments(ctx: StateContext) {
  const { state, champions, send, notify } = ctx,
    p = state.production!;
  const incoming = assignmentList(ctx),
    incomingKey = JSON.stringify(incoming);
  const [assignments, setAssignments] = useState(incoming),
    [dirty, setDirty] = useState(false),
    [baseVersion, setBaseVersion] = useState(p.configVersion),
    [baseKey, setBaseKey] = useState(incomingKey);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(false),
    permitted = canPrepareDraft(ctx),
    conflict =
      dirty && (baseVersion !== p.configVersion || baseKey !== incomingKey);
  useEffect(() => {
    if (!dirty) {
      setAssignments(incoming);
      setBaseVersion(p.configVersion);
      setBaseKey(incomingKey);
    }
  }, [incomingKey, p.configVersion, dirty]);
  const update = (index: number, patch: Partial<Assignment>) => {
    setDirty(true);
    setAssignments((values) =>
      values.map((value, i) => (i === index ? { ...value, ...patch } : value)),
    );
    setError("");
  };
  const swap = (index: number, playerId: string) => {
    const other = assignments.findIndex(
      (value) =>
        value.playerId === playerId && value.team === assignments[index].team,
    );
    if (other < 0) return;
    setDirty(true);
    setAssignments((values) =>
      values.map((value, i) =>
        i === index
          ? { ...value, championId: values[other].championId, locked: false }
          : i === other
            ? { ...value, championId: values[index].championId, locked: false }
            : value,
      ),
    );
    setError("");
  };
  const locked = assignments.filter((a) => a.locked);
  const invalid = locked.some(
    (a) =>
      !state.players.some(
        (player) => player.id === a.playerId && player.team === a.team,
      ) ||
      !state.draft[`${a.team}Picks`].includes(a.championId) ||
      !lanes.includes(a.role),
  );
  const duplicate =
    new Set(locked.map((a) => a.championId)).size !== locked.length ||
    new Set(locked.map((a) => `${a.team}:${a.role}`)).size !== locked.length;
  const save = async () => {
    if (
      active.current ||
      !permitted ||
      conflict ||
      invalid ||
      duplicate ||
      !dirty
    )
      return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      await send({
        type: "production",
        expectedConfigVersion: baseVersion,
        command: { op: "assign", assignments: locked },
      });
      setDirty(false);
      notify("已确认归属保存到待播，未确认项仍待核对", "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "归属保存失败，已保留修改");
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="bp-assignments">
      <div className="bp-section-heading">
        <div>
          <h3>把英雄交给正确的选手</h3>
          <p>
            BP 按 B1 / R1
            选择顺序显示。最终交换后核对英雄和分路，再勾选确认归属。
          </p>
        </div>
        <span>{locked.length} 人已勾选</span>
      </div>
      {!assignments.length ? (
        <p className="bp-empty">
          等待本局选手名单。先在赛事资料中准备双方名单，或连接客户端。
        </p>
      ) : (
        <div className="bp-assignment-teams">
          {(["blue", "red"] as const).map((side) => (
            <section className={`bp-assignment-team ${side}`} key={side}>
              <h4>
                {getTeam(state, side)?.name ||
                  (side === "blue" ? "蓝方" : "红方")}
              </h4>
              <div className="bp-assignment-head">
                <span>选手</span>
                <span>最终英雄 / 交换</span>
                <span>分路 / 确认</span>
              </div>
              {assignments.map((a, index) => {
                if (a.team !== side) return null;
                const player = state.players.find(
                    (player) => player.id === a.playerId,
                  ),
                  valid =
                    state.draft[`${side}Picks`].includes(a.championId) &&
                    lanes.includes(a.role);
                return (
                  <div
                    className={`bp-assignment-row ${a.locked ? "is-locked" : ""}`}
                    key={a.playerId}
                  >
                    <div className="bp-assignee">
                      <ChampionImage champions={champions} id={a.championId} />
                      <strong title={player?.name}>
                        {player?.name || "名单已改变"}
                      </strong>
                      <small>{a.locked ? "归属已勾选" : "待确认归属"}</small>
                    </div>
                    <div className="bp-assignment-fields">
                      <select
                        aria-label={`${player?.name || "选手"} 最终英雄`}
                        disabled={!permitted || busy}
                        value={a.championId}
                        onChange={(event) =>
                          update(index, {
                            championId: event.target.value,
                            locked: false,
                          })
                        }
                      >
                        <option value="">选择本队英雄</option>
                        {a.championId &&
                          !state.draft[`${side}Picks`].includes(
                            a.championId,
                          ) && (
                            <option value={a.championId}>
                              {championFor(champions, a.championId)?.name ||
                                a.championId}
                              （不在本队选择）
                            </option>
                          )}
                        {state.draft[`${side}Picks`]
                          .filter(Boolean)
                          .map((id, i) => (
                            <option value={id} key={`${id}:${i}`}>
                              {championFor(champions, id)?.name || id}
                            </option>
                          ))}
                      </select>
                      <select
                        aria-label={`${player?.name || "选手"} 与队友交换英雄`}
                        disabled={!permitted || busy}
                        value=""
                        onChange={(event) => swap(index, event.target.value)}
                      >
                        <option value="">与队友交换…</option>
                        {assignments
                          .filter(
                            (value) =>
                              value.team === side &&
                              value.playerId !== a.playerId,
                          )
                          .map((value) => (
                            <option key={value.playerId} value={value.playerId}>
                              {state.players.find(
                                (player) => player.id === value.playerId,
                              )?.name || "选手"}{" "}
                              ·{" "}
                              {championFor(champions, value.championId)?.name ||
                                "待选择"}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="bp-assignment-fields">
                      <select
                        aria-label={`${player?.name || "选手"} 确认分路`}
                        disabled={!permitted || busy}
                        value={lanes.includes(a.role) ? a.role : "待分路"}
                        onChange={(event) =>
                          update(index, {
                            role: event.target.value,
                            locked: false,
                          })
                        }
                      >
                        <option value="待分路">待确认</option>
                        {lanes.map((lane) => (
                          <option key={lane}>{lane}</option>
                        ))}
                      </select>
                      <label className="bp-lock">
                        <input
                          type="checkbox"
                          checked={a.locked}
                          disabled={!permitted || busy || (!a.locked && !valid)}
                          onChange={(event) =>
                            update(index, { locked: event.target.checked })
                          }
                        />
                        确认归属
                      </label>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
      <p className="bp-inline-note">
        <ArrowLeftRight size={15} />
        交换英雄或更改分路会取消相应锁定，需要重新确认。
      </p>
      {conflict && (
        <div className="bp-conflict" role="status">
          <strong>待播配置有更新，本地归属修改已保留</strong>
          <p>
            当前待播：
            {p.assignments
              .filter((a) => a.locked)
              .map(
                (a) =>
                  `${state.players.find((player) => player.id === a.playerId)?.name || a.playerId} / ${championFor(champions, a.championId)?.name || a.championId} / ${a.role}`,
              )
              .join("；") || "尚未确认归属"}
          </p>
          <button
            className="bp-button"
            disabled={busy}
            onClick={() => {
              setBaseVersion(p.configVersion);
              setBaseKey(incomingKey);
            }}
          >
            已核对，保留本地归属继续保存
          </button>
        </div>
      )}
      {(invalid || duplicate) && (
        <p className="bp-error" role="alert">
          {invalid
            ? "已勾选项必须属于当前名单、使用本队已选英雄并指定有效分路。"
            : "已勾选项含重复英雄或本队重复分路，请逐项核对。"}
        </p>
      )}
      {error && (
        <p className="bp-error" role="alert">
          {error}
        </p>
      )}
      <div className="bp-save-row">
        <span>
          {dirty
            ? "本地归属未保存"
            : `${p.assignments.filter((a) => a.locked).length} 人归属已保存到待播`}
        </span>
        <button
          className="bp-button"
          disabled={!dirty || busy}
          onClick={() => {
            setDirty(false);
            setError("");
          }}
        >
          放弃归属修改
        </button>
        <button
          className="bp-button bp-primary"
          disabled={
            !dirty || busy || !permitted || conflict || invalid || duplicate
          }
          onClick={() => void save()}
        >
          {busy ? "保存中…" : "保存已确认归属到待播"}
        </button>
      </div>
    </div>
  );
}
