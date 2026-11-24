# RiftCast 2.0 设计系统 ·「演播室暗场」

2.0.0 是一次视觉品质版本：功能、布局结构、键盘流程和数据契约保持 1.7.1 的行为，界面材质、色彩、字体、品牌与美术资源全部重做。本文是控制台界面的设计规范，后续页面改动以此为准。

## 设计意图

RiftCast 是赛事导播的控制室。控制室界面有三条原则：

1. **信号色只属于信号。** 红色代表 PGM（正在播出），绿色代表 PVW（预监）。这两种颜色在界面里只表达节目总线，其他元素使用别的颜色。
2. **暗场、低眩光、层次靠材质。** 深曜石蓝的四级表面，细发丝高光和柔和投影区分层级，大面积保持安静，操作者的注意力留给监视器。
3. **一个品牌，两处出现。** 黄铜金是品牌色，用于标志、标题装饰线、收藏星标和关键标签；弧光青是交互色，用于可点击、选中和焦点。节目包装「裂隙曜金」沿用同一套色彩与裂隙母题。

## 色彩令牌

令牌定义在 `src/theme-2/tokens.css`，作用域为 `.app-shell`、`.remote-workbench`、`.remote-page`、`.loading-screen`。节目画布（`.broadcast-container` 等媒体根）保留各自风格包的色彩，控制台令牌不进入 `/overlay`。

| 令牌 | 深色「暗场」 | 浅色「日光」 | 用途 |
| --- | --- | --- | --- |
| `--ui-bg` | `#070b12` | `#eef1f5` | 应用底、输入框底 |
| `--ui-surface` | `#0e1521` | `#ffffff` | 面板 |
| `--ui-raised` | `#172131` | `#f3f5f9` | 面板内的卡片、按钮 |
| `--ui-hover` | `#1c2940` | `#e7edf5` | 悬停 |
| `--ui-border` | `#243145` | `#cfd7e2` | 分隔线、面板描边 |
| `--ui-control-border` | `#56677f` | `#7f8fa6` | 可操作控件描边（对比度不低于 3:1） |
| `--ui-text` / `--ui-muted` | `#eef2f8` / `#9fb0c6` | `#0f1b2d` / `#4d5d73` | 正文 / 次要文字 |
| `--ui-accent` / `--ui-on-accent` | `#5cc8f5` / `#04121c` | `#0a67a3` / `#ffffff` | 交互强调、主按钮 |
| `--ui-selected` / `--ui-selection-border` | `#12304a` / `#4fb3e0` | `#dcebf7` / `#2f85c0` | 选中态 |
| `--ui-pgm` / `--ui-pvw` | `#ff6b78` / `#3fdc97` | `#c01f37` / `#0a704b` | PGM / PVW 文字色 |
| `--rc-pgm-solid` / `--rc-pvw-solid` | `#d7263d` / `#0c8452` | `#c01f37` / `#0a704b` | Tally 实底（白字） |
| `--ui-error` / `--ui-warning` / `--ui-info` / `--ui-success` | `#ff8a94` / `#ffb84d` / `#5cc8f5` / `#58dba0` | `#b3212f` / `#8a5600` / `#0a67a3` / `#0a704b` | 状态文字 |
| `--ui-*-bg`（danger、warning、info、success） | 见 tokens.css | 见 tokens.css | 状态底色 |
| `--rc-gold` / `--rc-gold-bright` / `--rc-gold-dim` / `--rc-gold-line` | `#d4b676` 系 | `#7d5f17` 系 | 品牌金：装饰线、图标、星标 |
| `--rc-side-blue` / `--rc-side-red` | `#5aa9ff` / `#ff7a7a` | `#1565b8` / `#b83240` | 蓝方 / 红方身份色 |

规则：

- 控制台样式里的颜色一律引用令牌。需要过渡色时使用 `color-mix(in srgb, var(--token) N%, var(--token))`。
- 正文与次要文字在所在表面上的对比度不低于 4.5:1，两套主题都要满足。
- 警告使用琥珀色 `--ui-warning`，与品牌金区分：品牌金只做装饰与标识，状态信息使用状态色。
- 蓝方、红方身份色只用于队伍归属。红方色与 PGM 红在同一视野出现时，PGM 使用实底 Tally。

## 字体

| 角色 | 字体 | 令牌 |
| --- | --- | --- |
| 界面正文 | Inter Variable，中文回退 HarmonyOS Sans SC、MiSans、PingFang SC、Microsoft YaHei UI | `--rc-font-ui` |
| 数字与标签 | Barlow Condensed 500/600/700 | `--rc-font-display` |

Barlow Condensed 只用于拉丁字母与数字：计时、比分、PGM/PVW 标签、快捷键、版本号、音量读数。含中文的文字使用界面正文字体。字号下限 12px，数字使用等宽数字（tabular-nums）。两种字体随应用离线打包（SIL OFL 1.1）。

## 形状、层次与动效

- 圆角：面板 `--rc-radius-panel` 10px，控件 `--rc-radius-control` 7px，标签 `--rc-radius-chip` 5px。
- 面板：`background: var(--rc-panel)`，1px `--ui-border` 描边，`box-shadow: var(--rc-inset), var(--rc-shadow-1)`。弹层与对话框使用 `--rc-shadow-2`。
- 页面标题下方有一条 28px 的品牌金短线；面板标题图标使用品牌金。
- 动效 120–200ms，缓动 `--rc-ease`，只用于颜色、阴影和 1px 位移；遵循 `prefers-reduced-motion`。
- 焦点：2px `--ui-focus` 描边加 5px 弧光外晕，所有可聚焦元素一致。

## 组件

| 组件 | 规范 |
| --- | --- |
| 按钮 `.button` | 次要：`--ui-raised` 微渐变加控件描边；主要 `.primary`：弧光青实底深色字；危险 `.danger`：`--ui-danger-bg` 底加错误色字 |
| TAKE `.take-button` | 界面里唯一的大面积红色实底按钮，带高光与外晕；禁用态降低饱和度并保持文字可读 |
| Tally `.bus-tag` | 实底白字，Barlow Condensed，PGM 红、PVW 绿 |
| 标签页 `.task-tabs` | 选中：`--ui-selected` 底、强调色字、底部 2px 强调线 |
| 输入控件 | `--ui-bg` 底（浅色为白），控件描边；聚焦时强调色描边加 3px 外晕 |
| 提示条 `.toast` | 四种状态使用对应 `--ui-*-bg` 底与状态色字 |
| 监视器 `.monitor-pane` | Tally 色描边与外晕，标题条从 Tally 色过渡到面板色 |

## 文件结构

```text
src/theme-2/tokens.css   令牌（深色、浅色）
src/theme-2/base.css     字体、滚动条、焦点、按钮、输入、面板、标签页、Tally、提示、对话框
src/theme-2/shell.css    导航栏、顶栏、底部安全带、启动屏
src/theme-2/studio.css   导播台：监视器、切入、场景库、任务栏
src/theme-2/pages.css    页面公共层级、空状态、对话框
src/theme-2/draft-data.css、management.css、settings-pages.css、production-panels.css、remote.css   各业务页面
brand/                   品牌矢量源文件与栅格母版
```

`theme-2` 在 `src/main.tsx` 中排在全部旧样式之后。旧样式表保留布局与尺寸职责；其中写死的颜色逐步替换为令牌。

## 边界

- 节目画布及其后代、OBS 预览、风格包贴图、`/overlay` 输出保持各自的色彩与字体，控制台主题切换不影响它们（`npm run verify:ui-theme` 逐元素校验）。
- 布局尺寸、可点击区域（不小于 32px）、首屏可见性与键盘流程由 `scripts/verify-operator-ui-150.mjs` 校验，视觉改动需保持通过。
