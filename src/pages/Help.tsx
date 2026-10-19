import { useState } from "react";
import { ArrowRight, BookOpen, Search } from "lucide-react";
import type { BroadcastState } from "../../shared/types";
import type { WorkflowPage } from "../components/DirectorWorkflow";
import type { SettingsSection } from "./Settings";
import { sceneInfo } from "../lib";
import { version } from "../../package.json";
import "../components/domain-workspace.css";
import "./help-workspace.css";

type Guide = {
  id: string;
  group: string;
  title: string;
  summary: string;
  steps: string[];
  page: WorkflowPage;
  target?: SettingsSection;
  action: string;
};
const guides: Guide[] = [
  {
    id: "prepare",
    group: "准备",
    title: "准备一场比赛",
    summary: "战队、名单、赛程与素材",
    steps: [
      "在赛事与素材维护战队名称、选手播出名和游戏账号；队伍与选手身份保留在资料中。",
      "保存赛程后核对双方、比分与已有系列赛记录，再按住载入比赛。载入只更新准备区。",
      "在连接与输出检查数据、画面和声音。返回导播台选择 PVW，核对后 TAKE。",
    ],
    page: "manage",
    action: "打开赛事与素材",
  },
  {
    id: "bp",
    group: "准备",
    title: "BP 与客户端不一致",
    summary: "人工接管、归属与恢复同步",
    steps: [
      "在 BP 的接管与客户端差异中比较人工内容和最新客户端样本。手工选择英雄与锁定分路归属是不同动作。",
      "保存和恢复自动同步后的变更进入待播；正在播出的名单继续保持，正常同局统计仍会更新。",
      "核对待播差异后再次 TAKE；同一个场景也可以重新切入。全局禁选和换边历史按战队身份核对。",
    ],
    page: "draft",
    action: "打开 BP 与阵容",
  },
  {
    id: "data",
    group: "来源",
    title: "数据为空或已经过期",
    summary: "KDA、补刀、金币与 OCR",
    steps: [
      "先在数据页检查每位选手的来源、采样时间与有效期。累计经济、当前金币和装备目录价值不能相互替代。",
      "局内 API 未提供的字段保持为空。需要 OCR 时，在来源与校准载入真实游戏采样图，再调整区域；不要拿 HUD 排版示意当采样图。",
      "人工经济校准立即更新统计和经济曲线，有效期 10 秒；OCR 统计与经济分别按接口有效期显示。",
    ],
    page: "data",
    action: "打开实时数据",
  },
  {
    id: "preview",
    group: "来源",
    title: "预监画面不动或被挡住",
    summary: "实际合成、快照与 HUD 排版",
    steps: [
      "先看监视器来源标签：原生动态显示、周期快照、HUD 排版示意各有用途；普通浏览器快照不是高帧率视频。",
      "检查画面页的 OBS 状态与游戏捕获来源。应用窗口或已有 OBS 来源必须在真实合成里核对。",
      "弹窗、编辑器、滚动遮挡或最小化时，原生显示应释放；恢复完整可见区域后重新显示。操作页隐藏不应停止正式节目和音轨。",
    ],
    page: "settings",
    target: "video",
    action: "打开画面检查",
  },
  {
    id: "take",
    group: "播出",
    title: "保存了，节目还没更新",
    summary: "待播、TAKE、应用、人工核对",
    steps: [
      "保存成功表示资料已到待播层；选择场景只改变 PVW。PGM 继续使用已播身份和配置。",
      "按 TAKE 后先看请求回执，再看 OBS 是否应用。应用失败时保留此前节目，修正来源后核对并重试。",
      "在节目画面核对本次版本，再人工确认。OBS 应用不代表平台或观众已接收。返回比赛和紧急动作不顺带发布其他待播编辑。",
    ],
    page: "studio",
    action: "打开导播台核对",
  },
  {
    id: "companion",
    group: "播出",
    title: "伴侣有画面，却没有声音",
    summary: "Program 画面与最终音轨分别检查",
    steps: [
      "画面来自 Program → OBS Virtual Camera；伴侣摄像头选择 OBS Virtual Camera。PVW 不是正式输出。",
      "声音来自 Program 最终音轨 1，48 kHz 双声道 → CABLE Input；伴侣接收设备选择 CABLE Output。检查桥接、静音与真实信号是否新鲜。",
      "设备安装、可用、就绪、活动和托管是不同状态。RiftCast 送出后，在伴侣里人工检查音画并开播；系统不能代替外部账号与平台确认。",
    ],
    page: "settings",
    target: "output",
    action: "打开输出信号路径",
  },
  {
    id: "music",
    group: "播出",
    title: "音乐更换或播放受阻",
    summary: "单个受管理来源与停播窗口",
    steps: [
      "支持 MP3、WAV、OGG、FLAC，单文件上限 32 MB。新文件默认暂停、静音、−18 dB。",
      "更换文件前检查 RTMP、伴侣送出和录制的独立活动状态，按界面要求进入停播窗口。",
      "播放影响正式 Program 混音；暂停与停止不同。回放返回比赛后应恢复此前游戏和解说静音，音乐继续走最终节目混音。",
    ],
    page: "settings",
    target: "audio",
    action: "打开声音与音乐",
  },
  {
    id: "conflict",
    group: "恢复",
    title: "版本冲突，草稿还在",
    summary: "核对服务器资料后再保存",
    steps: [
      "保留本地输入，不刷新或重复创建对象。打开“待播版本有更新”比较草稿与最新服务器资料。",
      "确认哪些改动应保留后，明确采用当前版本重新保存。服务端仍校验版本、席位和请求。",
      "如果请求超时，先核对实际结果与状态；不要把不确定结果当作失败后连续重复 TAKE 或结算。",
    ],
    page: "manage",
    action: "返回资料与草稿",
  },
  {
    id: "seat",
    group: "恢复",
    title: "席位失效或没有切入权限",
    summary: "验证身份与当前节目控制者",
    steps: [
      "主导播角色不等于当前控制者。页面会标明持有控制权的人；资料、字幕、回放和只读席保留各自任务。",
      "服务重启、邀请失效或席位撤销后，先通过恢复入口重新验证。原有输入在当前会话保留。",
      "在协作页按实际授权发放席位。不要将邀请或控制 token 放入截图、公开链接和日志。",
    ],
    page: "settings",
    target: "collaboration",
    action: "打开协作与席位",
  },
  {
    id: "restore",
    group: "恢复",
    title: "停止后仍显示托管或异常",
    summary: "音频设备与恢复记录",
    steps: [
      "先在直播伴侣结束外部直播，再在 RiftCast 停止伴侣音画。RTMP 与本地录制分别停止。",
      "“待恢复”表示仍有设备或 OBS 设置需恢复，不代表一切已停止并还原。查看输出诊断中的具体对象与失败说明。",
      "保留恢复记录并使用现有恢复入口；不要通过删除 runtime 或 recovery 文件消除提示。设备准备可能需要管理员授权或重启，查看实际提示后决定。",
    ],
    page: "settings",
    target: "output",
    action: "打开输出与恢复",
  },
  {
    id: "finish",
    group: "收尾",
    title: "结束本局并进入下一局",
    summary: "胜方、终局报告、录像与修订",
    steps: [
      "确认具体战队获胜。终局样本不完整时先等待；接口确实不可用时填写裁判理由，采用现有记录，缺失字段仍保留。",
      "准备赛后报告，核对节目版本，再检查归属到本系列赛、局号与尝试的录像文件。数据归档不等同于视频已录制。",
      "下一局保留系列赛比分；重赛作废当前尝试并保留记录；新系列赛从 BP 规则明确开启；载入另一场比赛在赛事管理中执行。",
    ],
    page: "wrap",
    action: "打开赛后收尾",
  },
  {
    id: "startup",
    group: "恢复",
    title: "应用启动与本机日志",
    summary: "安装版、便携版与源码入口",
    steps: [
      "安装版与便携版直接启动 RiftCast 应用；源码开发使用仓库中的启动脚本，不能要求安装版用户另装 Node.js 或 OBS。",
      "应用内版本来自当前包信息。桌面“帮助”菜单提供启动日志；启动失败时保留日志和原数据，按具体原因处理。",
      "安装版默认将数据留在用户目录；环境覆盖会改变实际路径。本页面没有读取实际解析路径，不能把示例目录当作当前数据位置。升级、导入或迁移前核对真实运行目录。",
    ],
    page: "settings",
    target: "diagnostics",
    action: "打开连接诊断",
  },
];
const keyLabels: Record<string, string> = {
  take: "切入节目",
  live: "回到比赛",
  analysis: "关闭分析",
  feeds: "关闭选手画面",
  emergency: "技术暂停",
  undo: "撤回切换",
};

export function Help({
  state,
  onNavigate,
}: {
  state: BroadcastState;
  onNavigate: (page: WorkflowPage, section?: SettingsSection) => void;
}) {
  const [selected, setSelected] = useState("take"),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const filtered = guides.filter((g) =>
    `${g.title} ${g.summary} ${g.steps.join(" ")}`.includes(query.trim()),
  );
  const guide = filtered.find((g) => g.id === selected) ?? filtered[0];
  const shortcuts = selected === "keys" && !query;
  return (
    <section
      className="domain-workspace guide-workbench"
      aria-label="使用指南工作面"
    >
      <header className="domain-heading">
        <div>
          <h1>使用指南</h1>
          <p>按当前任务和故障找到下一步</p>
        </div>
        <span>
          RiftCast {version} ·{" "}
          {window.riftcastDesktop ? "桌面窗口" : "浏览器窗口"} ·{" "}
          {"本地实况"}
        </span>
      </header>
      <div className="guide-stage">
        <aside className="guide-directory">
          <label className="domain-search">
            <Search size={16} />
            <input
              aria-label="搜索使用指南"
              placeholder="如：没声音、草稿、录像"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <nav className="domain-scroll" aria-label="帮助任务">
            {["准备", "来源", "播出", "恢复", "收尾"].map((group) => {
              const rows = filtered.filter((g) => g.group === group);
              return (
                !!rows.length && (
                  <div key={group}>
                    <h2>{group}</h2>
                    {rows.map((g) => (
                      <button
                        key={g.id}
                        aria-current={
                          !shortcuts && guide?.id === g.id ? "page" : undefined
                        }
                        onClick={() => setSelected(g.id)}
                      >
                        <strong>{g.title}</strong>
                        <small>{g.summary}</small>
                      </button>
                    ))}
                  </div>
                )
              );
            })}
            {!filtered.length && (
              <p className="guide-no-results">没有匹配问题，请换一个关键词。</p>
            )}
          </nav>
          <button
            className="button"
            onClick={() => {
              setQuery("");
              setSelected("keys");
            }}
          >
            当前快捷键
          </button>
        </aside>
        <article className="guide-article domain-scroll">
          {shortcuts ? (
            <>
              <header>
                <BookOpen size={24} />
                <h2>当前快捷键</h2>
                <p>以下读取实际配置与内置场景键位。自定义场景不编造快捷键。</p>
              </header>
              <h3>全局播控</h3>
              <dl className="guide-keys">
                {Object.entries(state.production?.hotkeys ?? {}).map(
                  ([key, value]) => (
                    <div key={key}>
                      <dt>{keyLabels[key] ?? key}</dt>
                      <dd>
                        <kbd>{value.replace("Control", "Ctrl")}</kbd>
                      </dd>
                    </div>
                  ),
                )}
              </dl>
              <h3>导播台预监</h3>
              <dl className="guide-keys">
                {Object.values(sceneInfo).map((s) => (
                  <div key={s.name}>
                    <dt>{s.name}</dt>
                    <dd>
                      <kbd>{s.shortcut}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
              <p>
                导播台 Enter
                切入当前预监。输入框、下拉框、编辑器、弹窗和输入法组合输入期间暂停播控快捷键，长按不会重复切入。
              </p>
            </>
          ) : guide ? (
            <>
              <header>
                <span>{guide.group}</span>
                <h2>{guide.title}</h2>
                <p>{guide.summary}</p>
              </header>
              <ol className="guide-steps">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <button
                className="button primary"
                onClick={() => onNavigate(guide.page, guide.target)}
              >
                {guide.action}
                <ArrowRight size={16} />
              </button>
              <section className="guide-live-facts">
                <h3>工作站当前事实</h3>
                <dl className="domain-facts">
                  <div>
                    <dt>客户端 BP</dt>
                    <dd>
                      {state.connections.lcu.detail ||
                        state.connections.lcu.status}
                    </dd>
                  </div>
                  <div>
                    <dt>局内统计</dt>
                    <dd>
                      {state.connections.live.detail ||
                        state.connections.live.status}
                    </dd>
                  </div>
                  <div>
                    <dt>OBS</dt>
                    <dd>
                      {state.connections.obs.detail ||
                        state.connections.obs.status}
                    </dd>
                  </div>
                  <div>
                    <dt>节目控制者</dt>
                    <dd>{state.production?.control?.name ?? "尚未确认"}</dd>
                  </div>
                  <div>
                    <dt>切入回执</dt>
                    <dd>
                      {state.production?.application?.detail ??
                        "尚无本次应用回执"}
                    </dd>
                  </div>
                </dl>
              </section>
              {guide.id === "startup" && window.riftcastDesktop && (
                <button
                  className="button"
                  onClick={() => {
                    setError("");
                    void window
                      .riftcastDesktop!.openLogs()
                      .catch((e) =>
                        setError(
                          e instanceof Error
                            ? e.message
                            : "未能打开日志，请从桌面帮助菜单重试",
                        ),
                      );
                  }}
                >
                  打开本机启动日志
                </button>
              )}
            </>
          ) : (
            <div className="domain-empty">
              没有匹配的说明。清除搜索后可浏览全部任务。
            </div>
          )}
          {error && (
            <div className="domain-note error" role="alert">
              {error}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
