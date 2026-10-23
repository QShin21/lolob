# League Broadcast 官网功能核对基准

核对日期：2026-10-22（Asia/Shanghai）。本表覆盖当前官网首页、Features、交互预览的全部选项、Pricing、How it works、Changelog，以及官网的赛事操作指南。软件当前公开更新记录最高版本为 1.9.0，发布日期为 2026-07-16。

本文整理可用于独立实现的功能事实及验收目标。RiftCast 当前实现、代码证据、测试条件与保留缺口见 [完整对照矩阵](leaguebroadcast-comparison-2026-10-22.md)。用户明确跳过云备份与 WebDAV 同步，官网原始事实仍保留在本清单中，对照矩阵单列该范围决定。

## 来源和口径

| 标记 | 官网来源 | 使用范围 |
| --- | --- | --- |
| F | [Features](https://leaguebroadcast.gg/features) | 35 个功能卡片、33 个内置预览组件、开源演示的分组 |
| P | [Pricing](https://leaguebroadcast.gg/pricing) | 当前功能级别、访客身份、企业服务与商用权利 |
| H | [首页](https://leaguebroadcast.gg/) | 赛季交手记录、世界内图形和单客户端多机位 |
| W | [How it works](https://leaguebroadcast.gg/how-it-works) | 本地数据、运行条件、浏览器源和逐帧数据说明 |
| C | [Changelog](https://leaguebroadcast.gg/changelog) | 1.0.0—1.9.0 的新增功能、具体操作能力 |
| G | [赛事操作指南](https://leaguebroadcast.gg/guides/tournament-broadcast) | 同机/双机输出、解说延迟、验收场景 |
| A | [官方产品比较](https://leaguebroadcast.gg/alternatives) | 老版 LeagueBroadcast 与当前维护产品的关系 |

交互预览数据也通过官网页面实际引用的公开资源核实：[FeaturesView-DG4bx0EB.js](https://leaguebroadcast.gg/assets/FeaturesView-DG4bx0EB.js)、[features-DByICKAR.js](https://leaguebroadcast.gg/assets/features-DByICKAR.js)。这些资源揭示了静态正文未展开的赛前、赛后组件；页面脚本下载保存在内部核对资料中。

状态用语：**当前**表示现行功能页或定价明确列出；**历史新增**表示 Changelog 有记录；**实验**表示官方明确为可选实验；**历史试用**表示有结束日期；**服务**表示需要账户、基础设施或商业履约。

## 当前功能卡片（完整 35 项）

| ID | 官网英文标题 | 中文验收目标 | 级别 / 条件 | 来源 |
| --- | --- | --- | --- | --- |
| F01 | Team, player and game database | 保存战队、选手和对局资料 | Free | F/P |
| F02 | Match setup and broadcast flow | 建立比赛，安排赛前、比赛中、赛后工作流 | Free | F/P |
| F03 | Match switching | 切换观察比赛，并保留原比赛上下文 | Basic | F/C 1.9.0 |
| F04 | Cloud backup and sync | 跨设备备份、恢复并同步样式和比赛资料 | Basic；需远端存储/身份 | F/P/C |
| F05 | Champion select and in-game overlays | BP 与比赛中透明叠加图形 | Free；本地网页源 | F/W |
| F06 | Local style customisation | 本地修改颜色、字体、布局并保存 | Free | F/H |
| F07 | Style Editor v2 | 图层树、属性面板、拖动吸附、轮廓参考、撤销重做 | Free；1.9.0 标为实验可选 | F/C |
| F08 | Custom browser-source overlays | 托管、集成和输出自定义网页叠加层 | 当前 F 列 Free；云同步为 Basic | F/C 1.6.0 |
| F09 | Advanced in-game fields | 丰富玩家、经济、技能、目标和分析数据 | Basic；依赖原始数据源 | F/P |
| F10 | Post-game statistics and graphics | 赛后结果、选手、队伍与整局分析图形 | Basic | F/P |
| F11 | Cinematic editor, spline camera tracks, native jumps and in-game preview | 镜头时间线、平滑样条、跳切、游戏内预览 | Free；需要游戏镜头控制通道 | F/H |
| F12 | Simple team assets in cinematics | 在峡谷世界中放置比分、队名和队徽 | Basic；世界坐标渲染 | F/H/C 1.9.0 |
| F13 | Champion assets in cinematics | 在世界内电影镜头中放置英雄资产 | Pro；模型/世界渲染 | F/H/P |
| F14 | Native controller support for directed, free cam and dolly modes | 手柄控制自动导播、自由镜头和移动轨道镜头 | Basic；游戏镜头通道、手柄 | F/P |
| F15 | Editable controller hotkeys for every action | 每项手柄动作均能修改绑定 | Basic | F |
| F16 | Multi-view camera layouts in one client | 单个软件客户端内输出多个同步原生游戏摄像机视图 | Pro；官网未公开底层游戏进程机制 | F/H/G |
| F17 | Caster mode and hotkeys | 解说控制面板、可编辑按钮、全局快捷键、多键绑定 | Free | F/C 1.0.0/1.9.0 |
| F18 | Event feed | 实时事件列表，点击事件调出对应图形 | Basic | F/C 1.5.0 |
| F19 | Automatic camera control | 根据游戏情况自动选择观察镜头 | Basic；游戏镜头通道 | F/P |
| F20 | Announcer and event-driven transitions | 连杀/资源等事件播报及图形自动切换 | Pro | F/P |
| F21 | Champion Detail | 英雄细节图形；官网未公开更细数据字段定义 | Pro | F/P |
| F22 | Twitch audience controls | Twitch 观众投票、预测、聊天投票与画面 | Free；账户及平台连接 | F/C 1.4.0 |
| F23 | Tournaments and match workflow | 赛事、赛程、参赛名单和比赛状态管理 | Basic | F/C |
| F24 | Statistics generator | 依据已结束比赛生成赛事/历史/赛季统计 | Basic | F/P/H |
| F25 | Remote caster and producer sessions | 邀请远程解说和导播，以制作范围内的访客角色访问 | Pro；网络、会话权限 | F/P |
| F26 | Camera and mirror synchronisation | 远端摄像机状态及镜像画面同步 | Pro；双方数据/画面连接 | F/P |
| F27 | Multiple concurrent productions | 同时运行互相独立的多个制作项目 | Enterprise；隔离状态和服务资源 | F/P |
| F28 | Production webhooks | 将制作事件发送到配置的外部接收端 | Pro；网络接收服务 | F/P |
| F29 | Live game-data feed | 向自定义集成持续提供实时游戏状态 | Pro | F/P |
| F30 | Integration and game-data controls | 管理数据集成开关和数据输出 | Pro；官网未公开具体控件清单 | F |
| F31 | Custom integrations and deployment | 定制系统连接、数据处理和部署 | Enterprise；项目交付服务 | F/P |
| F32 | Organisation administration and roles | 组织管理、成员和角色权限 | Enterprise；组织身份域 | F/P |
| F33 | SSO, audit and procurement support | 单点登录、审计记录及采购支持 | Enterprise；身份提供商；采购为服务 | F/P |
| F34 | Dedicated or private infrastructure | 专属/私有服务器部署和运行 | Enterprise；基础设施服务 | F/P |
| F35 | SLA and named support | 服务等级协议、指定支持和赛事保障 | Enterprise；履约服务 | F/P |

## 官网交互预览（完整 33 项）

预览中的同屏 HUD 能叠加；大型比赛中分析图形共用下方槽位，选中一种会替换同组图形。下表为独立验收单元，和 F05/F09/F10/F24 等总项存在层级关系，统计覆盖率时应避免重复计数。

| ID | 阶段 / 英文组件名 | 功能事实与验收目标 | 级别 |
| --- | --- | --- | --- |
| V01 | BP / Champion Select | 全高 BP、选手身份、当前选人状态 | Free |
| V02 | BP / Bottom Row | 底部 BP、队名与系列赛比分 | Free |
| V03 | BP / Bottom Row + Fearless | 底部 BP 与历史局全局禁用组合 | Free |
| V04 | 比赛 / Global Scoreboard | 比分、经济、资源、局号、时间、资源增益收益 | Free |
| V05 | 比赛 / Champion Tabs | 双方英雄、装备、等级、状态边栏 | Free |
| V06 | 比赛 / Inhibitor Timer | 被摧毁水晶的重生倒计时 | Free |
| V07 | 比赛 / Spawn Timer | 中立资源刷新时间 | Free |
| V08 | 比赛 / Player Scoreboard | 十人装备、KDA、经济、补刀 | Free |
| V09 | 比赛 / Kill Feed | 击杀及助攻事件 | Basic |
| V10 | 比赛 / Announcer | 连杀、资源事件横幅 | Pro |
| V11 | 比赛 / Smite Reaction | 争夺惩戒后的反应时间比较 | Basic；需高精度时间/血量/施法数据 |
| V12 | 比赛 / Gold Efficiency | 选手输出相对于**已花费金币**的效率 | Basic；已花费金币与累计收入分开 |
| V13 | 比赛 / Gold Graph | 全局经济差走势 | Basic |
| V14 | 比赛 / Kill Participation | 参团贡献与最佳搭档信息 | Basic；搭档需共同参与事件 |
| V15 | 比赛 / Level & XP Tracker | 经济、经验、补刀、分路任务、镀层侧栏 | Basic |
| V16 | 比赛 / Rune Display | 双方完整符文配置 | Basic |
| V17 | 比赛 / Scoreboard Damage Graph | 底部记分板中的队伍伤害比较 | Basic |
| V18 | 比赛 / Teamfight Damage | 最近团战双方伤害总结 | Basic |
| V19 | 比赛 / Teamfight Timeline | 最近团战伤害随时间推进的观众图形 | Basic；需团战时序样本 |
| V20 | 比赛 / L-Frame | 左下方品牌/赞助框 | Basic |
| V21 | 赛后 / Post-game Transition | 由比赛画面进入赛后分析的转场 | Basic |
| V22 | 赛后 / Game Analysis | 胜负、伤害、资源、整局经济曲线 | Basic |
| V23 | 赛后 / Game Analysis · Team Stats | 全屏双方比赛总量比较 | Basic |
| V24 | 赛后 / Game Analysis · Damage Graph | 全屏十人伤害比较 | Basic |
| V25 | 赛后 / Game Analysis · Gold Graph | 全屏经济走势 | Basic |
| V26 | 赛后 / Player Items & Runes | 选手身份、装备、符文和出装时间线 | Basic；出装时刻需历史事件 |
| V27 | 赛后 / Player Stats | 单名选手表现页 | Basic |
| V28 | 赛后 / Matchup Table | 赛事赛程与赛果表 | Basic |
| V29 | 赛后 / Matchup Overview | 一场系列赛的逐局时间和胜负 | Basic |
| V30 | 赛后 / Fearless Draft | 按分路呈现下一局英雄限制 | Basic |
| V31 | 赛后 / Fearless Tree | 系列赛逐局选用英雄的关联历史 | Basic |
| V32 | 赛后 / Season Leaderboard | 按生成的赛季指标展示前五名 | Basic |
| V33 | 赛后 / Season Spotlight | 单名选手的赛季比率、占比、英雄池 | Basic |

## 更新日志补充的具体功能

| ID | 功能 | 独立验收点 | 来源 / 当前定位 |
| --- | --- | --- | --- |
| C01 | Objective DPS | 争夺目标时的伤害速度 | C 1.5.0；历史新增 |
| C02 | Damage Composition | 伤害类型构成 | C 1.5.0；历史新增 |
| C03 | Damage Flow | 伤害流向 | C 1.5.0；历史新增；官网未详列统计公式 |
| C04 | Death Recap | 死亡前承受伤害的回顾 | C 1.5.0；历史新增 |
| C05 | Champion Damage Split | 英雄伤害的细分 | C 1.5.0；历史新增；细分字段未公开 |
| C06 | Skin Display | 英雄皮肤展示 | C 1.5.0；历史新增 |
| C07 | Damage type | 比赛中与赛后伤害图显示伤害类型 | C 1.5.0 |
| C08 | Teamfight tracking | 记录团战，并允许手动选择展示 | C 1.5.0/1.9.0 |
| C09 | Auto side selection | 由直播选手和比赛名单对齐蓝红方，高置信度时换边 | C 1.7.0 |
| C10 | VDO.Ninja integration | 生成选手视频链接，在 BP/比赛中展示 | C 1.7.0；开源演示集成 |
| C11 | Telestrator | 游戏内战术绘制 | C 1.7.0；历史限时试用至 2026-06-07；现行 P 说明 RiftBrush 单独销售 |
| C12 | Dynamic text placeholders | 赛程、选手、英雄、水晶、边栏、Fearless、底部 BP 的动态文字 | C 1.3/1.4.0 |
| C13 | Post-game transitions | cut、fade、可配置 stinger | C 1.3/1.0.0 |
| C14 | Schedule/result selection | 编辑比赛日期、胜方、类型；从首页启动预定比赛；赛后筛选全部/已完成/待进行 | C 1.3/1.6.0 |
| C15 | Custom style sets and variants | 创建风格集，添加/删除变体，重名防护，统一字体/队色、局部覆盖 | C 1.0.0/1.2.0 |
| C16 | Import/export and sync | 样式导入导出、云保存；自定义叠加层托管、导出、同步 | C 1.1.0/1.6.0 |
| C17 | Asset/patch management | 自动识别版本/区服、下载进度、缓存与到期清理、缺失资产回退 | C 1.1.0/1.4.0/1.6.0 |
| C18 | Preview/mock data | BP、非持续图形、队徽、Twitch 和曲线的模拟数据 | C 1.2.0/1.5.0/1.9.0 |
| C19 | REST/API/frontend library | 游戏工具端点、带类型响应、JavaScript 数据访问库、自定义叠加层开发服务器 | C 1.4.0/1.7.4 |
| C20 | Responsive operation | 手机/平板界面、可重排解说面板 | C 1.0.0 |
| C21 | App operations | 可配置端口、端口冲突启动窗口、应用更新下载进度、顶部故障报告、首次设备教程与内联更新通知 | C 1.0.0—1.9.0 |
| C22 | Player identity | 自定义选手名称、选手头像、Riot#TAG 粘贴识别、隐藏昵称时排序 | C 1.6.0—1.9.0 |
| C23 | Season 16 fields | 分路任务、永久镀层、鞋子升级等随版本变化的字段 | C 1.0.0/1.6.0；Atakhan/血玫瑰为当时更新记录，当前游戏规则另行核实 |
| C24 | Objective and ability details | 水晶重生、远古龙/男爵 Buff、塞拉斯偷取终极技能图标 | C 1.1.0/1.7.0 |
| C25 | Draft statistics provider | 赛事选禁统计、英雄选用和胜率数据源选择、u.gg 回退 | C 1.0.0/1.9.0 |
| C26 | Caster control refinements | 自定义按钮、逐按钮设置、可靠重置、一项快捷操作多组按键、后台全局触发 | C 1.0.0/1.9.0 |
| C27 | Season results | 联赛积分、两队历史交手、赛季历史 | H；当前 |

## 数据与部署能力

| ID | 官网声明 | 核对需要的证据 |
| --- | --- | --- |
| D01 | Windows 10/11 | 已打包 Windows 应用与运行验证 |
| D02 | 本地观察端游戏状态逐帧更新 | 原始数据采样频率、时间戳、延迟、缺失处理和真实游戏验证 |
| D03 | 无 Riot API key、无像素识别依赖 | 各数据字段的真实采集链路；当前官网未公开其私有实现细节 |
| D04 | Vanguard-compatible | 当前游戏/反作弊环境中的实机验证；官网声明无法替代 RiftCast 验证 |
| D05 | 本地网页输出 | 透明浏览器源；OBS/vMix 或其他浏览器源软件验证 |
| D06 | 网络访问与远程席位 | 局域网连接、受限访客角色和远程同步 |

## 旧版开源演示

Features 另有 Open-source demo，播放 Equal Esports Cup 旧版开源图形的原始赛事片段。除当前预览和日志已覆盖的名称，还出现 Minimap Frame、Side Info Page、Compact Teamfight、Teamfight Damage Panels、Objective Power Play、Player Cameras，以及 Game overview、Player performance、Runes and builds、Matchups、Series recap 等分组名称。这些为旧版演示的呈现方式，和现行 33 项内置预览分别记录；对照矩阵有对应映射和缺口。

## 服务、授权和外围能力

P 页的免费、Basic、Pro、Enterprise 权限，商业制作权、白标/OEM/转售权、订阅支付、区域定价、推荐返月、Google/邮件登录、Discord 专属频道与人工支持属于 League Broadcast 的产品经营体系。核对 RiftCast 时，应分别记录账户能力、联网集成和履约服务；实现本地统计图形不会自动获得第三方服务或授权。

F04 的远端备份与同步需要用户可用的远端存储；F22 的真实 Twitch 接入需要平台账户和授权；F33 的 SSO 需要确定身份提供商；F34/F35 需要部署与服务合同。网站没有公开这些服务的完整接口与保证指标。

## 实现拆分建议

1. 图形与数据模型：V01—V33、C01—C08、C12—C18、C22—C27，按真实可用数据校验，并为缺失数据保留空值。
2. 操作台和赛事：F01—F03、F06—F08、F17—F18、F23—F24，复用已有比赛归档，补赛季排行、选手聚焦、英雄选禁胜率和交手记录。
3. 镜头：F11、F14—F15、F19、F26，区分编排、镜头执行和渲染结果，分别验证。
4. 世界渲染：F12—F13、F16、C11，需要游戏端世界坐标/模型/多摄像机的实际渲染能力；二维网页布局验证单独记录。
5. 集成：F22、F25、F28—F30、C10、C19，交付受控接口、接入界面，再以真实服务连接验收。F04 的云备份、WebDAV 与共享风格库同步按用户要求跳过。
6. 企业服务：F27、F31—F35，根据组织、身份提供商、部署环境和服务协议完成配置和交付。

本基准共列 35 个当前功能卡片、33 个预览组件、27 个日志补充验收点及 6 个运行/数据能力，共 101 个有层级重叠的核对单元。对照矩阵已逐项列出实现、代码和剩余条件。本轮补齐镜头编辑与手柄、后台热键、风格编辑、局内及逐次伤害分析、全屏赛后与系列赛图形、九项符文、赛季统计、Twitch、VDO.Ninja、独立演示、资源维护和外部数据/API 等能力。原生世界三维、多视角、镜像、惩戒反应采样、企业账户和 SLA 等继续按实际状态记录；指标定义未公开的独立组件保留口径待核对。云备份、WebDAV 及共享风格库同步按用户要求跳过，商业计划权利独立于软件开发清单。
