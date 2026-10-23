# LeagueBroadcast 镜头、协作和集成对照

核对日期：2026-10-22。实现前基线为 `8223aa493bba716805571117cbb3b2422b16fb04`（RiftCast 1.3.0）。本表依据 [LeagueBroadcast Features](https://leaguebroadcast.gg/features)、[Pricing](https://leaguebroadcast.gg/pricing) 与当前代码。官网功能说明和商业服务分别记录。

| 官网功能 | 实现前 | 本轮实现及保留范围 | 代码证据 / 验证 |
|---|---|---|---|
| Cinematic editor / spline tracks / native jumps | 只有点选回放事件后的跟随镜头 | 新增关键帧抓取、时间/位置/旋转/FOV 编辑、平滑样条、线性和跳切、轨迹保存/删除/导入/导出、游戏内播放与停止 | `shared/cinematics.ts`、`server/cinematics.ts`、`CinematicWorkspace.tsx`；原生序列接口由模拟器验收 |
| In-game preview | 已有 OBS 当前节目/预监画面；共享同一游戏捕获 | 镜头编辑器直接显示当前 OBS 游戏合成预览与真实读回位置 | `ObsLivePreview.tsx`；游戏未连接时界面明确显示等待回放 |
| Simple team assets in cinematics | 队标/名称可用于二维场景 | 游戏世界中的队伍三维资产待实现；二维叠加保持现有实现 | 当前 Replay API 对接只涉及相机、序列与播放；无世界实体插入接口 |
| Champion assets in cinematics | 已有离线英雄图片、BP动画、选手分析图层 | 游戏世界中的英雄三维资产待实现 | 当前资源为二维原画与图标 |
| Directed / free / dolly controller | 无手柄接入；已有事件回放跟随 | 新增 Gamepad API：选手跟随、自由移动、固定高度/方向推进、速度与死区、俯仰反转 | `CinematicWorkspace.tsx`、`nudgeCamera()`；按键配置与运动数学验证通过，实体手柄待现场验证 |
| Editable controller hotkeys for every action | 无手柄映射 | 新增四轴、上升/下降、上一/下一选手、播放、停止、抓取关键帧独立可改编号 | 配置持久化、重复按钮拒绝、权限/隐藏页面停收验证通过 |
| Multi-view camera layouts in one client | 单客户端捕获供节目与预监共用 | 单客户端同时渲染多个原生游戏镜头待实现 | `ProductionDesk.tsx` 明确共享当前游戏捕获；普通多来源组合不能计作此项 |
| Caster mode / hotkeys | 六项可改工作台快捷键，窗口内响应 | 新增 24 个可命名解说按钮、动作/参数设置、拖拽/按键排序、每默认动作 3 个附加键、每按钮 3 个键；后台注册显式启用、占用回执、控制权核验和输入去重 | `CasterControls.tsx`、`electron/global-shortcuts.cjs`、`GlobalShortcutControls.tsx`、`useDirectorKeys.ts`；13 项单测、8 项 UI 检查、4 项 Windows 原生检查通过 |
| Event feed | 已实现事件时间线、筛选、回放事件索引 | 保留并接入新自动跟随 | `StudioDetails.tsx`、`GameReplayDirector.tsx`、`server/replay-director.ts` |
| Automatic camera control | 点选事件后跟随；常规镜头提示依赖人工操作 | 新增显式启用的新击杀/资源获取者自动跟随；初始化与时间跳转重建事件基线；手动操作或连接失败停用 | `CinematicEngine.tickAuto()`；模拟新事件/历史事件/手动接管测试 |
| Announcer / event-driven transitions | 工作台事件提醒；缺少事件驱动节目播报图层 | 本轮其他模块新增观众播报，详见总矩阵 | `ProductionDesk.tsx` 原提示；本表不重复计算其他代理验收 |
| Champion Detail | 已有选手焦点、装备、符文、KDA、等级、补刀、累计经济 | 现有图层覆盖主要选手详情展示，自动与聚合统计由总矩阵列明 | `PlayerBuild.tsx`、`BroadcastCanvas.tsx` |
| Twitch audience controls | 缺失 | 本轮 Twitch Helix/EventSub 和投票图形由官方清单代理补齐，真实账户待验 | `server/twitch-audience.ts`、`TwitchAudienceWorkspace.tsx`；详见总矩阵 |
| Remote caster and producer sessions | 已实现局域网操作席邀请、只读/资料/字幕/回放/主导播角色、接管与冲突检测 | 现有 LAN 协作可用；公网远程会话、解说音视频链路待独立服务 | `server/control-seats.ts`、`src/pages/Remote.tsx`、`server/security.ts` |
| Camera and mirror synchronisation | 同一服务通过 WebSocket 同步数据；同客户端节目/预监同步 | 跨游戏客户端镜头与时间镜像待实现 | `/ws` 同步 BroadcastState；未连接第二个游戏镜头端点 |
| Production webhooks / live data feed | 有内部 state/WS，缺少外部订阅契约与签名通知 | 本轮由集成模块新增，详见总矩阵 | `server/integrations.ts`、`shared/integrations.ts` |
| Cloud backup / sync | 本机持久化、赛事导出、风格包导入/导出 | 用户明确要求跳过，已移除本轮云备份/WebDAV 新增入口、路由和模块 | 本地导入/导出保持现有实现 |
| Organisation administration / roles | 当前制作的五类操作席和接管记录 | 当前制作角色已有；组织、多项目账户与集中管理待实现 | `ControlSeats` 使用内存席位，重启后重连 |
| SSO / audit | 生产操作审计保留最近 1000 条；无 SSO | 操作审计已有；OIDC/SAML 等统一身份待实现 | `server/production.ts: audit()`、`server/state.ts: applyAction()` |
| Multiple concurrent productions | 服务可配置不同 PORT / DATA_DIR；桌面单实例 | 统一多制作管理、资源隔离和并行桌面入口待实现 | `electron/main.cjs` single-instance lock；环境变量不等同多制作管理 |
| Dedicated / private infrastructure | 本机离线部署与独立 OBS 可用 | 私有云或专属集群需要部署目标与运维配置 | 当前代码为本地 Windows 制作环境 |
| SLA / named support / procurement / licence rights | 商业服务条目 | 由服务合同及支持团队落实 | 这些条目无可直接通过软件提交完成的实现判据 |

## 本轮镜头验证

- `node --import tsx --test server/cinematics.test.ts`：10 项通过，覆盖样条锚点、跨 360° 旋转、跳切、数据校验、持久化/版本冲突、断连/进程切换、原生序列写入核对、自动跟随、手柄参数和 HTTP 操作席权限。
- `npm run check`：通过。
- `scripts/verify-cinematics.mjs`：5 项浏览器验收通过。模拟 Replay API 供浏览器测试实际编辑器与服务类：抓取、保存、播放、停止、绑定保存、只读限制和断连界面。
- 1600 像素桌面图与 800 像素窄屏图均已逐张目视检查，页面无水平溢出。证据位于 `verification-output/release-1.4.0/cinematics/`。
- 本机 `/replay/game`、`/replay/render`、`/replay/playback`、`/replay/sequence` 四个只读探测均返回接口不可用。实体游戏画面、实体手柄、真实 OBS 输出尚未完成本轮验收；未修改游戏配置。

## 本轮后台快捷键验证

- `server/global-shortcuts.test.ts`：9 项通过，覆盖默认关闭、六项主绑定和多组附加键注册、被占用时整体回滚、席位/所有权校验、按键重复抑制、异步授权期间关闭、待执行回调失效、配置白名单、席位服务断连。
- `scripts/verify-global-shortcuts.mjs`：8 项浏览器验收通过，实际 React 组件与快捷键 Hook 配合隔离 preload 接口；验证 TAKE 单次执行、DOM 同键抑制、编辑文字时停收、关闭后窗口快捷键恢复、注册失败回执、修改持久化命令、控制权变化自动解除、自定义按钮分派、附加键执行和拖拽/按键重排持久化。1400 像素截图已目视检查，800 像素页面无水平溢出。
- `scripts/verify-global-shortcuts-native.cjs`：Electron 44.5.1 在 Windows 成功注册全部六项主绑定及扩展后的十项组合键、关闭后全部注销、已有占用保留并回执失败。4 项检查通过。此无窗口探针未注入键盘事件、未执行导播动作；探针以 `--no-sandbox` 运行以避开测试环境 Electron 二进制 ACL 限制，产品窗口仍启用原有 sandbox/contextIsolation。
- 快捷键证据位于 `verification-output/release-1.4.0/global-shortcuts/`；真实后台按键联动游戏/OBS 的现场验收待完成。组件与原生端持续核验当前主导播席位，后台开关只对本次运行有效。

## 原生接口依据

[Riot Replay API 文档](https://developer.riotgames.com/docs/lol#replay-api) 提供游戏进程、播放、渲染和关键帧序列读写端点。[Riot League Director 参考实现](https://github.com/RiotGames/leaguedirector/blob/main/leaguedirector/api.py) 使用 `time/value/blend` 关键帧、`cameraPosition`、`cameraRotation`、`fieldOfView` 字段，并通过空序列停止轨迹。本轮实现按这些接口生成原生序列，写入后读取游戏状态确认。

样条在本地按 20 Hz 生成位置关键帧，游戏执行线性插值；角度按最短方向解包，防止穿越 0°/360° 时整圈旋转。轨迹最长 10 分钟、最多 100 个编辑关键帧。当前场内位置与角度由 Replay API 抓取，播放依赖游戏已启用 Replay API。


## 风格编辑与动态文字补齐

| 官网项 | 实现前 | 本轮结果与证据 |
|---|---|---|
| F07 可视化编辑与对齐 | 清单编辑、颜色和固定槽位 | 语义目标选择、位置/缩放/透明度、画布/同类边缘吸附参考线、连续撤销/重做；`StyleEditor.tsx`、`server/style-editor.test.ts`。保留语义结构，未增加任意图层树。 |
| C12 动态占位符 | 固定组件文字 | 31 个实际文字目标、23 个白名单变量，覆盖赛程行、冻结赛后存档、英雄边栏、水晶分路/计时、Fearless、底部和全高 BP；`StyleText.tsx`、`shared/style-appearance.ts`。 |
| 风格包导出一致性 | 原有外观属性与 39 个目标 | 47 个外观目标，公开 JSON Schema 同步位置/透明度/文字字段，导出 ZIP 的 manifest 经 Ajv 校验。 |

- `server/style-editor.test.ts`：9 项通过，覆盖几何范围、吸附、历史恢复、文本白名单、持久化、新修订导出 Schema 和独立数据上下文。
- `scripts/verify-dynamic-text.mjs`：6 组通过，检查真实节目组件的赛程、赛后、英雄边栏、水晶/补丁、Fearless 与编辑器存档预览。5 张截图逐张目视检查；证据 `verification-output/dynamic-text/`。
- 模板支持纯文字和 `{{变量}}`；无表达式执行、HTML 注入或任意对象属性读取。每个模板最多 240 字符，缺少的数据字段显示为空；原始默认文字在未设置模板时保持。

## 解说按钮与快捷键补齐

- `CasterControls.tsx` 已接工作台详情、远程主导播任务区和设置中的镜头制作页。按钮支持 TAKE、返回直播、分析、画面、应急、撤回及指定预监场景、分析面板、公告、选手、赛后页。
- 每个动作沿用现有请求及权限；保存配置需要当前主导播所有权，执行时再次检查连接、席位和所有权。自定义选手按钮在目标消失后返回错误。
- `server/caster-controls.test.ts`：4 项通过，覆盖持久化、白名单、重复键拒绝、原子校验、所有权、分派和失效目标。与全局快捷键的 9 项测试合计 13 项。
- 六项默认主绑定保持原行为；重置解说配置清除自定义按钮和附加键。后台注册只对本次启动有效。

## 名单自动阵营与 Riot ID

- C09：显式开关默认关闭。已配置的两队中，双方各至少 3 个唯一完整 Riot ID 与客户端同侧匹配、客户端完整十人且各侧五人时修正待播阵营。重复账号、同队分布两侧、账号字段冲突或证据不足时保持原配置。
- 修正前冻结节目状态，比分按战队身份保留，失效的分路锁定和检查项清除，记录操作审计；节目在下一次 TAKE 后采用新阵营。回放复盘样本由采集入口排除。
- C22：队伍资料可粘贴 `名称#TAG`，自动整理分隔符两侧空格并使用 NFC 规范化；完整身份按归一后的完整 ID 匹配，旧无 `#` 账号保留精确匹配。Live Client 仅提供分段名称/TAG 时同样可识别；不同 TAG、冲突字段和重复配置不匹配。客户端未返回稳定身份时保留人工分路。
- 代码：`shared/player-identity.ts`、`server/player-identity.ts`、`shared/production.ts: applyIdentity()`、`server/adapters.ts`、`AutoSidesControls.tsx`、`ManagementEditors.tsx`。
- `server/player-identity.test.ts`：7 项通过；连同 adapter/season 回归合计 25 项通过，`npm run check` 通过。
- `scripts/verify-player-identity.mjs`：4 组浏览器验收通过，使用实际开关与 `TeamForm` 检查保存、账号粘贴、旧账号保留及失去控制权。1400/800 像素截图已目视检查，无页面横向溢出；证据 `verification-output/player-identity/`。本轮使用隔离样本，真实客户端名单联调待现场验证。
