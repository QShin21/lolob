import { useId, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  LoaderCircle,
  X,
  Zap,
} from "lucide-react";
import type { Notice, Scene, StateContext } from "../../shared/types";
import { takeBlockReason } from "../../shared/presentation";

export function Notification({
  notice,
  dismiss,
}: {
  notice: Notice | null;
  dismiss: () => void;
}) {
  if (!notice) return null;
  const Icon = {
    success: CheckCircle2,
    info: Info,
    warning: AlertTriangle,
    error: XCircle,
    loading: LoaderCircle,
  }[notice.kind];
  return (
    <div
      className={`toast notice-${notice.kind}`}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-live={notice.kind === "error" ? "assertive" : "polite"}
    >
      <Icon size={20} />
      <span>{notice.message}</span>
      <button aria-label="关闭通知" onClick={dismiss}>
        <X size={17} />
      </button>
    </div>
  );
}

export function TakeControl({
  state,
  send,
  seat,
  connected,
  compact = false,
  scene,
}: Pick<StateContext, "state" | "send" | "seat" | "connected"> & {
  compact?: boolean;
  scene?: Scene;
}) {
  const [busy, setBusy] = useState(false),
    active = useRef(false),
    reasonId = useId();
  const reason = takeBlockReason(state, seat, connected),
    key = state.production?.hotkeys.take || "Control+Enter";
  return (
    <div className="take-control">
      <button
        className={`take-button ${compact ? "compact" : ""}`}
        disabled={busy || !!reason}
        aria-describedby={reason ? reasonId : undefined}
        title={reason || `切入${scene ? "此场景" : "当前预监"}`}
        onClick={async () => {
          if (active.current) return;
          active.current = true;
          setBusy(true);
          try {
            await send({ type: "take", ...(scene ? { scene } : {}) });
          } catch {
            /* central notification */
          } finally {
            active.current = false;
            setBusy(false);
          }
        }}
      >
        <Zap size={16} />
        {busy ? "提交中…" : "切入节目"}
        {!scene && <kbd>{key.replace("Control", "Ctrl")}</kbd>}
      </button>
      {reason && <small id={reasonId}>{reason}</small>}
    </div>
  );
}

export function TaskTabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: readonly { id: T; label: string }[];
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
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
export function SaveBar({
  dirty,
  busy,
  onSave,
  onDiscard,
  children,
}: {
  dirty: boolean;
  busy?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="save-bar" role="status">
      <span>
        {dirty ? "本地有未保存修改" : "与待播配置一致"}
        {children}
      </span>
      <button className="button" disabled={!dirty || busy} onClick={onDiscard}>
        放弃修改
      </button>
      <button
        className="button primary"
        disabled={!dirty || busy}
        onClick={onSave}
      >
        {busy ? "保存中…" : "保存到待播"}
      </button>
    </div>
  );
}
