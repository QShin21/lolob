import type { BroadcastState } from "../../shared/types";
import type { WorkflowPage } from "../components/DirectorWorkflow";
export function Help({
  state,
  onNavigate,
}: {
  state: BroadcastState;
  onNavigate: (page: WorkflowPage) => void;
}) {
  const tasks: [string, string, WorkflowPage][] = [
    ["准备赛事", "录入战队、选手与赛程，载入本场比赛。", "manage"],
    ["连接与检查", "连接游戏、画面和声音，完成试录与接收端回看。", "settings"],
    ["准备 BP", "核对来源、轮次、最终选手归属。", "draft"],
    ["核对并切入", "先看 PVW，再切入 PGM。OBS 应用后核对节目画面。", "studio"],
    [
      "局间与收尾",
      "确认胜方和终局样本，核对报告与录像，再进入下一局。",
      "wrap",
    ],
  ];
  return (
    <div className="help-grid">
      {tasks.map(([title, text, page]) => (
        <section className="panel help-card" key={page}>
          <h2>{title}</h2>
          <p>{text}</p>
          <button className="button" onClick={() => onNavigate(page)}>
            前往{title}
          </button>
        </section>
      ))}
      <section className="panel help-card">
        <h2>当前快捷键</h2>
        <dl>
          {Object.entries(state.production?.hotkeys ?? {}).map(
            ([key, value]) => (
              <div key={key}>
                <dt>
                  {
                    (
                      {
                        take: "切入节目",
                        live: "回到比赛",
                        analysis: "关闭分析",
                        feeds: "关闭选手画面",
                        emergency: "技术暂停",
                        undo: "撤回切换",
                      } as Record<string, string>
                    )[key]
                  }
                </dt>
                <dd>
                  <kbd>{value.replace("Control", "Ctrl")}</kbd>
                </dd>
              </div>
            ),
          )}
        </dl>
        <p>
          工作台 1–9 / T / G 选择预监，Enter 切入。输入文字时暂停响应快捷键。
        </p>
      </section>
      <section className="panel help-limits">
        <h2>常见状态与下一步</h2>
        <p>
          <b>等待 BP：</b>客户端已连接，进入选人后继续同步。<b>应用失败：</b>
          检查 OBS 与游戏来源，重新核对预监后切入。<b>版本冲突：</b>
          本地输入仍保留，请比较最新待播内容，再决定重新保存。
        </p>
        <p>
          <b>画面模式：</b>Electron 节目使用 OBS
          原生显示；普通浏览器监视采用低频快照。HUD
          排版示意用于检查文字与布局。录像暂停、跳转和倍速会影响游戏来源，播出期间由服务端保护。
        </p>
        <p>
          RiftCast 0.4.0 ·{" "}
          {state.mode === "demo" ? "当前演示数据" : "当前本地实况"} · OBS{" "}
          {state.connections.obs.status === "connected" ? "已连接" : "待连接"}
          。启动错误与日志入口可在桌面应用“帮助”菜单查看。
        </p>
        <button className="button" onClick={() => onNavigate("settings")}>
          打开连接诊断
        </button>
        {window.riftcastDesktop && (
          <button
            className="button"
            onClick={() => void window.riftcastDesktop!.openLogs()}
          >
            打开本机启动日志
          </button>
        )}
      </section>
    </div>
  );
}
