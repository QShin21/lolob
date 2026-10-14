import { useRef, useState } from "react";
import { Archive, Download, FileJson, Save, Search } from "lucide-react";
import type { BroadcastAction, Champion, Recording, StateContext } from "../../shared/types";
import { csvRecording } from "../../shared/recording-export";
import {
  frozenGameState,
  gameResultAwaitingTerminalSample,
} from "../../shared/game-results";
import { BroadcastCanvas } from "../components/BroadcastCanvas";
import { ApiError, time } from "../lib";
import { useMemoryState } from "../useMemoryState";
import { gameResultKey } from "../../shared/game-results";
import { TaskTabs } from "../components/ConsoleUI";

function exportRecording(record: Recording, type: "json" | "csv") {
  const content =
    type === "json"
      ? JSON.stringify(
          {
            ...record,
            source:
              record.mode === "demo" ? "本地演示记录" : "本地客户端采集记录",
          },
          null,
          2,
        )
      : csvRecording(record);
  const url = URL.createObjectURL(
    new Blob([content], {
      type: type === "json" ? "application/json" : "text/csv;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${record.title.replace(/[<>:"/\\|?*]/g, "_")}.${type}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const dateLabel = (value: string) =>
  Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("zh-CN")
    : "时间未提供";

export function ManagementRecords({
  state,
  champions,
  send,
  notify,
  seat,
  connected,
}: StateContext) {
  const [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [currentSeries, setCurrentSeries] = useState(false);
  const [title, setTitle] = useMemoryState(
      gameResultKey(state) + ":record-title",
      "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  type SaveTransaction = {
    action: Extract<BroadcastAction, { type: "save-recording" }>;
    seatId: string;
    gameKey: string;
    uncertain: boolean;
  };
  const inFlight = useRef(false);
  const transaction = useRef<SaveTransaction | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<SaveTransaction | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const gameKey = gameResultKey(state);
  const latestGame = useRef(gameKey);
  latestGame.current = gameKey;
  const canSave = !!connected && !!seat && ["director", "data"].includes(seat.role);
  const canRetry = canSave && (!unconfirmed || (unconfirmed.seatId === seat?.id && unconfirmed.gameKey === gameKey));
  const [scene, setScene] = useState<"postgame" | "ranking">("postgame"),
    [showReport, setShowReport] = useState(false);
  // Older valid result snapshots remain accessible even beyond the short recording list.
  const all = [
    ...state.recordings,
    ...(state.gameResults ?? [])
      .map((r) => r.snapshot)
      .filter((r) => !state.recordings.some((item) => item.id === r.id)),
  ];
  const list = all
    .filter(
      (r) =>
        (!currentSeries || r.result?.seriesId === state.match.seriesId) &&
        r.title.toLowerCase().includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (a.result?.seriesId ?? "~").localeCompare(b.result?.seriesId ?? "~") ||
        (b.result?.game ?? 0) - (a.result?.game ?? 0) ||
        (b.result?.attempt ?? 0) - (a.result?.attempt ?? 0),
    );
  const record = list.find((r) => r.id === selected) ?? list[0],
    result =
      record && state.gameResults?.find((r) => r.snapshot.id === record.id);
  const videos = record?.result
    ? (state.production?.videos.filter(
        (v) =>
          v.seriesId === record.result?.seriesId &&
          v.game === record.result.game &&
          v.attempt === record.result.attempt,
      ) ?? [])
    : [];
  async function save() {
    // Acquire before any await or React update. A second native click in the
    // same event turn must join neither a fresh ID nor a second snapshot.
    if (inFlight.current || !canSave || !seat) return;
    const pending = transaction.current;
    if (pending && (pending.seatId !== seat.id || pending.gameKey !== gameKey)) {
      setError("席位或对局已变化。请核对下方记录并结束上次保存，不能把旧请求作为新快照重发。");
      return;
    }
    inFlight.current = true;
    const current = pending ?? {
      action: { type: "save-recording" as const, title: title.trim() || undefined,
        requestId: crypto.randomUUID(), expectedConfigVersion: state.production?.configVersion },
      seatId: seat.id, gameKey, uncertain: false,
    };
    transaction.current = current;
    setBusy(true);
    setError("");
    try {
      await send(current.action);
      transaction.current = null;
      setUnconfirmed(null);
      setReviewed(false);
      if (latestGame.current === current.gameKey) setTitle("");
      notify("当前对局快照已保存");
    } catch (e) {
      // Validation/CAS rejection before any uncertain response is a known
      // failure. Transport, parsing, changed connection, and 5xx can follow a
      // committed write: keep the exact payload until a receipt or human review.
      const rejected = e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408;
      if (rejected && !current.uncertain) {
        transaction.current = null;
      } else {
        current.uncertain = true;
        setUnconfirmed({ ...current });
      }
      setError(e instanceof Error ? e.message : "快照保存结果未确认");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="manage-records">
      <div className="manage-snapshot">
        <span>
          <strong>另存当前对局快照</strong>
          <small>
            第 {state.match.game} 局 · {time(state.gameTime)} ·{" "}
            {state.mode === "demo" ? "演示" : "客户端采集"}；不会结束比赛
          </small>
        </span>
        <input
          aria-label="记录标题"
          placeholder="记录名称（可选）"
          maxLength={150}
          value={title}
          disabled={busy || !!unconfirmed || !canSave}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="button" disabled={busy || !canRetry} onClick={() => void save()}>
          <Save size={14} />
          {busy ? "正在保存记录" : unconfirmed ? "核对并重试原保存" : "保存记录"}
        </button>
      </div>
      {error && (
        <div className="domain-note error" role="alert">
          {error}
        </div>
      )}
      {unconfirmed && (
        <div className="domain-note warning manage-save-recovery" role="status">
          <strong>上次保存结果未确认：{unconfirmed.action.title || "自动命名的对局快照"}</strong>
          <p>先查看下方记录。同一席位重试会沿用原请求，不另建记录。服务重启或席位变更后，请人工核对记录；不要直接再次保存。</p>
          <label><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} />我已核对记录列表与本次保存结果</label>
          <button className="button small" disabled={busy || !reviewed} onClick={() => {
            transaction.current = null; setUnconfirmed(null); setReviewed(false); setError("");
          }}>结束本次保存核对</button>
        </div>
      )}
      <div className="manage-split">
        <aside className="manage-directory">
          <label className="domain-search">
            <Search size={15} />
            <input
              aria-label="搜索比赛记录"
              placeholder="记录名称"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="manage-record-filter">
            <input
              type="checkbox"
              checked={currentSeries}
              onChange={(e) => setCurrentSeries(e.target.checked)}
            />
            仅当前系列赛
          </label>
          <div className="manage-list domain-scroll">
            {list.map((r) => (
              <button
                className="manage-object"
                key={r.id}
                aria-pressed={r.id === record?.id}
                onClick={() => {
                  setSelected(r.id);
                  setShowReport(false);
                }}
              >
                <FileJson size={18} />
                <span>
                  <strong>{r.title}</strong>
                  <small>
                    {r.result
                      ? `第 ${r.result.game} 局 / 尝试 ${r.result.attempt} / v${r.result.version}`
                      : dateLabel(r.createdAt)}
                  </small>
                  <small>
                    {r.result?.valid === false
                      ? "已作废"
                      : r.result?.terminalComplete
                        ? "终局报告"
                        : "观测归档"}{" "}
                    · {time(r.duration)}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </aside>
        <section className="manage-detail">
          {record ? (
            <>
              <div className="manage-detail-head">
                <div>
                  <small>
                    {record.mode === "demo"
                      ? "本地演示记录"
                      : "本地客户端采集记录"}
                  </small>
                  <h2>{record.title}</h2>
                  <p>{dateLabel(record.createdAt)}</p>
                </div>
                <Archive size={24} />
              </div>
              <div className="manage-record-detail domain-scroll">
                <dl className="domain-facts">
                  <div>
                    <dt>归档状态</dt>
                    <dd>
                      {record.result?.valid === false
                        ? `已作废 · ${record.result.invalidReason ?? "参见审计记录"}`
                        : result
                          ? gameResultAwaitingTerminalSample(result)
                            ? "观测已保存，等待终局样本"
                            : "已冻结的比赛结果"
                          : "当前时刻的数据快照"}
                    </dd>
                  </div>
                  <div>
                    <dt>对局归属</dt>
                    <dd>
                      {record.result
                        ? `第 ${record.result.game} 局 · 尝试 ${record.result.attempt} · 修订 v${record.result.version}`
                        : "未关联结算结果"}
                    </dd>
                  </div>
                  <div>
                    <dt>采集范围</dt>
                    <dd>
                      {time(record.duration)} · {record.players.length} 人 ·{" "}
                      {record.events.length} 条事件
                    </dd>
                  </div>
                  <div>
                    <dt>系列赛</dt>
                    <dd>{record.result?.seriesId ?? "未提供"}</dd>
                  </div>
                </dl>
                <h3>对应录像</h3>
                {videos.length ? (
                  videos.map((v) => (
                    <div className="manage-video" key={v.id}>
                      <strong>{v.title}</strong>
                      <p>
                        {v.detail || "文件状态待核对"} ·{" "}
                        {v.playable
                          ? "可播放"
                          : v.file
                            ? "可播放性未确认"
                            : "录制尚未结束"}
                      </p>
                      {v.file && (
                        <a
                          className="button small"
                          href={`/api/videos/${encodeURIComponent(v.id)}/file`}
                        >
                          打开对应录像文件
                        </a>
                      )}
                    </div>
                  ))
                ) : (
                  <p>
                    没有匹配此系列赛、局号与尝试的录像索引。数据归档不等同于视频文件。
                  </p>
                )}
                {result && (
                  <>
                    <button
                      className="button"
                      onClick={() => setShowReport(!showReport)}
                    >
                      {showReport ? "收起报告预览" : "查看赛后报告"}
                    </button>
                    {showReport && (
                      <div
                        className="manage-report-preview"
                        aria-label={`第 ${result.game} 局归档报告`}
                      >
                        <TaskTabs
                          items={[
                            { id: "postgame", label: "赛后报告" },
                            { id: "ranking", label: "选手数据" },
                          ]}
                          value={scene}
                          onChange={setScene}
                          label="归档报告视图"
                        />
                        <BroadcastCanvas
                          state={{
                            ...frozenGameState(state, result),
                            selectedPlayerId: null,
                          }}
                          champions={champions}
                          scene={scene}
                        />
                        <p>归档排版预览，不改变 PGM 或 PVW。</p>
                      </div>
                    )}
                  </>
                )}
              </div>
              <footer className="manage-save">
                <span>保留冻结数据、采样来源和缺失字段</span>
                <div className="domain-actions">
                  <button
                    className="button small"
                    onClick={() => exportRecording(record, "json")}
                  >
                    <Download size={14} />
                    JSON
                  </button>
                  <button
                    className="button small"
                    onClick={() => exportRecording(record, "csv")}
                  >
                    <Download size={14} />
                    CSV
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className="domain-empty">
              <Archive size={32} />
              <strong>比赛记录保存在这里</strong>
              <p>
                结算后自动归档，也可以另存当前快照。使用搜索或系列赛筛选找到对应局。
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function HeroLibrary({
  champions,
  resourceVersion,
}: {
  champions: Champion[];
  resourceVersion?: string;
}) {
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState("");
  const heroes = champions.filter((c) =>
    `${c.name} ${c.id} ${c.title} ${c.tags.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const hero = champions.find((c) => c.id === selected) ?? heroes[0];
  return (
    <div className="manage-heroes">
      <header>
        <label className="domain-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索英雄 / 英文名"
            aria-label="搜索英雄"
          />
        </label>
        <span>
          资源版本 {resourceVersion || "随安装包"} · {heroes.length} 位
        </span>
      </header>
      <div className="manage-hero-stage">
        <div className="manage-hero-grid domain-scroll">
          {heroes.map((c) => (
            <button
              key={c.id}
              aria-pressed={hero?.id === c.id}
              onClick={() => setSelected(c.id)}
            >
              <img src={c.image} alt={c.name} loading="lazy" />
              <span>{c.name}</span>
            </button>
          ))}
          {!heroes.length && (
            <div className="domain-empty">
              {champions.length
                ? "未找到匹配英雄"
                : "英雄资源未就绪，请在导播台开播检查中检查素材。"}
            </div>
          )}
        </div>
        {hero && (
          <aside className="manage-hero-inspector domain-scroll">
            <img src={hero.splash} alt={`${hero.name} 原画`} />
            <h2>{hero.name}</h2>
            <p>{hero.title}</p>
            <dl className="domain-facts">
              <div>
                <dt>资源名称</dt>
                <dd>{hero.id}</dd>
              </div>
              <div>
                <dt>英雄 ID</dt>
                <dd>{hero.key}</dd>
              </div>
              <div>
                <dt>分类</dt>
                <dd>{hero.tags.join(" / ")}</dd>
              </div>
            </dl>
            <a
              className="button small"
              href={hero.splash}
              target="_blank"
              rel="noreferrer"
            >
              打开原画
            </a>
            <small>沿用本地英雄资源与现有许可说明。</small>
          </aside>
        )}
      </div>
    </div>
  );
}
