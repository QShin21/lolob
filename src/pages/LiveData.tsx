import { useState } from "react";
import { Activity, ArrowDownToLine, Search, UserRound } from "lucide-react";
import type { Player, Side, StateContext } from "../../shared/types";
import {
  currentGameResult,
  frozenGameState,
  gameResultAwaitingTerminalSample,
} from "../../shared/game-results";
import { getTeam, gold, playerKda, time } from "../lib";
import { ChampionImage, EconomyChart } from "../components/BroadcastCanvas";
import { TaskTabs } from "../components/ConsoleUI";
import { EconomySourcePanel } from "../components/EconomySourcePanel";
import {
  useItemCatalog,
  dataDragonItemImage,
} from "../components/useItemCatalog";
import "../components/domain-workspace.css";
import "./data-workspace.css";

const sampleTime = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleTimeString("zh-CN", { hour12: false })
    : "未提供";
const connectionNames = {
  lcu: "客户端 BP",
  live: "局内统计",
  replay: "回放接口",
  obs: "OBS 合成",
};
const connectionStatus = {
  connected: "已连接",
  connecting: "连接中",
  disconnected: "未连接",
  error: "异常",
};
const sourceNames = {
  none: "待采集",
  api: "游戏 API",
  ocr: "观战 HUD 识别",
  manual: "人工校准",
};

export function LiveData({
  state: sourceState,
  champions,
  send,
  notify,
}: StateContext) {
  const result = currentGameResult(sourceState),
    state = frozenGameState(sourceState);
  const [tab, setTab] = useState<"players" | "overview" | "events" | "health">(
    "players",
  );
  const [group, setGroup] = useState<"all" | "blue" | "red" | "pair">("pair");
  const [ranking, setRanking] = useState<
    "cs" | "kills" | "equipment" | "level" | "gold"
  >("cs");
  const [ascending, setAscending] = useState(false),
    [extra, setExtra] = useState(false),
    [query, setQuery] = useState("");
  const [inspectedId, setInspectedId] = useState(""),
    [error, setError] = useState("");
  const { items, version, status } = useItemCatalog(champions);
  const equipmentValue = (p: Player): number | null =>
    p.items.length && p.items.every((id) => items[id]?.gold !== undefined)
      ? p.items.reduce((sum, id) => sum + items[id].gold!, 0)
      : null;
  const available = (p: Player) =>
    p.statsAvailable !== false;
  const metric = (p: Player) =>
    ranking === "equipment"
      ? (equipmentValue(p) ?? -1)
      : !available(p) && (ranking === "cs" || ranking === "kills")
        ? -1
        : (p[ranking] ?? -1);
  const players = state.players
    .filter(
      (p) =>
        ((group !== "blue" && group !== "red") || p.team === group) &&
        `${p.name} ${p.role} ${p.championName}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      if (group === "pair") {
        const roles = ["上单", "打野", "中单", "下路", "辅助"];
        return (
          roles.indexOf(a.role) - roles.indexOf(b.role) ||
          a.team.localeCompare(b.team)
        );
      }
      const av = metric(a),
        bv = metric(b);
      return av < 0
        ? bv < 0
          ? 0
          : 1
        : bv < 0
          ? -1
          : ascending
            ? av - bv
            : bv - av;
    });
  const player = players.find((p) => p.id === inspectedId) ?? players[0];
  const source =
    sourceNames[state.economyFeed?.source ?? "none"];
  const statsSource = (p: Player) =>
    !available(p)
        ? "未提供"
        : p.statsSource === "ocr"
          ? "OCR"
          : p.statsSource === "api"
            ? "API"
            : "待采集";
  const statsDetail = (p: Player) =>
    `${statsSource(p)} · 采样 ${sampleTime(p.statsSampledAt)} · 有效至 ${sampleTime(p.statsExpiresAt)}`;
  const teamKills = (side: Side) =>
    state.mode === "live" &&
    (!state.players.some((p) => p.team === side) ||
      state.players.some((p) => p.team === side && !available(p)))
      ? "—"
      : state.stats[side].kills;
  async function act(action: Parameters<typeof send>[0], message: string) {
    setError("");
    try {
      await send(action);
      notify(message);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "操作失败，输入和当前视图已保留",
      );
    }
  }
  const exportUrl = (format: string) =>
    `/api/export?format=${format}${result ? `&recordingId=${encodeURIComponent(result.snapshot.id)}` : ""}`;
  return (
    <section
      className="domain-workspace data-workbench"
      aria-label="实时数据工作面"
    >
      <div className="data-top">
        <header className="domain-heading">
          <div>
            <h1>实时数据</h1>
            <p>
              {state.match.title} · 第 {state.match.game} 局 ·{" "}
              {result
                ? gameResultAwaitingTerminalSample(result)
                  ? "观测已保存，等待终局"
                  : "最终数据已冻结"
                : "当前对局采集"}
            </p>
          </div>
          <span className="data-clock">
            {time(state.gameTime)}
            <small>
              {source} · 样本 {sampleTime(state.economyFeed?.sampledAt)}
            </small>
          </span>
        </header>
        <TaskTabs
          items={[
            { id: "players", label: "十人数据" },
            { id: "overview", label: "经济与团队" },
            { id: "events", label: "比赛事件" },
            { id: "health", label: "来源与校准" },
          ]}
          value={tab}
          onChange={setTab}
          label="数据视图"
        />
      </div>
      {error && (
        <div role="alert" className="domain-note error">
          {error}
        </div>
      )}
      <div className="data-stage" hidden={tab !== "players"}>
        <section className="data-comparison">
          <div className="data-tools">
            <div className="data-toolbar">
              <h2>
                <span className="sr-only">十人对局数据</span>
                <small>{players.length} 人</small>
              </h2>
              <label className="domain-search">
                <Search size={15} />
                <input
                  aria-label="搜索选手数据"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="姓名、英雄、分路"
                />
              </label>
            </div>
            <div className="data-filters">
              <label>
                显示
                <select
                  aria-label="选手显示范围"
                  value={group}
                  onChange={(e) => setGroup(e.target.value as typeof group)}
                >
                  <option value="pair">同分路对位</option>
                  <option value="all">全场排序</option>
                  <option value="blue">蓝方</option>
                  <option value="red">红方</option>
                </select>
              </label>
              <select
                aria-label="数据排序"
                value={ranking}
                disabled={group === "pair"}
                onChange={(e) => setRanking(e.target.value as typeof ranking)}
              >
                <option value="gold">按累计经济排序</option>
                <option value="cs">按补刀排序</option>
                <option value="kills">按击杀排序</option>
                <option value="equipment">按装备目录价值排序</option>
                <option value="level">按等级排序</option>
              </select>
              <button
                className="button small"
                disabled={group === "pair"}
                onClick={() => setAscending(!ascending)}
              >
                {ascending ? "升序 ↑" : "降序 ↓"}
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={extra}
                  onChange={(e) => setExtra(e.target.checked)}
                />
                金币明细 / 装备
              </label>
            </div>
          </div>
          <div className="data-grid-scroll">
            <table className="data-grid">
              <thead>
                <tr>
                  <th>选手 / 阵营</th>
                  <th>英雄 / 分路</th>
                  <th>等级</th>
                  <th>K / D / A</th>
                  <th>补刀</th>
                  <th>累计经济</th>
                  {extra && (
                    <>
                      <th>当前金币</th>
                      <th>装备目录价值</th>
                      <th>装备清单</th>
                    </>
                  )}
                  <th>来源</th>
                  <th>检查</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr
                    key={p.id}
                    data-selected={player?.id === p.id}
                    data-side={p.team}
                  >
                    <td>
                      <strong title={p.name}>{p.name}</strong>
                      <small>
                        {getTeam(state, p.team)?.tag} ·{" "}
                        {p.team === "blue" ? "蓝方" : "红方"}
                      </small>
                    </td>
                    <td>
                      <div className="data-champion">
                        <ChampionImage
                          champions={champions}
                          id={p.championId}
                        />
                        <span>
                          {p.championName || "未选择"}
                          <small>{p.role || "待分路"}</small>
                        </span>
                      </div>
                    </td>
                    <td>{p.level ?? "—"}</td>
                    <td title={statsDetail(p)}>
                      {available(p) ? playerKda(p) : "—"}
                    </td>
                    <td title={statsDetail(p)}>{available(p) ? p.cs : "—"}</td>
                    <td
                      title={`累计经济 · ${p.goldSource || "来源未提供"} · ${sampleTime(p.goldSampledAt)}`}
                    >
                      {p.gold == null ? "—" : p.gold.toLocaleString("zh-CN")}
                    </td>
                    {extra && (
                      <>
                        <td>
                          {p.currentGold == null
                            ? "—"
                            : p.currentGold.toLocaleString("zh-CN")}
                        </td>
                        <td>{gold(equipmentValue(p))}</td>
                        <td>
                          <div className="data-grid-equipment">
                            {p.items.slice(0, 7).map((id, i) => {
                              const src =
                                items[id]?.image ||
                                dataDragonItemImage(version, id);
                              return src ? (
                                <img
                                  key={`${id}-${i}`}
                                  src={src}
                                  alt={items[id]?.name || `装备 ${id}`}
                                  title={items[id]?.name || `装备 ${id}`}
                                  onError={(e) => {
                                    e.currentTarget.style.visibility = "hidden";
                                  }}
                                />
                              ) : (
                                <span key={`${id}-${i}`}>—</span>
                              );
                            })}
                            {!p.items.length && "—"}
                          </div>
                        </td>
                      </>
                    )}
                    <td>
                      <span className="data-source-tag">{statsSource(p)}</span>
                    </td>
                    <td>
                      <button
                        className="button small"
                        aria-label={`检查 ${p.name}`}
                        aria-pressed={player?.id === p.id}
                        onClick={() => setInspectedId(p.id)}
                      >
                        检查
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!players.length && (
              <div className="domain-empty">
                {state.players.length
                  ? "没有匹配的选手，调整搜索或阵营范围。"
                  : "等待本局名单。连接客户端后，在这里核对十人数据。"}
              </div>
            )}
          </div>
        </section>
        <aside
          className="data-inspector domain-scroll"
          aria-label="选手数据检查"
        >
          {player ? (
            <>
              <div className="data-player-heading">
                <ChampionImage champions={champions} id={player.championId} />
                <div>
                  <small>
                    {getTeam(state, player.team)?.name} · {player.role}
                  </small>
                  <h2>{player.name}</h2>
                  <p>{player.championName || "待选择英雄"}</p>
                </div>
              </div>
              <dl className="domain-facts">
                <div>
                  <dt>统计来源</dt>
                  <dd>{statsSource(player)}</dd>
                </div>
                <div>
                  <dt>统计采样</dt>
                  <dd>{sampleTime(player.statsSampledAt)}</dd>
                </div>
                <div>
                  <dt>统计有效至</dt>
                  <dd>{sampleTime(player.statsExpiresAt)}</dd>
                </div>
                <div>
                  <dt>经济来源</dt>
                  <dd>
                    {player.goldSource === "ocr"
                        ? "OCR"
                        : player.goldSource === "api"
                          ? "API"
                          : "未提供"}
                  </dd>
                </div>
                <div>
                  <dt>经济采样 / 到期</dt>
                  <dd>
                    {sampleTime(player.goldSampledAt)} /{" "}
                    {sampleTime(player.goldExpiresAt)}
                  </dd>
                </div>
              </dl>
              <h3>装备与符文</h3>
              <div className="data-inspector-items">
                {Array.from({ length: 7 }, (_, i) => {
                  const id = (player.itemSlots ?? player.items)[i],
                    item = items[id],
                    src = id
                      ? item?.image || dataDragonItemImage(version, id)
                      : undefined;
                  return (
                    <div
                      key={i}
                      title={item?.name || (id ? `装备 ${id}` : "空装备栏")}
                    >
                      {src ? (
                        <img
                          src={src}
                          alt={item?.name || `装备 ${id}`}
                          onError={(e) => {
                            e.currentTarget.style.visibility = "hidden";
                          }}
                        />
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p>{player.runes?.join(" / ") || "客户端未提供符文"}</p>
              <small>
                装备目录 {version || "未提供"} ·{" "}
                {status === "unavailable" ? "素材暂不可用" : "静态购买价"}
              </small>
              <div className="data-focus-actions">
                <strong>
                  {sourceState.selectedPlayerId === player.id
                    ? "已设为待播焦点"
                    : "准备选手焦点"}
                </strong>
                <button
                  className="button"
                  onClick={() =>
                    void act(
                      {
                        type: "select-player",
                        playerId:
                          sourceState.selectedPlayerId === player.id
                            ? null
                            : player.id,
                      },
                      sourceState.selectedPlayerId === player.id
                        ? "已清除待播焦点"
                        : `待播焦点：${player.name}`,
                    )
                  }
                >
                  {sourceState.selectedPlayerId === player.id
                    ? "取消待播焦点"
                    : "设为待播焦点"}
                </button>
                <button
                  className="button small"
                  disabled={!sourceState.selectedPlayerId}
                  onClick={() =>
                    void act(
                      { type: "preview-scene", scene: "ranking" },
                      "选手出装详情已设为预监",
                    )
                  }
                >
                  出装详情发送至预监
                </button>
                <button
                  className="button small"
                  disabled={!sourceState.selectedPlayerId}
                  onClick={() =>
                    void act(
                      { type: "preview-scene", scene: "interview" },
                      "采访名牌已设为预监",
                    )
                  }
                >
                  采访名牌发送至预监
                </button>
                <small>
                  检查选手只改变本页；设置焦点和预监后，再由主导播 TAKE。
                </small>
              </div>
            </>
          ) : (
            <div className="domain-empty">
              <UserRound />
              <p>本局名单到达后可检查采样、装备与符文。</p>
            </div>
          )}
        </aside>
      </div>
      <div className="data-analysis domain-scroll" hidden={tab !== "overview"}>
        <div className="data-team-comparison">
          {(["blue", "red"] as const).map((side) => (
            <section key={side} data-side={side}>
              <h2>
                {getTeam(state, side)?.name}
                <small>{side === "blue" ? "蓝方" : "红方"}</small>
              </h2>
              <dl>
                <div>
                  <dt>团队累计经济</dt>
                  <dd>{gold(state.stats[side].gold)}</dd>
                </div>
                <div>
                  <dt>击杀</dt>
                  <dd>{teamKills(side)}</dd>
                </div>
                <div>
                  <dt>防御塔</dt>
                  <dd>
                    {state.mode === "live" &&
                    state.stats[side].objectivesAvailable === false
                      ? "—"
                      : state.stats[side].towers}
                  </dd>
                </div>
                <div>
                  <dt>巨龙</dt>
                  <dd>
                    {state.mode === "live" &&
                    state.stats[side].objectivesAvailable === false
                      ? "—"
                      : state.stats[side].dragons}
                  </dd>
                </div>
              </dl>
            </section>
          ))}
        </div>
        <div className="data-chart-heading">
          <h2>
            <Activity size={17} />
            经济差曲线
          </h2>
          <button
            className="button small"
            onClick={() =>
              void act(
                { type: "preview-scene", scene: "economy" },
                "经济曲线已设为预监",
              )
            }
          >
            发送至预监
          </button>
        </div>
        <EconomyChart state={state} interactive />
        <p className="data-table-foot">
          {state.economyFeed?.detail || "等待有效团队经济。"}{" "}
          保留采样来源与断采缺口；正值为蓝方领先，负值为红方领先。
        </p>
      </div>
      <div className="data-events domain-scroll" hidden={tab !== "events"}>
        <header>
          <h2>比赛事件</h2>
          <span>{state.events.length} 条 · 最近在前</span>
        </header>
        {[...state.events].reverse().map((e) => (
          <div className="data-event" key={e.id}>
            <time>{time(e.time)}</time>
            <span data-side={e.team}>
              {e.team === "blue" ? "蓝方" : e.team === "red" ? "红方" : "比赛"}
            </span>
            <p>{e.text}</p>
          </div>
        ))}
        {!state.events.length && (
          <div className="domain-empty">尚无本局事件。对局开始后持续更新。</div>
        )}
      </div>
      <div className="data-health domain-scroll" hidden={tab !== "health"}>
        <div className="data-connection-list">
          {Object.entries(sourceState.connections).map(([key, c]) => (
            <div key={key}>
              <strong>
                {connectionNames[key as keyof typeof connectionNames]}
              </strong>
              <span data-status={c.status}>{connectionStatus[c.status]}</span>
              <p>{c.detail || "尚无采集说明"}</p>
              <small>更新 {sampleTime(c.updatedAt)}</small>
            </div>
          ))}
        </div>
        {result ? (
          <div className="domain-note">
            正在查看归档。请进入下一局后校准当前对局；历史记录不使用新采样覆盖。
          </div>
        ) : (
          <EconomySourcePanel state={sourceState} notify={notify} />
        )}
      </div>
      <footer className="domain-footer">
        <span>
          累计经济、当前金币、装备价分别展示；缺失为 —。
          {result ? "导出本局归档" : "导出当前对局"}保留采样来源。
        </span>
        <div className="domain-actions">
          <a className="button small" href={exportUrl("csv")} download>
            <ArrowDownToLine size={14} />
            CSV
          </a>
          <a className="button small" href={exportUrl("json")} download>
            <ArrowDownToLine size={14} />
            JSON
          </a>
        </div>
      </footer>
    </section>
  );
}
