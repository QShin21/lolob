# LeagueBroadcast 图层、资料与统计功能核对

核对日期：2026-10-22。基线：RiftCast 1.3.0，提交 `8223aa4`。状态依据可运行的源代码调用链；本页“本次补齐”另列自动化验证与实局验收范围。

官网来源：[功能总览](https://leaguebroadcast.gg/features)、[官网首页](https://leaguebroadcast.gg/)、[价格与功能表](https://leaguebroadcast.gg/pricing)。官网公开功能预览已逐项核对，完整清单见 `docs/leaguebroadcast-official-features-2026-10-22.md`。Gold Efficiency 对比伤害与已花费金币；Teamfight Timeline 展示最近团战伤害随时间变化，两者属于共用分析面板。

| 官网功能 | 1.3.0 基线核对 | 代码证据与本次处理 |
|---|---|---|
| Champion Select | 已实现 | `PrematchScenes.tsx` 的 DraftOverlay、DraftTeam；LCU 选择、禁用、预选、倒计时、选手身份与锁定动画。 |
| Fearless Bans | 已实现 | `server/draft-history.ts`、`DraftRuleControls.tsx`、`FearlessControls.tsx`；跨局历史、队伍换边、全局或分队禁选、例外局和重赛。 |
| Global Scoreboard | 部分实现 | `LiveTop.tsx` 原先只叠加队名与系列赛胜场；中央击杀、资源和时间沿用游戏原生 HUD。本次新增 `GlobalScoreboard` 独立完整顶部图层，包含时间、双方击杀、经济、塔龙与胜场。 |
| Champion Tabs | 已实现等效信息 | `LiveBottom.tsx`、`CombatOverlay.tsx` 显示十人英雄、等级、血蓝、终极技能与召唤师技能冷却、死亡时间及增益；RiftCast 布局位于底部。 |
| Inhibitor Timer | 缺失 | 本次添加结构化水晶事件字段与 `inhibitorTimers`，依有效摧毁事件按 300 秒计算、复活事件清除、回跳排除未来事件；无目标身份的事件不生成计时。 |
| Spawn Timer | 已实现 | `neutral-objectives.ts`、`CombatOverlay.tsx/NeutralTimers`；巢虫、先锋、男爵、小龙、远古龙，公共游戏时钟、断流和回跳处理。 |
| L-Frame | 缺少独立内置部件 | 本次新增左侧选手和底部品牌框；`obs-l-frame.ts` 对内置 OBS 游戏来源应用实际等比缩放，1920×1080 中保留 x=280、y=0、w=1640、h=922.5 游戏区域。预监和节目独立应用，关闭后恢复完整画布；外部自选 OBS 来源需提供兼容构图。 |
| Player Scoreboard | 已实现 | `LiveBottom.tsx` 显示十人装备、KDA、金币、补刀、符文、视野和冷却。 |
| Gold Efficiency | 缺失 | 本次新增每千已花费金币的英雄伤害：伤害 ÷（累计金币 − 当前金币）× 1,000。任一必要数据缺失、过期或花费为 0 时留空。 |
| Kill Participation | 部分实现 | 赛后第二页已有 KP；本次补局内十人 KP 图层，要求本队五人完整有效统计。 |
| Level & XP Tracker | 已实现，补独立分析入口 | 底部面板和团战面板已有等级/经验；本次添加独立十人等级与经验分析面板。 |
| Rune Display | 已实现 | `RuneLineup.tsx` 完整阵容符文，`LiveBottom.tsx` 主符文/副系，`lineup-runes.ts` 处理符文顺序。 |
| Gold Graph | 已实现 | `EconomyChart.tsx`、`DataScenes.tsx/EconomyOverlay`；经济差曲线、断采留空、事件点与悬浮数据。 |
| Scoreboard Damage Graph | 部分实现 | 赛后第三页已有十人伤害；本次添加实时累计对英雄伤害分析图层。 |
| Damage Composition / damage types | 数据已有、观众图形缺失 | 本次 `damage-composition` 显示局内每位选手物理、魔法、真实英雄伤害及比例，赛后第 3 页显示存档三类型堆叠条与数值；三类数据完整时展示，缺失留空，有效零值保留，局内额外要求新鲜样本。 |
| Teamfight Damage | 已实现 | `syncFightSegment` 在节目切入团战时建立本段伤害基线，`TeamfightOverlay` 显示十人本段伤害，缺测与计数回退保留为空。 |
| Teamfight Timeline | 缺少观众图形 | 操作台已有回放事件列表。本次增加每秒团队伤害采样与观众曲线，缺测区间断开，切回局内后保留最近一段，跳转后重建。 |
| Kill Feed | 缺少观众图层 | 操作台已有事件记录。本次添加最近 12 秒、最多四条击杀播报，按事件 ID 去重；采集官方 Assisters 字段并显示助攻名单，缺失时保持未知。 |
| Announcer | 缺少观众图层 | 本次添加一血、团灭、连续击杀、资源和建筑公告，按游戏时间显示最近 7 秒事件；自动场景跳转另由自动化模块核对。 |
| Smite Reaction | 缺失数据链 | 现有技能冷却、击杀事件和伤害累计无法确定惩戒施法毫秒及野怪血量阈值跨越时间。需增加可信施法/血量时间戳采集与争夺目标关联后实现；不能由击杀时间推算反应速度。 |
| Post-game statistics & graphics | 已实现 | `PostgameReport.tsx` 三页：队伍/经济概览、逐位置选手对照及 DMG/DT/KP、英雄伤害；`game-results.ts` 冻结并补齐终局数据。 |
| Team/player/game database | 已实现 | `Management*.tsx` 管理战队、选手、账号、照片与赛程；`server/state.ts` 校验关系，`postgame-archive.ts` 保存逐局原始数据。 |
| Match setup & switching | 已实现 | `load-match` 从赛程载入，恢复该场最新局归档；`next-game` 保留节目快照并准备下局，`production.ts` 包含重赛和侧边配置。 |
| Tournament workflow | 已实现 | `TournamentWorkspace.tsx`、`tournaments.ts` 支持循环、分组淘汰、淘汰、瑞士轮、赛果修订及自动晋级。 |
| Standings | 已实现 | `shared/tournaments.ts/tournamentStandings` 提供积分、局分、对手积分和、轮空及排序；赛事中心表格和 CSV 可用。 |
| Head-to-head records | 部分实现 | 排名算法已有两队同分时的交手比较；缺独立对战记录检索/播出面板。 |
| Season statistics | 部分实现 | `tournament-report.ts` 按一届赛事累计选手 KDA、胜局、场均补刀/金币/伤害/视野，并保留指标有效局数；缺跨赛事赛季聚合、英雄统计与可选排行播出。 |
| Local style customisation | 部分实现 | 本次 `StyleEditor.tsx` 增加直接颜色、字号、字体、字重、字距、透明度、位置与缩放编辑，支持逐场景覆盖与整套配色字体；保存形成新的内容版本。 |
| Style Editor v2 | 部分实现 | 本次增加风格语义图层树、点击选择、拖拽、实时预览和属性面板。内置包派生新的自定义包，原包和已播版本保留。自定义场景已有来源顺序/大小/位置编辑；任意新增数据绑定结构仍待开发。 |
| Custom browser-source overlays | 部分实现 | 本次自定义场景直接添加 HTTP/HTTPS URL，按图层宽高创建独立静音 OBS 浏览器来源；预监和节目来源隔离。校验协议、凭据和控制字符。 |

本次新增核心文件：`shared/broadcast-analysis.ts`、`src/components/BroadcastAnalysis.tsx`、`src/components/broadcast-analysis.css`、`server/broadcast-analysis.test.ts`。扩展 `GameEvent` 的 actor/victim/objective/streak，`normalizeLive` 保留结构化字段，`FightSegment.samples` 记录两队伤害时间线。`shared/l-frame.ts`、`server/obs-l-frame.ts` 和现有 `obs-broadcast.ts` 组成实际游戏来源变换链。自定义 URL 图层扩展 `CustomSceneSource`、`custom-scenes.ts`、`obs-custom-scenes.ts` 及场景编辑器。可视化风格编辑使用 `StyleEditor.tsx`、`style-editor.css`、`style-pack-position.css`、`StylePackStore.derive`，沿用版本化风格 API 和预监/TAKE 流程。

当前验证：`npm run check` 通过；分析、combat-display、自定义场景、OBS L-frame、风格派生及原风格回归共 49 项测试通过。新增分析用例 8 项，覆盖已花费金币、数据缺失和过期、五人 KP 分母、三类型完整构成、回跳等待、水晶身份、事件去重、伤害样本缺口与跳转重建。

浏览器验证由 `scripts/verify-broadcast-analysis.mjs` 和 `scripts/verify-style-editor.mjs` 执行。前者通过 10 组检查：六种分析显示、缺测状态、真实 1280px 容器自适应、L-frame 与 OBS 使用同一游戏矩形、水晶与分析避让、关闭模式；后者通过 5 组检查：图层选择与十人同步属性、实际拖拽、保存内容及内置包保留、切换场景、1000px 窄屏布局。截图与 JSON 记录在 `verification-output/broadcast-analysis/`、`verification-output/style-editor/`。截图数据为隔离测试样本；真实游戏采集、OBS 合成和播出验收由发布验证单独记录。

逐次伤害图形已在后续开发补齐：`ReplayDirector → server/combat-review.ts → CombatReviewOverlay` 提供英雄伤害流向、死亡前来源及伤害类型、已识别中立目标 DPS、后台历史团战选择与时序图。数据来自当前国服版本的观战分片或回放索引；图形使用已经播放的时间范围，采集覆盖不足时保留缺失标记或空值。Smite Reaction 仍需惩戒施法时间与目标血量时间序列。塔皮、皮肤展示、战术绘制、动态图形文字及 BP 胜率图层的状态在全功能矩阵中逐项登记。Role Quest 由 `LiveBottom` 展示遥测进度；本轮另已补充 `bestPartners` 共同参与击杀排行和 `ProgramLayouts` 全高 BP 与双侧英雄状态栏。

赛后类型与击杀助攻补充：`GameResult.snapshot` 使用 `Recording` 类型，其中 `players` 保存完整 `DamageTotals`。`enrichPostgame → result.snapshot.players → syncResultRecording → recordings → frozenGameState → PostgameReport` 全链保留三类伤害，支持已接受终局后的类型补采、保存/重载以及断开游戏客户端后的显示。相同终局总量的重复部分响应保留已保存类型；总量变更且未提供新类型时清空旧构成。现有赛后第 3 页提供图形入口，无需增加页码。

助攻来源依据 [Riot 官方 Live Client 事件样例](https://static.developer.riotgames.com/docs/lol/liveclientdata_events.json) 的 `ChampionKill.Assisters`，规范化到可选 `GameEvent.assistants`。空数组表示明确没有助攻，字段缺失继续保持未知；非法名单整体留空。击杀播报显示已采集的助攻姓名，保存的事件同样保留名单。

本轮追加验证：`postgame-composition`、`postgame-damage`、`postgame-092`、`game-results`、`broadcast-analysis` 共 31 项通过，TypeScript 检查通过。浏览器分析 10 组再次通过（包含助攻显示），新增赛后构成验证 3 组通过：断流后的已保存数据、缺失/零值、1920px 与 1280px 排版。记录和截图位于 `verification-output/postgame-composition/`。

Global Scoreboard 的 Power Play 已在后续开发补齐：`shared/power-play.ts` 保存事件前的双队金币基线、期间采样和增益状态，收益为本队金币增长减去对方金币增长。基线取事件前 2 秒内最近完整采样；缺失基线、五人增益覆盖或金币数据时显示未知。回放跳转、来源会话变化和新局会清除旧区间。

归档图形已提供独立 16:9 浏览器输出 `/overlay/archive?result=<存档ID>&mode=<模式>&page=1`，工作台可选择存档与图形并复制链接。`ArchiveGraphicsOutput` 加载固定身份的已保存对局，`ArchiveGraphicsLinks` 提供入口，`ArchiveGraphics` 接收 `state`、`champions`、`resultId`、`mode`、可选 `timeline`/`details`/`page`。实现位于 `shared/archive-graphics.ts`、`src/components/ArchiveGraphics.tsx` 与 `archive-graphics.css`。

| 官网单元 | 本次归档图形 | 数据与边界 |
|---|---|---|
| V23 赛后队伍数据 | `mode=team` | 从冻结存档提供队伍统计及资源比较，五人指标不完整时留空。 |
| V24 赛后伤害 | `mode=damage` | 十人伤害排行与物理、魔法、真实伤害构成；缺失类型保留未知。 |
| V25 赛后经济 | `mode=gold` | 原始金币曲线与最后有效金币，采样缺口留空。 |
| V29 系列赛 | `mode=series` | 逐局胜负和时长，按战队身份跟随换边，重复、无效和后续局排除。 |
| V30 Fearless | `mode=fearless` | 按已确认分路展示英雄历史及下一局限制；保留未知分路、规则例外和重赛保留历史，结束系列赛展示历史。 |
| V31 Fearless 树 | `mode=fearless-tree` | 按战队和局号展示英雄历史，七局分页。 |
| V26 装备时间线 | `mode=items` | 从 `raw.timeline.payload.frames[].events[]` 读取购买、出售、销毁和撤销交易。通过同局 `raw.details.payload` 的显式 `participantId` 关联选手及英雄，装备名称与图标复用 `useItemCatalog`。无身份或装备资料时显示编号，无原始时序时显示空态。 |

装备时间线保留原始毫秒时间换算后的秒数以及撤销交易前后物品编号；同一时间的多次购买分别保留。详情的比赛 ID 必须匹配存档，重复参与者 ID 保持未匹配。分路与参与者身份均使用原始关联字段，未确认信息单独展示。

归档新增单测 5 项通过，覆盖换边、无效/重复局、完整队伍统计、缺失伤害、Fearless 规则与分路、装备事件及身份关联。`scripts/verify-archive-graphics.mjs` 通过 15 组浏览器检查：七种图形、原始时序缺失、70 个未知分路英雄、1280px 适配、归档接口身份关联、可复制链接，以及选手装备面板完整九项符文与缺失占位。截图已目视检查；结果位于 `verification-output/archive-graphics/report.json`。该验证使用隔离存档和模拟原始接口及装备资产，实局采集和 OBS 播出由发布验证单独记录。

选手装备面板 `PlayerBuild` 同步补齐六项选择符文和三项属性碎片，复用 `lineupRunes`、`lineupStatRunes` 和本地 `runeImage` 素材，节目图层和工作台面板均可见。缺失字段保留对应未知位置，文本说明仍在工作台展示。归档与符文相关单测合计 9 项通过，TypeScript 检查通过。

节目转场本轮补齐：`shared/broadcast-transitions.ts` 提供硬切、淡化、视频转场配置与事件规则；`TransitionControls` 提供时长、视频路径、切换点和自动切入控件。`ObsTransitions` 保存当前节目静帧，在自有临时 OBS 场景内准备来源，使共用一个 OBS 场景的图形也能转场。视频按媒体游标到达切换点发布新节目，播放结束后读回场景；回执明确新内容是否已发布。OBS 转场设置和场景覆盖配置在操作后恢复，临时来源和静帧完成后清理。

事件规则覆盖结束、一血、团灭、连杀、男爵、巨龙、先锋、防御塔和水晶。自动开关默认关闭；规则有队伍条件、优先顺序和冷却。首次观察、跳转和旧事件不会自动切入。主服务 actionQueue 串行执行并在排队后再次核对比赛、时钟、规则版本和等待时间。

本轮转场 6 项与 Power Play 4 项测试通过；`scripts/verify-transitions.mjs` 7 组 UI 检查通过，包含视频与规则保存、窄屏、删除规则、收益有效/缺失/断流。Power Play 追加覆盖累计金币回退仍高于起点、增益到期时间字段消失。目视截图及报告位于 `verification-output/transitions/`。OBS 协议使用模拟服务验证执行顺序与失败行为；实际素材的解码、透明通道和遮挡切换点由真实 OBS 联调确认。
