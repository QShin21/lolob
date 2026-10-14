import { useRef, useState } from "react";
import { Check } from "lucide-react";
import type { StateContext } from "../../shared/types";
import type { ProductionState } from "../../shared/production-types";
import { useConfigDraft } from "../useConfigDraft";
import { canPrepareDraft } from "./draft-permissions";

export function DraftRuleControls(ctx: StateContext) {
  const { state, send, notify } = ctx,
    p = state.production!;
  const form = useConfigDraft(
    { ...p.rules, exceptionText: p.rules.exceptionGames.join(", ") },
    p.configVersion,
  );
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [ack, setAck] = useState(0),
    active = useRef(false),
    allowed = canPrepareDraft(ctx);
  const parts = form.draft.exceptionText.trim()
    ? form.draft.exceptionText.split(/[,，]/).map((value) => value.trim())
    : [];
  const exceptionGames = parts.map(Number),
    invalid =
      exceptionGames.length > 99 ||
      parts.some((value) => !/^\d+$/.test(value)) ||
      exceptionGames.some(
        (value) => !Number.isInteger(value) || value < 1 || value > 99,
      ) ||
      new Set(exceptionGames).size !== exceptionGames.length;
  const conflict = form.dirty && form.baseVersion.current !== p.configVersion;
  const save = async () => {
    if (
      !allowed ||
      active.current ||
      conflict ||
      invalid ||
      !form.dirty ||
      (exceptionGames.length > 0 && !reason.trim())
    )
      return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      await send({
        type: "production",
        expectedConfigVersion: form.baseVersion.current,
        command: {
          op: "rules",
          rules: {
            mode: form.draft.mode,
            scope: form.draft.scope,
            remakeHistory: form.draft.remakeHistory,
            exceptionGames,
          },
          reason: reason || undefined,
        },
      });
      form.setDraft({
        ...form.draft,
        exceptionGames,
        exceptionText: exceptionGames.join(", "),
      });
      notify("BP 规则已保存到待播", "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "规则保存失败，已保留输入");
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="bp-rules" data-ack={ack}>
      <div className="bp-section-heading">
        <div>
          <h3>本场 BP 规则</h3>
          <p>第五局是否开放重复英雄由例外局配置决定，不自动放开。</p>
        </div>
      </div>
      <div className="bp-rule-fields">
        <label>
          规则
          <select
            disabled={!allowed || busy}
            value={form.draft.mode}
            onChange={(event) =>
              form.setDraft({
                ...form.draft,
                mode: event.target.value as ProductionState["rules"]["mode"],
              })
            }
          >
            <option value="standard">普通 BP</option>
            <option value="fearless">全局禁选</option>
            <option value="custom">自定义范围与例外局</option>
          </select>
        </label>
        <label>
          历史禁选范围
          <select
            disabled={!allowed || busy || form.draft.mode === "standard"}
            value={form.draft.scope}
            onChange={(event) =>
              form.setDraft({
                ...form.draft,
                scope: event.target.value as "all" | "team",
              })
            }
          >
            <option value="all">双方前局已用英雄</option>
            <option value="team">本队前局已用英雄</option>
          </select>
        </label>
        <label>
          重赛历史
          <select
            disabled={!allowed || busy}
            value={form.draft.remakeHistory}
            onChange={(event) =>
              form.setDraft({
                ...form.draft,
                remakeHistory: event.target.value as "discard" | "retain",
              })
            }
          >
            <option value="discard">作废并重新 BP</option>
            <option value="retain">保留本次阵容</option>
          </select>
        </label>
        <label>
          裁判例外局
          <input
            disabled={!allowed || busy}
            value={form.draft.exceptionText}
            placeholder="例如 5；多个局号以逗号分隔"
            onChange={(event) =>
              form.setDraft({
                ...form.draft,
                exceptionText: event.target.value,
              })
            }
          />
        </label>
        <label className="bp-rule-reason">
          例外或修订理由
          <input
            disabled={!allowed || busy}
            value={reason}
            placeholder="有例外局时必须填写"
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      </div>
      {invalid && (
        <p className="bp-error" role="alert">
          例外局须为 1–99 的不重复整数，以逗号分隔。
        </p>
      )}
      {conflict && (
        <div className="bp-conflict" role="status">
          <p>
            当前规则或其他待播配置已改变。服务器规则：
            {p.rules.mode === "standard"
              ? "普通 BP"
              : p.rules.scope === "all"
                ? "双方禁选"
                : "本队禁选"}
            ；例外局 {p.rules.exceptionGames.join("、") || "无"}。
          </p>
          <button
            className="bp-button"
            disabled={busy}
            onClick={() => {
              form.rebase();
              form.baseVersion.current = p.configVersion;
              setAck((value) => value + 1);
            }}
          >
            已核对，保留本地规则继续保存
          </button>
        </div>
      )}
      {error && (
        <p className="bp-error" role="alert">
          {error}
        </p>
      )}
      <div className="bp-save-row">
        <span>{form.dirty ? "本地规则未保存" : "与已保存待播规则一致"}</span>
        <button
          className="bp-button"
          disabled={!form.dirty || busy}
          onClick={() => {
            form.discard();
            setError("");
          }}
        >
          放弃规则修改
        </button>
        <button
          className="bp-button bp-primary"
          disabled={
            !allowed ||
            busy ||
            !form.dirty ||
            conflict ||
            invalid ||
            (exceptionGames.length > 0 && !reason.trim())
          }
          onClick={() => void save()}
        >
          <Check size={15} />
          {busy ? "保存中…" : "保存规则到待播"}
        </button>
      </div>
    </section>
  );
}
