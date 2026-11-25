import { useRef, useState } from "react";
import { History } from "lucide-react";
import type { DraftHistoryGame, Side, StateContext } from "../../shared/types";
import { championFor, getTeam } from "../lib";
import {
  currentGameResult,
  gameResultAwaitingTerminalSample,
} from "../../shared/game-results";
import { ChampionImage } from "./BroadcastCanvas";
import { HoldButton } from "./ProductionDesk";

/** The server sanitizes history; scope it again by both stable team IDs for display. */
export function seriesDraftHistory(
  state: StateContext["state"],
): DraftHistoryGame[] {
  const teams = [state.match.blueTeamId, state.match.redTeamId]
    .sort()
    .join("\0");
  return (state.draftHistory ?? [])
    .filter(
      (game) =>
        game.seriesId === state.match.seriesId &&
        game.game < state.match.game &&
        [game.blueTeamId, game.redTeamId].sort().join("\0") === teams,
    )
    .sort((a, b) => a.game - b.game);
}

export function historyPicksForTeam(
  game: DraftHistoryGame,
  teamId: string,
): string[] {
  return game.blueTeamId === teamId
    ? game.bluePicks
    : game.redTeamId === teamId
      ? game.redPicks
      : [];
}

export function usedDraftChampions(state: StateContext["state"], side?: Side) {
  if (
    state.production?.rules.mode === "standard" ||
    state.production?.rules.exceptionGames.includes(state.match.game)
  )
    return new Set<string>();
  const teamId = side ? state.match[`${side}TeamId`] : undefined;
  return new Set(
    seriesDraftHistory(state).flatMap((game) =>
      state.production?.rules.scope === "team" && teamId
        ? historyPicksForTeam(game, teamId)
        : [...game.bluePicks, ...game.redPicks],
    ),
  );
}

export function draftRuleLabel(state: StateContext["state"]): string {
  const rules = state.production?.rules;
  if (rules?.exceptionGames.includes(state.match.game))
    return `第 ${state.match.game} 局为裁判例外局`;
  if (rules?.mode === "standard") return "普通 BP · 前局英雄可重复";
  return rules?.scope === "team"
    ? "本队禁选 · 本队前局英雄不可再选"
    : "全局禁选 · 双方前局英雄不可再选";
}

export function FearlessControls(ctx: StateContext) {
  const { state, champions, send, notify, seat, connected } = ctx;
  const games = seriesDraftHistory(state),
    result = currentGameResult(state);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(false);
  const owner =
    !!seat &&
    seat.role === "director" &&
    state.production?.control?.owner === seat.id;
  const canPrepare =
    !!seat && ["data", "director"].includes(seat.role) && connected !== false;
  const run = async (work: () => Promise<void>, message: string) => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
      notify(message, "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作未完成");
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="bp-history" aria-label="本系列赛英雄历史">
      <div className="bp-section-heading">
        <div>
          <h3><History size={17} aria-hidden="true" />本系列赛历史</h3>
          <p>{draftRuleLabel(state)}。换边后历史跟随战队。</p>
        </div>
        <span>{games.length} 局已登记</span>
      </div>
      <div className="bp-panel-body">
      {games.length ? (
        <div className="bp-history-table">
          <div className="bp-history-heading">
            <span>局号</span>
            {(["blue", "red"] as const).map((side) => (
              <span className="bp-side-heading" data-side={side} key={side}>
                <span>{side === "blue" ? "蓝色方" : "红色方"}</span>
                <strong title={getTeam(state, side)?.name}>
                  {getTeam(state, side)?.name ||
                    (side === "blue" ? "蓝方战队" : "红方战队")}
                </strong>
              </span>
            ))}
          </div>
          {games.map((game) => (
            <div
              className="bp-history-game"
              key={`${game.seriesId}:${game.game}`}
            >
              <b>GAME {game.game}</b>
              {(["blue", "red"] as const).map((side) => (
                <div className="bp-history-picks" key={side}>
                  {historyPicksForTeam(game, state.match[`${side}TeamId`]).map(
                    (id, index) => (
                      <span
                        key={`${id}:${index}`}
                        title={championFor(champions, id)?.name || id}
                      >
                        <ChampionImage champions={champions} id={id} />
                        <small>{championFor(champions, id)?.name || id}</small>
                      </span>
                    ),
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="bp-empty">
          <strong>尚无前局记录</strong>
          <p>最终阵容进入对局后登记，预选不会计入历史。</p>
        </div>
      )}
      <details className="bp-series-actions">
        <summary>推进局号与新系列赛</summary>
        <p>
          下一局须先完成胜方与终局报告核对。开启新系列赛将重置局号和比分；已有历史仍保留。
        </p>
        <div className="bp-actions">
          <button
            className="bp-button button small"
            disabled={
              busy ||
              connected === false ||
              !owner ||
              !result?.winner ||
              result.seriesComplete ||
              gameResultAwaitingTerminalSample(result)
            }
            onClick={() =>
              void run(
                () => send({ type: "next-game" }),
                "已进入下一局，按本场规则准备 BP",
              )
            }
          >
            进入下一局
          </button>
          <HoldButton
            disabled={busy || !canPrepare}
            onExecute={() =>
              void run(
                () =>
                  send({
                    type: "set-match",
                    patch: {
                      game: 1,
                      blueScore: 0,
                      redScore: 0,
                      seriesId: `series-${crypto.randomUUID()}`,
                    },
                  }),
                "已开启新系列赛",
              )
            }
          >
            按住开启新系列赛
          </HoldButton>
        </div>
        {!owner && (
          <small>
            局号推进由 {state.production?.control?.name || "当前主导播控制席"}{" "}
            执行。
          </small>
        )}
      </details>
      </div>
      {error && (
        <p className="bp-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
