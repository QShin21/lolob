import { parseRiotId } from '../../shared/player-identity';
import { Save, Trash2 } from "lucide-react";
import type { BroadcastState, Match, Team } from "../../shared/types";

type FormProps<T> = {
  value: T;
  onChange: (value: T) => void;
  disabled: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onRemove?: () => void;
};
const localDate = (value: string) => {
  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
};
const roles = ["上单", "打野", "中单", "下路", "辅助"];

/** Task tabs whose trailing count reads as a quiet figure. The accessible name stays "label · count". */
export function CountTabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: readonly { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="task-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(e) => {
            const next =
              e.key === "ArrowRight"
                ? (index + 1) % items.length
                : e.key === "ArrowLeft"
                  ? (index + items.length - 1) % items.length
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? items.length - 1
                      : -1;
            if (next >= 0) {
              e.preventDefault();
              onChange(items[next].id);
              (
                e.currentTarget.parentElement?.children[next] as HTMLElement
              )?.focus();
            }
          }}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="manage-tab-count">
              <span className="sr-only"> · </span>
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export type ScheduleBus = "pgm" | "pvw" | undefined;
/** The bus that carries a schedule match: on air, or loaded into the prepared data behind preview. */
export function scheduleBus(
  state: BroadcastState,
  onAir: BroadcastState,
  matchId: string,
): ScheduleBus {
  if (onAir.match.seriesId === `${onAir.mode}:schedule:${matchId}`) return "pgm";
  if (state.match.seriesId === `${state.mode}:schedule:${matchId}`) return "pvw";
  return undefined;
}
export function BusTag({ bus }: { bus: ScheduleBus }) {
  return bus ? (
    <span
      className={`bus-tag ${bus}`}
      title={bus === "pgm" ? "这场比赛正在节目中" : "这场比赛已载入准备区"}
    >
      {bus === "pgm" ? "PGM" : "PVW"}
    </span>
  ) : null;
}

function Footer({
  disabled,
  onSave,
  onDiscard,
  onRemove,
  kind,
}: {
  disabled: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onRemove?: () => void;
  kind: "比赛" | "战队";
}) {
  return (
    <footer className="manage-save">
      <span>本地草稿 · 保存到待播</span>
      <div className="domain-actions">
        {onRemove && (
          <button
            className="button small danger"
            disabled={disabled}
            onClick={onRemove}
          >
            <Trash2 size={14} />
            移除{kind}
          </button>
        )}
        <button
          className="button small"
          disabled={disabled}
          onClick={onDiscard}
        >
          放弃本地草稿
        </button>
        <button className="button primary" disabled={disabled} onClick={onSave}>
          <Save size={15} />
          保存{kind}
        </button>
      </div>
    </footer>
  );
}
export function MatchForm({
  value,
  onChange,
  teams,
  ...actions
}: FormProps<Match> & { teams: Team[] }) {
  return (
    <>
      <div className="manage-detail-head">
        <div>
          <h2>{value.title || "未命名比赛"}</h2>
          <p>保存赛程后，另行按住载入；保存不会自动切入。</p>
        </div>
      </div>
      <fieldset
        className="manage-fields domain-scroll"
        disabled={actions.disabled}
      >
        <label className="field">
          <span>赛事 / 比赛名称</span>
          <input
            maxLength={150}
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
          />
        </label>
        <label className="field">
          <span>开赛时间</span>
          <input
            type="datetime-local"
            value={localDate(value.scheduledAt)}
            onChange={(e) =>
              onChange({
                ...value,
                scheduledAt: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : "",
              })
            }
          />
        </label>
        {(["blue", "red"] as const).map((side) => (
          <label className="field" data-side={side} key={side}>
            <span>{side === "blue" ? "蓝色方" : "红色方"}</span>
            <select
              value={value[`${side}TeamId`]}
              onChange={(e) =>
                onChange({ ...value, [`${side}TeamId`]: e.target.value })
              }
            >
              <option value="">选择战队</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.tag}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="field">
          <span>赛制</span>
          <select
            value={value.format}
            onChange={(e) => onChange({ ...value, format: e.target.value })}
          >
            {["BO1", "BO3", "BO5", "BO7"].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>比赛状态</span>
          <select
            value={value.status}
            onChange={(e) =>
              onChange({ ...value, status: e.target.value as Match["status"] })
            }
          >
            <option value="scheduled">待开赛</option>
            <option value="live">进行中</option>
            <option value="finished">已结束</option>
          </select>
        </label>
        {(["blue", "red"] as const).map((side) => (
          <label className="field" data-side={side} key={side}>
            <span>{side === "blue" ? "蓝色方比分" : "红色方比分"}</span>
            <input
              type="number"
              min={0}
              max={99}
              value={value[`${side}Score`]}
              onChange={(e) =>
                onChange({
                  ...value,
                  [`${side}Score`]: Math.max(
                    0,
                    Math.min(99, Number(e.target.value)),
                  ),
                })
              }
            />
          </label>
        ))}
      </fieldset>
      <Footer {...actions} kind="比赛" />
    </>
  );
}
export function TeamForm({
  value,
  onChange,
  state,
  ...actions
}: FormProps<Team> & { state: BroadcastState }) {
  const update = (index: number, patch: Partial<Team["players"][number]>) =>
    onChange({
      ...value,
      players: value.players.map((p, i) =>
        i === index ? { ...p, ...patch } : p,
      ),
    });
  return (
    <>
      <div className="manage-detail-head">
        <div>
          <h2>{value.name || "未命名战队"}</h2>
          <p>游戏账号用于匹配采集身份，选手 ID 随资料保留。</p>
        </div>
      </div>
      <div className="manage-team-form domain-scroll">
        <fieldset className="manage-fields" disabled={actions.disabled}>
          <label className="field">
            <span>战队名称</span>
            <input
              maxLength={80}
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>战队缩写</span>
            <input
              maxLength={12}
              value={value.tag}
              onChange={(e) => onChange({ ...value, tag: e.target.value })}
            />
          </label>
          <label className="field">
            <span>战队标志</span>
            <select
              value={value.logo || ""}
              onChange={(e) =>
                onChange({ ...value, logo: e.target.value || undefined })
              }
            >
              <option value="">默认标志</option>
              {state.assets.map((a) => (
                <option key={a.id} value={a.url}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>战队颜色</span>
            <span className="manage-color">
              <input
                type="color"
                value={value.color}
                onChange={(e) => onChange({ ...value, color: e.target.value })}
              />
              <span>{value.color.toUpperCase()}</span>
            </span>
          </label>
        </fieldset>
        <div className="manage-roster">
          <h3>选手名单</h3>
          <div className="manage-roster-header">
            <span>位置</span>
            <span>播出名称</span>
            <span>游戏账号 / ID</span>
            <span>照片 / 当前匹配</span>
          </div>
          {value.players.map((p, i) => (
            <fieldset
              className="manage-roster-row"
              disabled={actions.disabled}
              key={p.id ?? i}
            >
              <select
                aria-label={`选手 ${i + 1} 位置`}
                value={p.role}
                onChange={(e) => update(i, { role: e.target.value })}
              >
                {roles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <input
                aria-label={`选手 ${i + 1} 名称`}
                maxLength={80}
                value={p.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="播出名称"
              />
              <input
                aria-label={`选手 ${i + 1} 游戏账号`}
                maxLength={150}
                value={p.account ?? ""}
                onChange={(e) => update(i, { account: e.target.value })}
                onBlur={(e)=>{const parsed=parseRiotId(e.target.value);if(parsed&&parsed.display!==e.target.value)update(i,{account:parsed.display});}}
                placeholder="API 名称或唯一 ID"
              />
              <div className="manage-roster-photo">
                {p.portrait && <img src={p.portrait} alt={`${p.name} 照片`} />}
                <select
                  aria-label={`选手 ${i + 1} 照片`}
                  value={p.portrait || ""}
                  onChange={(e) =>
                    update(i, { portrait: e.target.value || undefined })
                  }
                >
                  <option value="">默认头像</option>
                  {state.assets.map((a) => (
                    <option key={a.id} value={a.url}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <small hidden={!p.account}>
                  {p.account
                    ? `${state.players.filter((current) => state.match[`${current.team}TeamId`] === value.id && (current.id.replace(/^(live|lcu)-/, "") === p.account || current.name === p.account)).length} 名当前选手匹配`
                    : "填写游戏账号用于识别"}
                </small>
              </div>
            </fieldset>
          ))}
        </div>
        <p className="manage-form-note">
          在图片素材上传队标和选手照片。修改名称、名单和照片进入待播，PGM
          保留已切入内容。
        </p>
      </div>
      <Footer {...actions} kind="战队" />
    </>
  );
}
