# cbbcc7c 节目、画布、五席与记录事务独立验收

**隔离功能与播出保护检查通过；最终设计仍有一项小播放器可读性问题，Windows 与真实音画未完成。暂不能据此宣布整体交付或发布完成。** 两轮独立浏览器为 63 + 61 = 124 项通过、0 项最终失败，页面异常 0；另外首次无快照输出通过 3 个行为断言。完整单测 302 项：294 通过、3 环境/平台失败、5 跳过。构建通过。

受测实现固定为 `new@cbbcc7cb308bb1af20f4f7b4e12c2b417c6aea5f`。开始时本地/远端一致、工作区干净；main 仍为 `7f2f39981b7e91d33d6d32e47d1c2003f2c81296`。完整重新读取 Library 任务书 `libfile_fa8f64dc18bc8191840dd744c317798c`（493 行、58822 字节、完整返回无后续页），并阅读节目/移动设计与实现交接。未发现适用 AGENTS / SKILL.md。结束核对 236 个实现文件的 SHA256 全部一致，实现差异为空，见 [源码守卫](evidence/sol-cbbcc7c/source-final.json)。

环境：2026-10-14，Linux、Node 24.19.0、系统 Chromium 154。使用真实独立 HTTP、WebSocket、ControlSeats、CAS/动作队列、持久保存和 React。每个服务有新的隔离测试目录、loopback 端口，禁用 LAN、自动连接、OBS 自启动和外网素材。引擎准备/设备状态/来源枚举是明确模拟，没有真实 OBS、驱动、推流或录制。节目截图使用浏览器显示底色，不是游戏或 OBS 合成画面。

## 第一轮：主流程、画布与移动恢复

[独立脚本](evidence/sol-cbbcc7c/browser.mjs) 基于此前 Sol 的独立断言更新受测 SHA 和证据位置，保留业务断言，实际重跑得到 [63 项结果](evidence/sol-cbbcc7c/browser.json)。没有使用 Astra 自审结果或历史截图作为本轮通过证据。

- 工作台在双主题、1366×768/736、1440×900/868、1920×1080/1048 下，PGM/PVW 保持 16:9，TAKE、音乐与安全带可达；窗口标题栏扣高是浏览器近似，真实 Windows DPI 未运行。
- 画布三栏、直接拖动、八个缩放方向、1px/Shift 10px、50% 缩放和 DPR=2 转换通过。负坐标至 -1920/-1080、尺寸至 3840×2160 保持；输入/弹层内快捷键不误发 TAKE。
- 保存仅待播、同场景再 TAKE、准备失败保留旧节目、CAS 保留本地输入、控制权转移禁用写入、上传后放弃仍保留素材、24 层/50 场景的 UI 与真实 HTTP 上限通过。
- 输出模式查看不改变目标；部分启动、恢复失败和未知状态有真实独立提示；RTMP 测试凭据不持久化；音乐默认暂停/静音/-18dB、停播换文件、播放/暂停/停止和托管保护通过。此处全部设备与音频回执为模拟，不能推导实际伴侣/观众接收。
- BP 手工准备不泄漏到节目；五个真实席位的任务、ACL、无权 TAKE、控制权转移、自定义预监、字幕待播和服务重启后失效席位禁用通过。

## 第二轮：十一节目、来源、事务与输入

使用新的 [节目/流程独立脚本](evidence/sol-cbbcc7c/programme-flow.mjs)，最终 [61 项结果](evidence/sol-cbbcc7c/programme-flow/results.json) 全部通过。

| 范围 | 实际检查 | 证据边界 |
| --- | --- | --- |
| 十一内置节目 | 每种实际 `/overlay` 在 1920×1080、1280×720、640×360；固定画布、不进入控制端加载/选框；深浅主题颜色、字体和尺寸一致 | 模拟引擎接受准备，正式状态/快照与页面来自真实服务 |
| 透明与实况保护 | 三尺寸团战每个像素 alpha=0；实况五行纯黑，1920 下左边 496、宽 928、高 251，按比例保持 | 没有游戏捕获、OCR 或 Windows 实际遮挡像素验证 |
| 赛前与 BP | 未设置、已结束、进行三状态；长名、缺图、GAME 5 四局历史、稳定队伍换边 | 普通 BP/全局/本队规则及完整多人自动归属另由正式脚本与单测覆盖 |
| 首发/赛后/数据 | 十个首发位置不消失，长名两行；空统计稳定占位；焦点只待播，明确 TAKE 后更换；冻结报告保持 | 空 live 的正常 TAKE 正确被拒绝；随后显式注入“已播但无信号”合成快照验证降级排版，不把它写成合法空数据切入 |
| 曲线与赛程 | 穿零分段，60 秒中断留空，空样本；9 场、第三页、按日/后续筛选；新页待播前不改变 PGM | 无预测、自动轮播或真实客户端采样结论 |
| custom 换源 | 图片→窗口→共享 OBS→图片，层数、ID、名称、负坐标/超尺寸不变；三种 fit 的实际图片样式；保存待播与再 TAKE | 来源选择为合成列表；窗口/共享来源不在输出 DOM 伪造运动视频 |
| custom 引用 | PGM 和串联单删除阻塞、真实 API 拒绝；共享引用说明、输入从枚举中移除后提示；备用场景删除保留上传文件 | 共享 OBS 输入保留/清理/音频语义由真实合成逻辑的模拟 ObsClient 单测核验，没有实机 OBS 输入测试 |
| 记录事务 | 同回合同步两 click、真实鼠标双击及切分类各仅一条；服务已实际提交后丢 HTTP 回执，同 ID/版本/内容重试不重复；已不确定再遭 409 仍锁住核对；首次明确拒绝可重新提交；换比赛阻塞旧请求；人工结束核对不写入 | 不承诺跨服务重启永久去重；本轮没有用删除缓存或重生成请求 ID 掩盖未知结果 |
| 五席移动 | 390×844、320×568、844×390 不横溢出；前台和 persisted pageshow 重新只读验证，待验证禁用且保留搜索；关闭真实控制 WS 后恢复输入草稿；缩短视口保留字幕；服务端权限拒绝 | 前台/bfcache 是脚本事件触发，非真实手机生命周期；390×440 是缩短视口，非物理 IME；未开放 LAN |

另执行 [首次无快照输出检查](evidence/sol-cbbcc7c/output-bootstrap.mjs)：同时让首次 HTTP 状态失败、关闭 WS，实际节目根为空，所有像素透明，没有工作站品牌/连接界面，也没有申请席位或业务 POST。见 [结果](evidence/sol-cbbcc7c/output-bootstrap.json)。

## P2：小播放器辅助文字仍偏小

人工查看本轮 [640 宽实况](evidence/sol-cbbcc7c/programme-flow/live-640.png) 和 [640 宽 BP](evidence/sol-cbbcc7c/programme-flow/draft-640.png)，主比分和英雄身份可辨，十人辅助统计、BP 预选/锁定说明及历史局标偏小。进一步实际测量，而不是根据源码猜字号，见 [测量脚本](evidence/sol-cbbcc7c/readability.mjs) 和 [结果](evidence/sol-cbbcc7c/readability.json)。

| 文字 | 1920×1080 | 1280×720 | 640×360 |
| --- | ---: | ---: | ---: |
| live 姓名 | 17.47px | 11.65px | 5.82px |
| live CS/KDA | 16.90px | 11.26px | 5.63px |
| BP 锁定/预选状态 | 13.44px | 8.96px | 4.48px |
| BP 历史局标 | 16.32px | 10.88px | 5.44px |

复现：从受测 SHA 运行上述测量脚本，或打开本轮两张 640 截图按原尺寸查看。任务书要求缩小观看下校准可读性，并建议节目辅助文字约 20–24px；建议字级不是服务端硬约束，因此没有把通过的状态断言改成失败，但人工设计评审仍将此项列为 P2 待优化。

下一轮 Astra 范围：只在 `live-bottom.css` 的既有纯黑矩形内重新评估姓名/补刀/KDA 数字层级、列宽与短格式，以及 `program-scenes.css` 的 BP 状态/历史字级和密度。保持五行、摄像头、小地图和遮挡契约；不得移动/缩放黑底掩模来腾空间。修复后提供实际 1080p/720p/640 小播放器对比，Sol 独立复查。真实游戏合成需要 Windows 补验。

## 正式脚本与全套测试

全部命令先检查了副作用；下面都是本轮实际运行结果，原正式脚本没有修改。[运行清单](evidence/sol-cbbcc7c/formal-runs.json)。

| 命令 | 本轮结果 |
| --- | --- |
| `npm run build` | 通过，1695 模块；主包约 535 kB，保留 >500 kB 提示。[日志](evidence/sol-cbbcc7c/build.txt) |
| `npm test` | 294 通过、3 失败、5 跳过；总 302。[完整日志](evidence/sol-cbbcc7c/tests.txt) |
| `verify:production` | 16 组通过，记录/数据表真实新定位已走通。[报告](evidence/sol-cbbcc7c/production-report.json) |
| `verify:ui-theme` | 7 组通过，包括全部十一种场景的后代与伪元素。[报告](evidence/sol-cbbcc7c/theme-report.json) |
| `verify:broadcast-controls` | 7 组通过，173 英雄全部解码；新 `cover` 图像比例断言通过。[报告](evidence/sol-cbbcc7c/broadcast-report.json) |
| `verify:frontend-safety` | 15 组通过，真实 HTTP 的草稿/席位及低高度 TAKE 命中。[报告](evidence/sol-cbbcc7c/safety-report.json) |
| 原生可见性浏览器分支 | 11 组通过，新编辑器关闭定位与模拟 IPC 的释放/恢复通过。[报告](evidence/sol-cbbcc7c/native-browser-report.json) |
| `verify:custom-scenes` | 未运行：原脚本直接启动真实 OBS 与 Windows 窗口捕获，超出本阶段授权 |
| 原生 `--desktop` / `verify:release` | 未运行：需要 Windows/Electron/真实 OBS 或设备，当前仅 Linux |

三项完整单测失败精确位置：

- `server/virtual-audio-driver.test.ts:35` 与 `:50` 的官方归档/签名安装器模拟，因当前 `runtime/vbcable/VBCABLE_Driver_Pack45.zip` 不存在报 ENOENT。
- `server/virtual-camera-driver.test.ts:8` 在 Linux 调用注册复用入口，得到“虚拟摄像头需要 Windows x64”。

没有下载或安装驱动来消除这些环境失败，没有改断言或增加跳过；Windows 打包环境需提供经现有脚本校验的官方归档，并重新执行这些模拟测试。Windows 安装、驱动实际准备和实听仍各自需要其环境与授权。

新验收脚本首两次运行的测试入口问题也保留：未等倒计时秒刷新、`select-player` 字段名误用、旧画布节点定位、缺失串联单 status/seconds、已结束系列仍请求下一局，以及误关了监视 WS 而非控制 WS。修正的是测试输入/定位，业务断言保留；首跑原始结果见 [第一次](evidence/sol-cbbcc7c/programme-flow-first-pass/results.json)、[第二次](evidence/sol-cbbcc7c/programme-flow-second-pass/results.json)。最终结果没有隐藏这些记录，也没有将正确服务端拒绝算成产品缺陷。

## 截图、发布与未运行项

本次重新采集选取 **28 张 Sol 合成截图**，已经保存 Library，`library_file_id = libfile_b38ff1bf40708191a7d6befe628103dc`；不是 Astra 的旧自审包。包内含中文说明及每张 SHA256，见 [本地截图包](evidence/sol-cbbcc7c/RiftCast-前端重构-Sol独立验收-28张合成截图-cbbcc7c.zip)、[清单](evidence/sol-cbbcc7c/screenshot-package.json)、[保存结果](evidence/sol-cbbcc7c/library-save.json)。

只读核对的 Windows 现状与可执行打包交接见 [Windows 后续交接](前端重构Windows打包交接-cbbcc7c.md)。本轮只增加文档、证据和验收脚本；没有改实现、main、版本、tag/release、账单或 Actions 设置。

仍未运行：Windows 标题栏/DPI/HWND/最小化、安装和便携包、真实手机键盘/bfcache、LoL/LCU/OCR 实际信号、OBS 窗口/共享输入真实合成、最终 Program 音轨1、VB-CABLE/虚拟摄像头、伴侣与观众端。模拟电平、枚举、准备与截图不能代替这些结论。后续先处理 P2 视觉项与 Windows 验收脚本的实际入口，再完成新的 Windows 产物与独立验证；不复用旧包哈希作为新版本证明。
