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
        <label>
          赛事 / 比赛名称
          <input
            maxLength={150}
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
          />
        </label>
        <label>
          开赛时间
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
          <label key={side}>
            {side === "blue" ? "蓝色方" : "红色方"}
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
        <label>
          赛制
          <select
            value={value.format}
            onChange={(e) => onChange({ ...value, format: e.target.value })}
          >
            {["BO1", "BO3", "BO5", "BO7"].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label>
          比赛状态
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
          <label key={side}>
            {side === "blue" ? "蓝色方比分" : "红色方比分"}
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
          <label>
            战队名称
            <input
              maxLength={80}
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
            />
          </label>
          <label>
            战队缩写
            <input
              maxLength={12}
              value={value.tag}
              onChange={(e) => onChange({ ...value, tag: e.target.value })}
            />
          </label>
          <label>
            战队标志
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
          <label>
            战队颜色
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
