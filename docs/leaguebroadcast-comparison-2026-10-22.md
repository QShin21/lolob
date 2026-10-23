# League Broadcast 与 RiftCast 功能对照

核对日期：2026-10-22，2026-10-23 再次复核官网功能页与更新日志。实现前基线：RiftCast 1.3.0，提交 `8223aa493bba716805571117cbb3b2422b16fb04`。本轮修改目标：1.4.0。本文记录源码和隔离验证能够确认的能力；安装包、远端发布与现场联调结果由发布记录补充。

本轮新增可视化风格编辑、网页来源、镜头轨迹与手柄控制、后台快捷键、局内及逐次伤害分析、全屏赛后及系列赛图形、完整符文展示、赛季统计、Twitch、VDO.Ninja 名单绑定、独立图形演示、资源维护、Webhook 和游戏数据订阅。用户明确要求跳过云备份与 WebDAV 同步，本轮移除相关新增入口和路由。仍保留游戏内三维资产、单软件客户端多视角、跨客户端镜像、惩戒反应采样和企业账户服务等缺口。

## 核对依据和状态

完整官网原始清单见 [官网功能基准](leaguebroadcast-official-features-2026-10-22.md)。来源代号：F = [Features](https://leaguebroadcast.gg/features)，P = [Pricing](https://leaguebroadcast.gg/pricing)，H = [首页](https://leaguebroadcast.gg/)，C = [Changelog](https://leaguebroadcast.gg/changelog)，W = [How it works](https://leaguebroadcast.gg/how-it-works)，G = [赛事指南](https://leaguebroadcast.gg/guides/tournament-broadcast)。预览项 V 的来源为 F 页实际引用的交互预览数据。

| 状态 | 判定 |
| --- | --- |
| 已具备 | 基线已存在相应实现和操作入口，本轮源码复核确认。 |
| 本次补齐 | 本轮新增实现、接入操作或输出入口，并具有相应测试。真实设备或外部账户条件单独列明。 |
| 部分 | 同一官网条目包含多个验收点，当前覆盖其中一部分；末列列出剩余项。 |
| 未实现 | 未发现满足该条目验收目标的实现。 |
| 需服务 | 需要身份服务、部署环境、合同或支持团队，交付条件由实际服务落实。 |
| 按用户要求跳过 | 用户明确排除本轮开发和交付的能力。 |

共列 **101 个核对单元**：35 个功能卡片、33 个预览组件、27 个更新日志补充点、6 个运行和数据能力。总项与子项有层级重叠，本文不将其当作 101 项独立功能计算覆盖百分比。商业计划价格、席位额度、商业制作权、白标/OEM/转售权、推荐奖励与人工支持权益单独记录，不计作本地软件缺失。

表中源码路径均相对仓库根目录。设备与数据源共同条件：新镜头通过 Replay API 执行；伤害等字段须获得有效观测；Twitch 须提供具备相应读取权限的主播 OAuth。单元测试和浏览器截图覆盖软件行为，真实游戏、OBS、手柄、账户及直播验收分别记录。

## 当前功能卡片：35 项

| ID | 官网功能 | 状态 | 当前实现与代码证据 | 保留范围 / 条件 | 来源 |
| --- | --- | --- | --- | --- | --- |
| F01 | Team, player and game database | 已具备 | 战队、选手、赛程、比赛归档和本机持久化；`server/state.ts`、`server/game-results.ts`、`src/pages/Management.tsx`。 | 数据库内的图片路径与实际素材文件分别管理。 | F/P |
| F02 | Match setup and broadcast flow | 已具备 | 比赛建立、BP、名单确认、预监/节目、TAKE、暂停、重赛、赛后与下一局；`shared/production.ts`、`server/production.ts`、`DirectorWorkflow.tsx`。 | 输出依赖 OBS 与本地数据连接。 | F/P |
| F03 | Match switching | 部分 | 可启动赛程、查看旧局归档，节目保存上次 TAKE 内容；`shared/game-results.ts`、`server/game-results.ts`、`ProductionState.previousProgram`。 | 缺少多个正在观察的游戏会话上下文保存、恢复与切换控制器。 | F/C 1.9.0 |
| F04 | Cloud backup and sync | 按用户要求跳过 | 用户明确跳过云备份与 WebDAV 同步；本轮移除新加云备份入口和路由。 | 数据库、共享风格库及样式/媒体文件云同步均不计入本轮实现。已有本机持久化与文件导入导出继续保留。 | F/P/C |
| F05 | Champion select and in-game overlays | 已具备 | BP、局内记分板、选手、经济、团战和透明浏览器源；`BroadcastCanvas.tsx`、`program/PrematchScenes.tsx`、`LiveBottom.tsx`。 | 各具体预览组件按 V 表分别判定。 | F/W |
| F06 | Local style customisation | 已具备 | 颜色、字体、元素属性、场景覆盖、保存版本、导入导出；`shared/style-packs.ts`、`StylePackManager.tsx`、`server/style-packs.ts`。 | 本轮增加直接选中和拖动编辑。 | F/H |
| F07 | Style Editor v2 | 本次补齐 | 47 个语义目标的图层树、属性、点击选中、轮廓、拖动、字体配色、吸附参考线、100 步撤销/重做与派生版本保存；`StyleEditor.tsx`、`shared/style-appearance.ts`。 | 吸附画布及其他元素的边缘/中心，Alt 暂停；整次拖动和单次焦点编辑分组撤销。按官网图层树导航与属性编辑核对。 | F/C |
| F08 | Custom browser-source overlays | 本次补齐 | 自定义场景新增浏览器 URL 来源，输入校验、存储、编辑与独立 OBS 浏览器来源输出；`server/custom-scenes.ts`、`CustomSceneEditor.tsx`、`server/obs-custom-scenes.ts`。 | URL 资源由所配置站点提供；远端托管和文件同步见 F04/C16。 | F/C 1.6.0 |
| F09 | Advanced in-game fields | 部分 | 已有经济、计分、装备、技能/状态和目标；本轮补效率、参团、经验、类型伤害、团战时序、目标 DPS、伤害流向与死亡回顾；`shared/broadcast-analysis.ts`、`server/combat-review.ts`。 | Smite 高精度施法/血量样本、镀层等专用字段仍缺；逐次伤害链已有国服 16.20 采集实现，新增图形待真实游戏联调。 | F/P |
| F10 | Post-game statistics and graphics | 本次补齐 | 原有三页赛后报告和选手焦点；本轮新增队伍、伤害、经济、系列赛、Fearless 历史与树、装备时间线独立图形；`ArchiveGraphics.tsx`、`shared/archive-graphics.ts`。 | 按已保存对局选择输出；原始装备时序依赖归档 timeline。转场设置另见 V21/C13。 | F/P |
| F11 | Cinematic editor, spline tracks, native jumps, preview | 本次补齐 | 抓取关键帧、编辑位置/旋转/FOV、线性/样条/跳切、导入导出、播放停止、写入后原生读回；`shared/cinematics.ts`、`server/cinematics.ts`、`CinematicWorkspace.tsx`。 | 本机 Replay API 当前不可达；真实轨迹画面待游戏联调。已有 OBS 预览承载画面。 | F/H |
| F12 | Simple team assets in cinematics | 未实现 | 已有二维队名、队徽和比分。 | 游戏世界内放置和渲染三维队伍资产的接口、坐标编辑与模型管线缺失。 | F/H/C |
| F13 | Champion assets in cinematics | 未实现 | 已有英雄原画与二维图标。 | 英雄三维资产、世界变换、光照与遮挡渲染缺失。 | F/H/P |
| F14 | Controller: directed, free cam and dolly | 本次补齐 | Gamepad API、选手跟随、自由移动、固定方向推进、速度/死区/反转；`CinematicWorkspace.tsx`、`shared/cinematics.ts`。 | 实体手柄和真实游戏镜头待验。 | F/P |
| F15 | Editable controller hotkeys for every action | 本次补齐 | 四轴及升降、选手切换、播放、停止、抓取的独立绑定；重复绑定校验、持久化、权限和隐藏页面停收；`CinematicWorkspace.tsx`。 | 覆盖当前实现的手柄动作集。 | F |
| F16 | Multi-view camera layouts in one client | 未实现 | OBS 已有多来源合成、预监和节目画面。 | 单个软件客户端内同步多个独立原生游戏摄像机视图缺失；官网未公开底层游戏进程机制。 | F/H/G |
| F17 | Caster mode and hotkeys | 已实现（本地验收） | `CasterControls.tsx` 支持 24 个自定义按钮，名称/动作/参数/排序/重置；工作台、设置与远程导播入口。六项默认动作每项可加 3 个附加键，每按钮可绑 3 个组合键，包含后台注册、占用回执和主导播所有权。 | 8 组浏览器流程通过；Windows 原生 10 键注册/注销通过，未发送实际按键或执行真实游戏/OBS 动作。 | F/C |
| F18 | Event feed | 本次补齐 | 事件列表、筛选、标记与点击事件驱动回放镜头；本轮事件按钮准备对应分析图形并进入预监，核对后 TAKE；`StudioDetails.tsx`、`GameReplayDirector.tsx`。 | 按已识别事件及有效战斗记录提供映射；没有对应样本时保持未知。 | F/C |
| F19 | Automatic camera control | 本次补齐 | 显式启用后跟随新击杀/资源事件参与者；初始历史基线、时间跳转、手动接管停用；`CinematicEngine.tickAuto()`。 | 当前为可解释的事件规则；依赖 Replay API 与选手可识别信息。 | F/P |
| F20 | Announcer and event-driven transitions | 本次补齐 | 事件公告/击杀播报，以及明确启用后的事件→场景规则；`broadcast-transitions.ts`、`TransitionControls`、服务端串行 TAKE。 | 新事件、队伍条件、顺序优先级、冷却、断流/跳转/重连去重；自动切入默认关闭。 | F/P |
| F21 | Champion Detail | 已具备 | 当前选手焦点具备身份、英雄、装备、符文、KDA、等级、补刀、经济；`PlayerBuild.tsx`。 | 按官网英雄详情图形的描述核对；皮肤和伤害回顾等独立条目分别判定。 | F/P |
| F22 | Twitch audience controls | 本次补齐 | Helix 读取投票/预测，EventSub 实时更新与聊天投票，显示选择、结束本地投票、比例/倒计时图形；`server/twitch-audience.ts`、`TwitchAudienceWorkspace.tsx`。 | 需主播 OAuth。真实账户待验；平台已有投票/预测由 Twitch 管理，应用当前读取展示；本地投票只收集收到的聊天消息。 | F/C |
| F23 | Tournaments and match workflow | 已具备 | 赛事名单、赛程、状态、五种赛事格式、晋级与结果纠正；`shared/tournaments.ts`、`TournamentWorkspace.tsx`、`server/tournaments.ts`。 | 具体赛制与名单按创建配置。 | F/C |
| F24 | Statistics generator | 本次补齐 | 原有赛事报表扩展为赛季 12 指标、Top 5、选手聚焦、英雄选禁/胜率、交手记录；`shared/season-statistics.ts`、`SeasonStatistics.tsx`。 | 来源为有效已归档比赛；缺失和未知胜方采用独立分母，详见后文。 | F/P/H |
| F25 | Remote caster and producer sessions | 已具备 | LAN 访客邀请、五类操作席、接管和权限限制、远程页面；`server/control-seats.ts`、`server/security.ts`、`src/pages/Remote.tsx`。 | 当前通过可达局域网地址使用，主机和来源校验限制已允许地址；公网部署需另配网络。官网未要求自带音视频或中继服务。 | F/P |
| F26 | Camera and mirror synchronisation | 未实现 | 同服务 WS 同步状态、预监/节目使用同一游戏捕获。 | 跨游戏客户端镜头、回放时间和镜像画面同步协议及客户端缺失。 | F/P |
| F27 | Multiple concurrent productions | 部分 | 服务支持独立端口和数据目录配置，可建立独立状态实例；Electron 当前限制单实例。 | 同机并行游戏/OBS 资源分配与多个制作实运行未验。并行商业制作权限另属服务合同。 | F/P |
| F28 | Production webhooks | 本次补齐 | 事件订阅、签名、队列、重试、投递记录、启停；`server/integrations.ts`、`shared/integrations.ts`、`IntegrationWorkspace.tsx`。 | 需配置接收 URL；外部真实接收端待联调。 | F/P |
| F29 | Live game-data feed | 本次补齐 | 显式令牌、版本化数据模型、HTTP 快照与持续事件流，输出观众所需游戏字段；`DataFeed`、`server/integrations.ts`。 | 实时性取决于当前采集源，字段缺失保持可识别。 | F/P |
| F30 | Integration and game-data controls | 本次补齐 | 令牌轮换、来源配置、Webhook 订阅/投递状态与实时数据入口；`IntegrationWorkspace.tsx`。 | 对应当前公开集成契约；官网未列细项控件规范。云备份和 WebDAV 按用户要求跳过。 | F |
| F31 | Custom integrations and deployment | 需服务 | 已提供可扩展本地 API 和数据契约。 | 每个外部系统接口、部署目标和交付范围须单独实施。 | F/P |
| F32 | Organisation administration and roles | 部分 | 制作内已有 readonly/data/subtitle/replay/director 五类席位；`shared/production-types.ts`、`server/control-seats.ts`。 | 组织账户、成员生命周期、多制作权限域和集中管理缺失。 | F/P |
| F33 | SSO, audit and procurement support | 部分 | 生产操作审计及操作者、时间、理由已存在；`server/production.ts`、`server/state.ts`。 | OIDC/SAML SSO 与组织审计服务未实现；采购支持属履约服务。 | F/P |
| F34 | Dedicated or private infrastructure | 需服务 | 当前可在本机 Windows 独立运行。 | 私有云/专属基础设施需要实际服务器、网络、存储和运维交付。 | F/P |
| F35 | SLA and named support | 需服务 | 商业 SLA、指定支持和赛事保障尚未提供，独立于软件功能实现。 | 需人员及服务合同落实，不计作本地软件缺失。 | F/P |

## 官网预览组件：33 项

| ID | 组件 | 状态 | 实现、代码证据与剩余点 |
| --- | --- | --- | --- |
| V01 | Champion Select | 本次补齐 | `ProgramLayouts.tsx` 新增独立全高 BP，十人身份、选人/锁定状态与禁用/历史；保留原底部构图并提供布局选择。 |
| V02 | Bottom Row | 已具备 | `program/PrematchScenes.tsx` 底部 BP，队名、队徽、比分、局号、倒计时。 |
| V03 | Bottom Row + Fearless | 已具备 | `DraftHistory` 与 `server/draft-history.ts` 按战队保持历史选用和全局禁用，支持换边。 |
| V04 | Global Scoreboard | 本次补齐 | `GlobalScoreboard` 包含队伍击杀、经济、塔、龙、时间和系列赛分数；`power-play.ts` 持久采样男爵/远古龙增益期间净经济收益。起点金币、五人增益或采样覆盖不完整时显示未知。 |
| V05 | Champion Tabs | 本次补齐 | `ProgramLayouts.tsx` 新增双侧常驻英雄栏，显示英雄、装备、等级和状态；与现有 `LiveBottom`、`CombatOverlay` 使用相同真实数据与缺失语义。 |
| V06 | Inhibitor Timer | 本次补齐 | `inhibitorTimers()` 与 `BroadcastEventLayer` 依据有效水晶摧毁事件计算重生倒计时；依赖来源包含水晶事件。 |
| V07 | Spawn Timer | 已具备 | `shared/combat-display.ts`、`CombatOverlay.tsx` 的中立资源计时、版本规则与真实时钟同步。 |
| V08 | Player Scoreboard | 已具备 | `LiveBottom.tsx` 十人装备、KDA、累计经济、补刀、对位信息，缺测保留空值。 |
| V09 | Kill Feed | 本次补齐 | 本轮 `BroadcastEventLayer` 显示击杀者、被击杀者、助攻者与时间；Riot `Assisters` → `GameEvent.assistants` 规范化并保留到归档，缺失列表保留为空。 |
| V10 | Announcer | 本次补齐 | 本轮 `announcementEvent()` 与公告图层显示连杀/重要资源事件，重复及过期事件处理有测试。 |
| V11 | Smite Reaction | 未实现 | 缺少高精度惩戒施法、野怪血量阈值及双方时间样本；当前事件计时不能计算该反应值。 |
| V12 | Gold Efficiency | 本次补齐 | `shared/broadcast-analysis.ts` 与分析图形按伤害 / 已花费金币计算；已花费 = 累计金币 − 当前金币，缺测或无有效花费显示空值。 |
| V13 | Gold Graph | 已具备 | `EconomyChart.tsx`、`program/DataScenes.tsx`，经济差曲线、来源信息、断档空白和赛后冻结。 |
| V14 | Kill Participation | 本次补齐 | 本轮局内 KP、赛季 KP 和最佳搭档 Top 3 已补；`bestPartners()` 按当前已去重 ChampionKill 的击杀者+助攻者统计同队共同参与，列出已覆盖/未知击杀数；歧义身份、跨队名单、缺助攻保持未知。 |
| V15 | Level & XP Tracker | 部分 | 本轮分析页补经验/等级，已有经济/CS。`LiveBottom` 能呈现有效分路任务输入，但原生任务进度、镀层次数与收益仍缺可靠采样。 |
| V16 | Rune Display | 本次补齐 | `program/RuneLineup.tsx` 接入已采集的六项主副系符文和三项属性碎片，固定九格、缺失留空、重复碎片按位保留；`shared/stat-runes.ts` 验证，7 种碎片官方图标本地打包。 |
| V17 | Scoreboard Damage Graph | 本次补齐 | `BroadcastAnalysis` 的伤害榜显示全十人已采集英雄伤害；面板占用底部分析区域，缺测保留空值。 |
| V18 | Teamfight Damage | 已具备 | `shared/combat-display.ts`、`CombatOverlay.tsx`，团战分段、起点到当前的真实累计差、重置与缺测处理。 |
| V19 | Teamfight Timeline | 本次补齐 | `FightSegment.samples` 按 1 秒桶记录完整五人队伍伤害；`BroadcastAnalysis` 绘制双方累计伤害时序，缺口断开，seek/回退重建。 |
| V20 | L-Frame | 本次补齐 | `LiveLFrame` 与 OBS 构图接入，左侧队伍/选手、底部赛事信息与赞助；保留游戏画面区域。 |
| V21 | Post-game Transition | 本次补齐 | TAKE 接入硬切、淡化与视频转场；`ObsTransitions` 使用节目静帧桥接支持同 OBS 场景的图形变化，按真实媒体游标切换并返回执行回执。 |
| V22 | Game Analysis | 已具备 | `program/PostgameReport.tsx` 三页报告包含胜负/比分、伤害、资源和经济曲线，绑定冻结归档。 |
| V23 | Game Analysis · Team Stats | 本次补齐 | `ArchiveGraphics.tsx` 的 team 模式提供全屏双方 13 类总量比较，选手汇总要求完整五人；缺失字段保留空值。 |
| V24 | Game Analysis · Damage Graph | 本次补齐 | damage 模式提供全屏十人英雄伤害及物理/魔法/真实类型堆叠，来源为所选归档，缺测保持空值。 |
| V25 | Game Analysis · Gold Graph | 本次补齐 | gold 模式将所选局整段经济差曲线全屏展示，沿用有效采样和缺口断开规则，链接固定归档身份。 |
| V26 | Player Items & Runes | 本次补齐 | `PlayerBuild.tsx` 的节目和工作台补六项符文加三项属性碎片，保留未知占位；`ArchiveGraphics.tsx` 的 items 模式补购买/出售/销毁/撤销时间线，按 gameId/participantId 关联姓名和英雄，装备目录补名称图标。原始时间线未采集时显示等待数据。 |
| V27 | Player Stats | 已具备 | `PlayerBuild` 焦点选手页与 `PostgameReport` 对位页支持冻结单局数据；本轮另有 V33 赛季聚焦。 |
| V28 | Matchup Table | 已具备 | `program/DataScenes.tsx`、`shared/schedule-view.ts` 的分页赛程、时间、比分、状态与筛选。 |
| V29 | Matchup Overview | 本次补齐 | series 模式列截至所选局的逐局时长、胜负与换边身份；`archiveSeries()` 排除无效及重复记录，7 局分页。 |
| V30 | Fearless Draft | 本次补齐 | fearless 模式按已确认分路排列各队历史英雄，并根据当前规则标记下一局限制；未确认分路、例外局、已结束系列赛及未知规则分别显示。 |
| V31 | Fearless Tree | 本次补齐 | fearless-tree 模式连接同一战队逐局英雄节点，跟随战队 ID 处理换边；7 局分页，保留全部历史用于规则计算。 |
| V32 | Season Leaderboard | 本次补齐 | `SeasonStatisticsOverlay`、`/overlay/season?metric=…`：12 指标任选 Top 5、赛事筛选、最少出场门槛。 |
| V33 | Season Spotlight | 本次补齐 | `/overlay/season?player=…`：KDA、胜率、KP、伤害占比、DPM、视野与英雄池；页面支持复制链接。 |

## 更新日志与首页补充：27 项

| ID | 功能 | 状态 | 实现、代码证据与剩余点 | 来源 |
| --- | --- | --- | --- | --- |
| C01 | Objective DPS | 本次补齐 | `server/combat-review.ts` 从已采集逐次伤害和可识别中立单位计算最近 5 秒目标/选手 DPS；`src/components/CombatReview.tsx` 展示。窗口覆盖不足时 DPS 保持未知，真实游戏待验。 | C 1.5.0 |
| C02 | Damage Composition | 本次补齐 | `broadcast-analysis.ts`、`BroadcastAnalysis` 增加物理/魔法/真实伤害构成；每位选手三类齐全且有效才显示，类型合计与占比同步；合法零值保留。 | C 1.5.0 |
| C03 | Damage Flow | 本次补齐 | 复用 `ReplayDamageIndex.damageEvents` 的时间、来源、目标、数值与类型，绘制最近 15 秒英雄→受击英雄伤害；`server/combat-review.ts`、`src/components/CombatReview.tsx`。只显示已覆盖样本，当前游戏补丁实机待验。 | C 1.5.0 |
| C04 | Death Recap | 本次补齐 | 死亡前最多 12 秒按伤害来源与物理/魔法/真实类型汇总，并截断前次死亡之前数据；`server/combat-review.ts`、`src/components/CombatReview.tsx`。保留覆盖状态；当前没有逐技能身份，官网未公开更细指标定义。 | C 1.5.0 |
| C05 | Champion Damage Split | 部分 | `BroadcastAnalysis.tsx` 已提供逐英雄伤害及物理/魔法/真实类型构成。官网只给该独立组件名称，具体指标口径待核对；本表保留这一信息缺口。 | C 1.5.0 |
| C06 | Skin Display | 本次补齐 | Live Client `skinID` 规范化为 `Player.skinId` 并保存到归档；`shared/champion-skins.ts` 精确匹配当前资源目录，`SkinDisplay.tsx` 提供十人皮肤图形。原生编号 0 保留；炫彩仅沿目录明确的 parentSkin 查找所属原画，未知编号、缺测和图片失败各自标明；断流收起图片。 | C 1.5.0 |
| C07 | Damage type in game/post-game | 本次补齐 | 局内构成和赛后第 3 页物理/魔法/真实伤害堆叠图均已补；`reportDamageComposition`、`PostgameReport.tsx` 与 `enrichPostgame()` 保留晚到数据、归档和冻结链路。 | C 1.5.0 |
| C08 | Teamfight tracking/manual display | 本次补齐 | 已有当前团战分段和伤害图；本轮 `server/combat-review.ts` 独立汇总已播放完成的历史团战、十人伤害及曲线，工作台选择后进入待播。覆盖不足保留空值，不提前展示尚未播放片段。 | C 1.5.0/1.9.0 |
| C09 | Auto side selection | 本次补齐 | `shared/player-identity.ts`、`server/player-identity.ts`、`AutoSidesControls.tsx` 接入完整账号核对；双方各至少 3 个唯一账号匹配、完整十人同侧无冲突才修正待播，原节目保持到 TAKE。 | C 1.7.0 |
| C10 | VDO.Ninja integration | 本次补齐 | `server/vdo-ninja.ts` 持久化逐人随机邀请，支持补齐、单人换链和显式启用；`VdoNinjaWorkspace.tsx` 提供 BP/局内分路来源。稳定选手 ID、账号、唯一姓名匹配并跟随换边，歧义为空。真实视频及网络连通性待选手端联调；生成链接不连接第三方。 | C 1.7.0 |
| C11 | Telestrator | 未实现 | 游戏世界战术绘制和笔刷输入缺失。官网日志为截至 2026-06-07 的历史试用，当前定价说明 RiftBrush 单独销售，列入历史能力记录。 | C 1.7.0/P |
| C12 | Dynamic text placeholders | 已实现（本地验收） | 风格编辑器支持 31 个实际文字目标、23 个白名单字段：赛程、赛后选手/英雄、水晶、英雄边栏、Fearless 分路/英雄、底部及全高 BP 等；按当前卡片/赛程行/冻结存档解析，React 文本转义。47 个外观目标已同步公开 Schema。6 组动态文字浏览器验收及导出 Schema 测试通过。 | C 1.3/1.4.0 |
| C13 | Post-game transitions: cut/fade/stinger | 本次补齐 | `TransitionControls` 配置方式、时长、本机视频和切换点；`productionTransition` 串行准备来源、发布节目、执行 OBS 转场并确认场景；失败回执区分发布前/后，恢复原转场设置。 | C 1.0.0/1.3 |
| C14 | Schedule/result selection | 本次补齐 | 已有日期/赛制/比分编辑、预定比赛启动、已归档赛果选择；本轮 `GraphicControls.tsx`、`shared/schedule-view.ts` 和状态校验增加“仅已完成”，与全部/后续/指定日并列，保存及观众赛程同步。 | C 1.3/1.6.0 |
| C15 | Custom style sets and variants | 已具备 | 风格包创建派生版本、删除、校验、整套字体与队色、场景/元素覆盖；`server/style-packs.ts`、`StylePackManager.tsx`、`StyleEditor.tsx`。 | C 1.0.0/1.2.0 |
| C16 | Import/export and cloud sync | 部分 | 已有本地样式包导入/导出，本轮新增 URL 图形。云备份、WebDAV、共享风格库和样式/媒体文件云同步按用户要求跳过。 | C 1.1.0/1.6.0 |
| C17 | Asset/patch management | 部分 | 本轮 `server/resource-maintenance.ts`、`ResourceMaintenanceWorkspace.tsx` 增加实际游戏版本→官方目录匹配、手选 realms、下载阶段/计数/失败进度和超过 14 天未用缓存检查/清理；准备完成后执行保留策略。保留当前/准备/内置版本及未登记文件；版本建议经用户采用。尚未自动识别区服及在客户端启动时自动维护。 | C 1.1.0/1.4.0/1.6.0 |
| C18 | Preview/mock data | 本次补齐 | `shared/demo-state.ts`、`DemoWorkspace.tsx` 提供 34 种浏览器本地模拟模式，包含各比赛阶段、分析/非持续事件、皮肤、曲线、队徽、赛季、归档及 Twitch；支持风格/布局与缺失数据，固定全画布缩放并标识演示水印，不写正式比赛或节目。 | C 1.2.0/1.5.0/1.9.0 |
| C19 | REST/API/frontend library | 本次补齐 | 本轮版本化 HTTP/持续数据流、TypeScript 数据契约，并提供 `public/riftcast-client.js` 可直接 import 的 ES 模块客户端（snapshot/subscribe/close）；已有开发服务器与自定义网页源。当前采用随软件分发的直接导入方式。 | C 1.4.0/1.7.4 |
| C20 | Responsive operation/reorder caster panels | 已实现（本地验收） | 自定义解说面板支持拖拽重排、上移/下移、重置与持久化；远程页和操作区响应布局，800px 解说面板无页面横向溢出。`CasterControls.tsx` 及 8 组快捷键浏览器流程覆盖。 | C 1.0.0 |
| C21 | App operations | 本次补齐 | 既有端口配置、冲突提示、帮助及启动日志轮换；本轮 `electron/update-service.cjs` 增加当前仓库正式版查询、下载字节进度、取消与重试，按官方资产大小和 SHA-256 核验后保存到系统下载目录。`AppOperations.tsx` 提供顶部脱敏故障报告的本机查看/复制/导出，以及可跳过、可重新打开的四步首次引导。安装器由用户运行，报告由用户自行发送。 | C 1.0.0—1.9.0 |
| C22 | Player identity | 部分 | 现有自定义名称、肖像、人工分路/锁定身份；本轮 `shared/player-identity.ts` 补 Riot#TAG 粘贴 NFC/trim、大小写归一完整账号匹配与分段 API 字段。隐藏昵称时依赖来源仍返回可核对稳定身份；无身份样本不推断排序。 | C 1.6.0—1.9.0 |
| C23 | Season 16 fields | 部分 | 装备采集与升级后实际 itemID 展示已有；`roleQuest` 进度/完成具备输入解析与图形，但当前原生采样尚未提供稳定的真实任务字段。永久镀层、对应收益、独立鞋子任务状态缺少采样；Atakhan/血玫瑰按官网历史日志记录，适用规则随实际游戏版本核对。 | C 1.0.0/1.6.0 |
| C24 | Objective and ability details | 部分 | 本轮补水晶重生与 Power Play，已有中立计时、技能等级、冷却和终极技能状态。图形支持 ultimate.icon；当前原生采样没有可靠的塞拉斯偷取技能身份及图标字段，保留这一采集缺口。 | C 1.1.0/1.7.0 |
| C25 | Draft statistics provider | 部分 | `shared/draft-statistics.ts`、`DraftStatistics.tsx` 补齐关闭/全部本地归档/当前赛事/指定赛事四种选择，预选及已选英雄的选用率、禁用率、胜率、原始计数和独立分母；适配底部与全高 BP，设置经 TAKE 发布。当前赛事未关联时保持空样本；外部统计提供商及 u.gg 回退仍缺稳定连接器。 | C 1.0.0/1.9.0 |
| C26 | Caster control refinements | 已实现（本地验收） | 六个默认动作保留主绑定，支持每动作 3 个附加快捷键；自定义按钮可配名称/动作/参数/最多 3 个键，全局去重、注册冲突整组回滚、失去主导播所有权自动关闭。重置只清除自定义配置。 | C 1.0.0/1.9.0 |
| C27 | League standings, head-to-head, seasons | 本次补齐 | 原有联赛积分与赛事历史，新增两队历史单局/大场交手与赛季选手/英雄统计；`shared/tournaments.ts`、`season-statistics.ts`。 | H |

## 运行与数据能力：6 项

| ID | 官网能力 | 状态 | 核对结论 |
| --- | --- | --- | --- |
| D01 | Windows 10/11 packaged app | 已具备 | `electron/main.cjs` 与 Windows 安装打包流程已存在。目标 1.4.0 安装包构建、下载与哈希核验结果见本轮发布记录。 |
| D02 | Frame-accurate local data | 部分 | Live Client、Replay API、本地遥测、过期和 seek 处理已有；`server/adapters.ts`、`observer-telemetry.ts`。当前各源采样频率不同，未达到官网所述全部状态逐帧准确的实机证据。 |
| D03 | No Riot API key / no pixel dependency | 部分 | LCU/Live Client/Replay 无需公网 Riot API key，本地遥测可供部分字段；现有扩展采集仍含 OCR/内存路径，完整字段在无 OCR 条件下的可用性随客户端版本变化。 |
| D04 | Vanguard-compatible | 部分 | 程序与游戏数据适配代码已存在；当前游戏补丁和反作弊环境的完整现场验证未完成，缺少可直接证明同等兼容声明的证据。 |
| D05 | Local browser-source output | 已具备 | `/overlay`、`/overlay/season`、`/overlay/twitch`、`/overlay/archive` 与 OBS 输出接入。Twitch 页面根元素及 body 的透明背景已由浏览器检查；vMix 现场兼容待验。 |
| D06 | Network/guest/sync | 部分 | LAN 页面、受限席位与 WS 状态同步已有；部署条件见 F25，跨游戏客户端镜头/镜像同步缺口见 F26。 |

## 旧版开源演示的展示名称

Features 的 Open-source demo 展示 Equal Esports Cup 原始赛事片段；这些名称与当前内置组件的版本范围分别记录。已在 V/C 项出现的 Champion Select、Picks and bans、Fearless Bans、Team and player identity、Scoreboard、Player Scoreboard、Objective Timers、L-Frame、Rune Display、Skin Display、Gold Graph、Smite Reaction、Kill Feed、Announcer、Game overview、Player performance、Runes and builds、Matchups、Series recap 按对应行核对。其余称呼映射如下，不另算独立当前功能卡片：

| 演示名称 | 当前映射与结果 |
| --- | --- |
| Minimap Frame | 游戏原生小地图当前保留；专用可定制小地图边框组件未发现。自定义场景可叠加图片框。 |
| Side Info Page | 对应 V15：等级/经验已有，分路任务具备图形与输入解析，实际原生任务进度和镀层仍需采集字段。 |
| Compact Teamfight / Teamfight Damage Panels | 对应 V18/V19。当前十人团战面板与真实伤害时间线已有，旧版特定紧凑外观没有逐像素复刻。 |
| Objective Power Play | 对应 V04，已有事件起点、采样覆盖和缺失语义；收益为本队金币增长减去对方金币增长。 |
| Player Cameras | 已有本机摄像机与选手画面轮换；本轮补 VDO.Ninja 自动链接和名单绑定，详见 C10。 |

## 本轮统计定义与数据完整性

赛季来源为 `gameResults` 的有效归档：排除重赛无效尝试和 `snapshot.result.valid=false`，重复游戏按 `sourceGameId` 或归档键去重，赛事范围按赛事 ID 或关联赛程筛选。已匹配名单的选手采集时写入稳定名单 ID，同队显示名变更继续合并；缺少身份匹配时采用存档姓名。

- 胜率：胜场 ÷ 已确认胜方的出场局数，待确认赛果不进入分母。
- KDA：有效计分局累计（击杀 + 助攻）÷ max(1, 累计死亡)。计分、金币、伤害与视野各自使用可用局数。
- 每分钟英雄伤害：有有效时长的伤害总和 ÷ 相应时长分钟总和。缺时长的伤害仍可用于场均伤害。
- 参团率：完整且身份唯一的五人计分局累计（击杀 + 助攻）÷ 同批局队伍击杀；零击杀局不进入分母。
- 队内伤害占比：完整五人伤害且队伍总伤害大于零的各局占比平均。缺测保持空值，合法零伤害保留。
- 英雄选用率采用双方各五位英雄记录完整的局数；禁用率采用双方各五个禁用位均已记录的标准 BP；选禁覆盖率采用两者同时完整的局数。UI 同时显示三个样本数。仅观察到锁定阵容不能证明禁用阶段已采集。
- 历史交手按稳定队伍 ID 归并换边后的单局；大场来源为已完成赛程，人工补录大场赛果单列，避免混入单局出场数。

Twitch 当前软件仅订阅读取已存在的投票、预测和聊天事件，平台 POST 用于 EventSub 订阅。本地聊天投票每用户首票有效，拒绝旧消息、重复事件和其他频道消息，定时截止。令牌仅保存在服务内存，公共状态不含秘密；断开后清除。测试全部使用模拟平台，未向观众发送消息或创建真实平台投票。

## 验证记录与实际待验条件

赛季/Twitch 本轮验证：`server/season-statistics.test.ts` 9 项、`server/twitch-audience.test.ts` 8 项通过；完整符文、赛程与遥测相关测试共 19 项通过。`scripts/verify-season-twitch-parity.mjs` 在真实 App 路由下通过 7 组浏览器功能检查，API 和 WS 使用隔离样本，0 页面异常；包含 1600px 工作区、640px 窄屏、1920×1080 赛季/Twitch/九项符文/已完成赛程图形。10 张输出截图已逐张视觉检查，证据保存在内部目录 `verification-output/leaguebroadcast-parity-ui/`。官方碎片图标来源、大小和 SHA-256 在同目录 `stat-rune-assets.json`。

`scripts/verify-lineup-runes-117.mjs` 已按新九格展示更新断言：每位选手六项符文与三项属性碎片、合计 90 张本地图标，顺序与类型正确，四边均在信息卡内；六套风格 × 1920×1080/1280×720 共 12 个场景通过，缺失数据为 90 个未知占位。12 张截图已逐张目视，无九格裁切，0 页面异常。证据在 `verification-output/release-1.4.0/runes/`。

图形和风格验证见 [图形分析审计](leaguebroadcast-overlay-audit.md)；镜头、手柄、热键验证见 [镜头审计](leaguebroadcast-camera-audit.md)。归档图形新增 5 项测试及既有 4 项符文测试通过，`scripts/verify-archive-graphics.mjs` 14 组浏览器场景通过，负责代理已目视各图形。风格吸附/撤销及文本模板通过 8 项测试、9 组浏览器流程、4 张截图目视，导出 ZIP 以 Ajv Draft 2020-12 校验；证据在 `verification-output/style-editor/`。本轮总测试、构建、安装包及远端发布信息由发布记录追加。

现场待验事项：Replay API 实际游戏画面、实体手柄、后台键与真实 OBS 联动、真实 Twitch OAuth/事件推送、真实 Webhook 接收端、持续运行及实播观众画面。各项需使用相应设备或服务完成联调。

## 后续开发依赖

1. 原生游戏渲染：世界队伍/英雄三维资产、同客户端多镜头、战术绘制。先确认可用渲染接口、素材使用条件与补丁兼容，再完成实体画面验收。
2. 精细战斗采样：Smite 仍需高精度施法、目标血量和双方时间样本；目标 DPS、Damage Flow 与 Death Recap 已复用现有逐次伤害源补齐图形，当前补丁和真实游戏画面继续联调。
3. 数据补齐：镀层收益、鞋子任务、分路任务与塞拉斯偷取技能的稳定采样，以及外部 BP 统计连接器。皮肤展示、应用更新、首次引导、图形演示、资源维护和后台团战历史选择本轮已补。
4. 跨设备协作：跨客户端镜头镜像、多制作同时运行的资源隔离及现场验证。云备份、WebDAV 与样式/媒体文件云同步按用户要求跳过。
5. 企业交付：组织账户、SSO、集中审计、专属部署与 SLA；分别按身份提供商、运维环境和合同落地。

转场与 Power Play 追加验证：`server/broadcast-transitions.test.ts` 6 项、`server/power-play.test.ts` 4 项通过。`scripts/verify-transitions.mjs` 通过 7 组 UI 检查，截图已目视，报告为 `verification-output/transitions/report.json`。OBS 协议测试使用模拟回执，真实 OBS 素材解码、透明通道、实际播放切换点和实播画面需现场联调。Power Play 以事件前 2 秒内的最近完整金币采样作为基线，收益期间任一必要采样缺失或累计金币回退后该区间保持未知；换局和跳转清除旧区间。

## 2026-10-23 最终本机回归

完整 Windows 测试通过 587 项，0 失败、0 跳过；TypeScript 与前端构建通过。BP 统计新增 6 项单测及 6 组浏览器流程，皮肤展示新增 5 项单测及 7 组浏览器流程，更新器/脱敏报告新增 7 项单测及 5 组浏览器流程；相关截图已目视核对。34 种演示模式、实际权限路由、原有 BP 锁定动画、团战/计时、赛后及遥测 HUD 均通过相应回归。逐次伤害 10 项单测还覆盖并发独立交战、镜像英雄网络身份及待播姓名隔离；维护接口重新核对等待后的控制权，远程 VDO 输出链接限本机使用。

内部报告保存在 verification-output/release-1.4.0/、draft-statistics/、skin-display/、app-operations/、vdo-demo-resources/ 等目录。CI 和打包程序的最终结果随发布流水线核验，真实游戏、账号、设备与实播仍按前述范围单独联调。
