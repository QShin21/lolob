import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Plus,
  Search,
  Shield,
  Users,
} from "lucide-react";
import type { Match, StateContext, Team } from "../../shared/types";
import { programState } from "../../shared/production";
import { TaskTabs } from "../components/ConsoleUI";
import { HoldButton } from "../components/ProductionDesk";
import { AssetLibrary } from "../components/AssetLibrary";
import { MatchForm, TeamForm } from "./ManagementEditors";
import { ManagementRecords, HeroLibrary } from "./ManagementRecords";
import "../components/domain-workspace.css";
import "./management-workspace.css";

export type ManagementTab = "schedule" | "teams" | "assets" | "recordings";
type Draft<T> = { value: T; version?: number };
const roles = ["上单", "打野", "中单", "下路", "辅助"];
const id = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `local-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;
export const dateLabel = (value: string) =>
  Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "时间待定";
const statuses = { scheduled: "待开赛", live: "进行中", finished: "已结束" };

export function Management(
  ctx: StateContext & {
    initialTab?: ManagementTab;
    onOpenSettings?: () => void;
  },
) {
  const {
    state,
    send,
    notify,
    champions,
    seat,
    connected,
    initialTab = "schedule",
    onOpenSettings,
  } = ctx;
  const [tab, setTab] = useState<ManagementTab>(initialTab),
    [query, setQuery] = useState("");
  const [matchId, setMatchId] = useState(""),
    [teamId, setTeamId] = useState("");
  const [matches, setMatches] = useState<Record<string, Draft<Match>>>({}),
    [teams, setTeams] = useState<Record<string, Draft<Team>>>({});
  const [assetTab, setAssetTab] = useState<"local" | "heroes">("local");
  const [assetsVisited, setAssetsVisited] = useState(false);
  const [recordsVisited, setRecordsVisited] = useState(false);
  useEffect(() => {
    if (tab === "assets") setAssetsVisited(true);
    if (tab === "recordings") setRecordsVisited(true);
  }, [tab]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState("");
  const active = useRef(false);
  useEffect(() => setTab(initialTab), [initialTab]);
  const onAir = programState(state),
    version = state.production?.configVersion;
  const canEdit =
    !!seat && connected && (seat.role === "director" || seat.role === "data");
  const canLoad =
    canEdit &&
    seat?.role === "director" &&
    state.production?.control?.owner === seat.id;
  const matchList = [
    ...state.schedule,
    ...Object.values(matches)
      .map((d) => d.value)
      .filter((d) => !state.schedule.some((m) => m.id === d.id)),
  ];
  const teamList = [
    ...state.teams,
    ...Object.values(teams)
      .map((d) => d.value)
      .filter((d) => !state.teams.some((t) => t.id === d.id)),
  ];
  const match = matchList.find((m) => m.id === matchId) ?? matchList[0],
    team = teamList.find((t) => t.id === teamId) ?? teamList[0];
  const matchEdit = match && matches[match.id],
    teamEdit = team && teams[team.id];
  const currentDraft =
    tab === "teams" ? teamEdit : tab === "schedule" ? matchEdit : undefined;
  const serverObject =
    tab === "teams"
      ? state.teams.find((t) => t.id === team?.id)
      : state.schedule.find((m) => m.id === match?.id);
  const teamOf = (value: string) => state.teams.find((t) => t.id === value);
  const matchFilter = matchList.filter((m) =>
    `${m.title} ${teamOf(m.blueTeamId)?.name} ${teamOf(m.redTeamId)?.name}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const teamFilter = teamList.filter((t) =>
    `${t.name} ${t.tag} ${t.players.map((p) => p.name).join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const draftCount = Object.keys(matches).length + Object.keys(teams).length;
  async function run(work: () => Promise<void>, message: string) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    setReceipt("");
    try {
      await work();
      setReceipt(message);
      notify(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，本地输入已保留");
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  function editMatch(value: Match) {
    setMatchId(value.id);
    setMatches((d) =>
      d[value.id]
        ? d
        : { ...d, [value.id]: { value: structuredClone(value), version } },
    );
  }
  function editTeam(value: Team) {
    setTeamId(value.id);
    setTeams((d) =>
      d[value.id]
        ? d
        : {
            ...d,
            [value.id]: {
              value: {
                ...structuredClone(value),
                players: value.players.map((p) => ({ ...p, id: p.id ?? id() })),
              },
              version,
            },
          },
    );
  }
  function discardMatch() {
    if (match)
      setMatches((d) => {
        const next = { ...d };
        delete next[match.id];
        return next;
      });
  }
  function discardTeam() {
    if (team)
      setTeams((d) => {
        const next = { ...d };
        delete next[team.id];
        return next;
      });
  }
  async function saveMatch() {
    if (!matchEdit) return;
    const value = { ...matchEdit.value, title: matchEdit.value.title.trim() };
    if (
      !value.title ||
      !value.blueTeamId ||
      !value.redTeamId ||
      value.blueTeamId === value.redTeamId ||
      !Number.isFinite(Date.parse(value.scheduledAt))
    ) {
      setError("请填写赛事名称、有效开赛时间，并选择两支不同战队。");
      return;
    }
    await run(async () => {
      await send({
        type: "set-schedule",
        expectedConfigVersion: matchEdit.version,
        schedule: state.schedule.some((m) => m.id === value.id)
          ? state.schedule.map((m) => (m.id === value.id ? value : m))
          : [...state.schedule, value],
      });
      discardMatch();
    }, "赛程已保存到待播资料");
  }
  async function saveTeam() {
    if (!teamEdit) return;
    const value = {
      ...teamEdit.value,
      name: teamEdit.value.name.trim(),
      tag: teamEdit.value.tag.trim().toUpperCase(),
    };
    if (!value.name || !value.tag) {
      setError("请填写战队名称和缩写。");
      return;
    }
    await run(async () => {
      await send({
        type: "set-teams",
        expectedConfigVersion: teamEdit.version,
        teams: state.teams.some((t) => t.id === value.id)
          ? state.teams.map((t) => (t.id === value.id ? value : t))
          : [...state.teams, value],
      });
      discardTeam();
    }, "战队资料已保存到待播");
  }
  return (
    <section
      className="domain-workspace manage-workbench"
      aria-label="赛事与素材工作面"
    >
      <header className="domain-heading">
        <div>
          <h1>赛事与素材</h1>
          <p>
            准备：{state.match.title} · 第 {state.match.game} 局
          </p>
        </div>
        <div className="manage-onair">
          <span className="bus-tag pgm">PGM</span>
          <span>
            {onAir.match.title}
            <small>
              第 {onAir.match.game} 局 · {onAir.match.blueScore}:
              {onAir.match.redScore}
            </small>
          </span>
          {onOpenSettings && (
            <button className="button small" onClick={onOpenSettings}>
              连接检查
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </header>
      <TaskTabs
        items={[
          { id: "schedule", label: `赛事赛程 · ${state.schedule.length}` },
          { id: "teams", label: `战队与选手 · ${state.teams.length}` },
          { id: "assets", label: `图片素材 · ${state.assets.length}` },
          { id: "recordings", label: `比赛记录 · ${state.recordings.length}` },
        ]}
        value={tab}
        onChange={(value) => {
          setTab(value);
          setQuery("");
        }}
        label="赛事管理分类"
      />
      {error && (
        <div className="domain-note error" role="alert">
          {error}
        </div>
      )}
      {receipt && !error && (
        <div className="manage-receipt" role="status">
          {receipt} · 正在播出的资料由 TAKE 更新。
        </div>
      )}
      {(tab === "schedule" || tab === "teams") && (
        <div className="manage-split">
          <aside className="manage-directory">
            <label className="domain-search">
              <Search size={15} />
              <input
                aria-label={tab === "teams" ? "搜索战队与选手" : "搜索赛程"}
                placeholder={tab === "teams" ? "战队、选手" : "赛事、双方战队"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="manage-list domain-scroll">
              {tab === "schedule"
                ? matchFilter.map((m) => (
                    <button
                      className="manage-object"
                      data-kind="match"
                      key={m.id}
                      aria-pressed={match?.id === m.id}
                      onClick={() => setMatchId(m.id)}
                    >
                      <CalendarDays size={17} />
                      <span>
                        <strong>{matches[m.id]?.value.title ?? m.title}</strong>
                        <small>
                          {teamOf(m.blueTeamId)?.tag || "待定"} {m.blueScore}:
                          {m.redScore} {teamOf(m.redTeamId)?.tag || "待定"}
                        </small>
                        <small>
                          {dateLabel(m.scheduledAt)} · {statuses[m.status]}
                        </small>
                      </span>
                      {matches[m.id] && <em>草稿</em>}
                    </button>
                  ))
                : teamFilter.map((t) => (
                    <button
                      className="manage-object"
                      data-kind="team"
                      key={t.id}
                      aria-pressed={team?.id === t.id}
                      onClick={() => editTeam(t)}
                    >
                      {t.logo ? (
                        <img src={t.logo} alt="" />
                      ) : (
                        <Shield size={22} />
                      )}
                      <span>
                        <strong>{teams[t.id]?.value.name ?? t.name}</strong>
                        <small>
                          {t.tag} · {t.players.length} 名选手
                        </small>
                      </span>
                      {teams[t.id] && <em>草稿</em>}
                    </button>
                  ))}
              {!(tab === "teams" ? teamFilter : matchFilter).length && (
                <div className="domain-empty">
                  没有匹配项目。可清除搜索或新建。
                </div>
              )}
            </div>
            <button
              className="button"
              disabled={!canEdit || busy}
              onClick={() => {
                if (tab === "schedule") {
                  const value: Match = {
                    id: id(),
                    title: "自定义赛事",
                    blueTeamId: state.teams[0]?.id ?? "",
                    redTeamId: state.teams[1]?.id ?? "",
                    scheduledAt: new Date().toISOString(),
                    format: "BO3",
                    status: "scheduled",
                    blueScore: 0,
                    redScore: 0,
                  };
                  editMatch(value);
                } else {
                  editTeam({
                    id: id(),
                    name: "新建战队",
                    tag: "TEAM",
                    color: "#70d7c2",
                    players: roles.map((role) => ({
                      id: id(),
                      role,
                      name: "",
                    })),
                  });
                }
              }}
            >
              <Plus size={15} />
              {tab === "teams" ? "新增战队" : "新增比赛"}
            </button>
          </aside>
          <div className="manage-detail">
            {currentDraft && currentDraft.version !== version && (
              <details className="manage-conflict">
                <summary>待播版本有更新 · 核对差异</summary>
                <div>
                  <section>
                    <h3>本地草稿</h3>
                    <pre>{JSON.stringify(currentDraft.value, null, 2)}</pre>
                  </section>
                  <section>
                    <h3>最新待播资料</h3>
                    <pre>
                      {JSON.stringify(
                        serverObject ?? "服务器已无此对象",
                        null,
                        2,
                      )}
                    </pre>
                  </section>
                </div>
                <button
                  className="button small"
                  onClick={() => {
                    if (tab === "teams" && team)
                      setTeams((d) => ({
                        ...d,
                        [team.id]: { ...d[team.id], version },
                      }));
                    if (tab === "schedule" && match)
                      setMatches((d) => ({
                        ...d,
                        [match.id]: { ...d[match.id], version },
                      }));
                    setError("");
                    setReceipt("已核对版本，本地草稿保留，请再次保存");
                  }}
                >
                  核对后保留本地草稿
                </button>
              </details>
            )}
            {tab === "schedule" &&
              (matchEdit ? (
                <MatchForm
                  value={matchEdit.value}
                  teams={state.teams}
                  onChange={(value) =>
                    setMatches((d) => ({
                      ...d,
                      [value.id]: { ...d[value.id], value },
                    }))
                  }
                  disabled={busy || !canEdit}
                  onSave={() => void saveMatch()}
                  onDiscard={discardMatch}
                  onRemove={
                    state.schedule.some((m) => m.id === matchEdit.value.id)
                      ? () =>
                          void run(async () => {
                            await send({
                              type: "set-schedule",
                              expectedConfigVersion: matchEdit.version,
                              schedule: state.schedule.filter(
                                (m) => m.id !== matchEdit.value.id,
                              ),
                            });
                            discardMatch();
                          }, "比赛已从赛程移除")
                      : undefined
                  }
                />
              ) : match ? (
                <>
                  <div className="manage-detail-head">
                    <div>
                      <small>
                        {statuses[match.status]} · {match.format}
                      </small>
                      <h2>{match.title}</h2>
                      <p>{dateLabel(match.scheduledAt)}</p>
                    </div>
                    <button
                      className="button"
                      disabled={!canEdit || busy}
                      onClick={() => editMatch(match)}
                    >
                      编辑比赛
                    </button>
                  </div>
                  <div className="manage-match-summary domain-scroll">
                    <div className="manage-versus">
                      {(["blue", "red"] as const).map((side) => (
                        <div key={side} data-side={side}>
                          {teamOf(match[`${side}TeamId`])?.logo ? (
                            <img
                              src={teamOf(match[`${side}TeamId`])?.logo}
                              alt="战队标志"
                            />
                          ) : (
                            <Shield size={34} />
                          )}
                          <small>{side === "blue" ? "蓝方" : "红方"}</small>
                          <h3>
                            {teamOf(match[`${side}TeamId`])?.name ??
                              "战队资料缺失"}
                          </h3>
                          <strong>{match[`${side}Score`]}</strong>
                        </div>
                      ))}
                    </div>
                    <h3>载入这场比赛</h3>
                    <p>
                      准备区将使用以上双方、赛制与比分。首次载入从第 1
                      局开始；已有同系列赛归档时按实际记录续接。当前节目保留已播版本，核对预监后再
                      TAKE。
                    </p>
                    <p>
                      载入不会代替开始新系列赛。重赛、下一局和新系列赛分别在赛后收尾与
                      BP 规则中操作。
                    </p>
                  </div>
                  <footer className="manage-save">
                    <span>
                      {!canLoad
                        ? `由当前主导播 ${state.production?.control?.name ?? "待确认"} 载入比赛`
                        : "请先核对双方、比分和当前局归属"}
                    </span>
                    <HoldButton
                      disabled={busy || !canLoad}
                      onExecute={() =>
                        void run(async () => {
                          await send({ type: "load-match", matchId: match.id });
                          onOpenSettings?.();
                        }, "比赛已载入准备区，请核对连接与输出")
                      }
                    >
                      按住载入 {teamOf(match.blueTeamId)?.tag} 对{" "}
                      {teamOf(match.redTeamId)?.tag}
                    </HoldButton>
                  </footer>
                </>
              ) : (
                <div className="domain-empty">
                  <CalendarDays />
                  <strong>建立比赛日程</strong>
                  <p>添加双方战队、开赛时间和赛制，再明确载入准备区。</p>
                </div>
              ))}
            {tab === "teams" &&
              (teamEdit ? (
                <TeamForm
                  value={teamEdit.value}
                  state={state}
                  onChange={(value) =>
                    setTeams((d) => ({
                      ...d,
                      [value.id]: { ...d[value.id], value },
                    }))
                  }
                  disabled={busy || !canEdit}
                  onSave={() => void saveTeam()}
                  onDiscard={discardTeam}
                  onRemove={
                    state.teams.some((t) => t.id === teamEdit.value.id)
                      ? () => {
                          if (state.teams.length <= 2) {
                            setError("资料库需保留至少两支战队");
                            return;
                          }
                          if (
                            state.schedule.some(
                              (m) =>
                                m.blueTeamId === teamEdit.value.id ||
                                m.redTeamId === teamEdit.value.id,
                            ) ||
                            state.match.blueTeamId === teamEdit.value.id ||
                            state.match.redTeamId === teamEdit.value.id
                          ) {
                            setError(
                              "该战队正在用于赛程或当前比赛，请先修改相关对阵",
                            );
                            return;
                          }
                          void run(async () => {
                            await send({
                              type: "set-teams",
                              expectedConfigVersion: teamEdit.version,
                              teams: state.teams.filter(
                                (t) => t.id !== teamEdit.value.id,
                              ),
                            });
                            discardTeam();
                          }, "战队已移除");
                        }
                      : undefined
                  }
                />
              ) : team ? (
                <div className="domain-empty">
                  <Users size={32} />
                  <strong>{team.name}</strong>
                  <p>
                    选择左侧战队，编辑名称、稳定选手身份、游戏账号与照片。保存只进入待播资料。
                  </p>
                  <button
                    className="button"
                    disabled={!canEdit}
                    onClick={() => editTeam(team)}
                  >
                    编辑战队资料
                  </button>
                </div>
              ) : (
                <div className="domain-empty">先新建两支战队，再准备对阵。</div>
              ))}
          </div>
        </div>
      )}
      {(assetsVisited || tab === "assets") && (
        <div className="manage-assets" hidden={tab !== "assets"}>
          <TaskTabs
            items={[
              { id: "local", label: "上传素材" },
              { id: "heroes", label: `英雄图库 · ${champions.length}` },
            ]}
            value={assetTab}
            onChange={setAssetTab}
            label="素材来源"
          />
          <div hidden={assetTab !== "local"} className="manage-asset-content">
            <AssetLibrary state={state} notify={notify} disabled={!canEdit} />
          </div>
          <div hidden={assetTab !== "heroes"} className="manage-asset-content">
            <HeroLibrary
              champions={champions}
              resourceVersion={state.production?.versions.resources}
            />
          </div>
        </div>
      )}
      {(tab === "recordings" || recordsVisited) && (
        <div hidden={tab !== "recordings"} className="manage-records-host">
          <ManagementRecords {...ctx} />
        </div>
      )}
      <footer className="domain-footer">
        <span>
          {draftCount
            ? `${draftCount} 份本地编辑已保留，尚未保存。切换对象或页面可继续编辑。`
            : "资料保存进入待播；正在播出的比赛和名单独立保持。"}
        </span>
        <span>
          {canEdit
            ? "资料编辑可用"
            : connected
              ? "当前席位无资料编辑权限"
              : "同步中断，请保留草稿"}
        </span>
      </footer>
    </section>
  );
}
