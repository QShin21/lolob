# Riot 经济接口与观战金币采集

核查日期：2026-10-04。实时个人累计经济已接入原生观战计分板 OCR，并保留兼容客户端 `totalGold` 字段的优先级。

## 官方资料核查

| 来源 | 已确认的公开字段或职责 | 本次用途 |
| --- | --- | --- |
| [Live Client Data](https://developer.riotgames.com/docs/lol#live-client-data-api)：`/liveclientdata/activeplayer` | 文档示例含 `currentGold`，对应当前活动选手的可花费金币 | 单独保存为 `currentGold`，不换算累计金币，也不填充其他选手 |
| 同文档：`/liveclientdata/allgamedata`、`/liveclientdata/playerlist` | `allgamedata` 内有 `allPlayers` 数组；选手列表文档含英雄、阵营、装备、KDA、补刀等，未列 `totalGold` | 获取十名选手并匹配同侧 KDA、补刀；兼容客户端若实际返回 `totalGold`，直接使用并标记 API 来源 |
| 同文档：`/liveclientdata/playerscores?riotId=...` | 公开示例是 kills、deaths、assists、creepScore、wardScore | 提供计分板选手匹配字段；文档没有将其描述为累计经济端点 |
| [Spectator-v5](https://developer.riotgames.com/apis#spectator-v5/GET_getCurrentGameInfoByPuuid)：`/lol/spectator/v5/active-games/by-summoner/{encryptedPUUID}` | 当前对局信息、阵容、英雄、阵营、符文、技能、比赛时间；本次读取的官方响应定义未列 gold/totalGold | 可获知正在进行的比赛与阵容，公开响应定义没有提供个人实时金币方案 |
| [Match-v5 Timeline](https://developer.riotgames.com/apis#match-v5/GET_getTimeline)：`/lol/match/v5/matches/{matchId}/timeline` | 官方 ParticipantFrame 定义包含 `currentGold`、`totalGold`，时间线包含 `timestamp`、`frameInterval` | 可用于比赛历史时间线的回补和复盘；参考页没有承诺局内每秒更新，本次实时链路不依赖它。处理时间点时应读取实际 timestamp |
| [Replay API](https://developer.riotgames.com/docs/lol#replay-api) 与 [Riot 官方 League Director](https://github.com/RiotGames/leaguedirector) | 播放、镜头、渲染、录制、序列控制；League Director 是官方参考实现 | 使用现有 HUD 开关保持 OCR 输入可见，关闭导播控制时恢复之前保存的开关 |

API 参考页通过官方公开的 `/api-details/match-v5` 与 `/api-details/spectator-v5` 动态载入字段表；上述字段已从这两份当前响应核对。公开文档未列字段只能说明当前文档覆盖范围，不能证明所有版本或赛事专用接口均缺少该字段。

本机核查时，`https://127.0.0.1:2999/swagger/v3/openapi.json` 与 `/liveclientdata/allgamedata` 均返回连接拒绝，因此没有获得本次运行的游戏 Swagger 或实时选手金币响应。此处结论区分官方公开资料、离线截图 OCR 和实际对局验证。

## 已实现的观战金币链路

原生计分板 `123(9423)` 中，括号外 123 保存到 `currentGold`，括号内 9423 保存到累计经济 `gold`。金币、KDA 与 CS 用 OCR 字词坐标组合为同一行；中央英雄头像上的死亡倒计时通过列间距离排除。候选 CS 缺失、分裂或位于头像列时，该行不进入选手匹配。

选手身份必须通过同一阵营的 KDA 和 CS 唯一匹配。数组顺序、游戏内计分板排序和导播名单顺序均不参与推测；相同 KDA/CS、多重候选、文字缺损和累计数值倒退会被拒绝。完整十人、部分可见行均可采集。已确认的 OCR 值最多保持 10 秒；过期、切局、改变来源模式或回放跳转后停止使用旧值。

已有团队经济 OCR 开关开启时，个人识别自动跟随开启。个人开关和底部区域可以独立配置，自动定位顶部区域会保留个人配置。实时数据页显示精确整数、API/OCR 来源与独立当前金币列；录制数据与 CSV 保留个人来源、采样时间和当前金币。

请在游戏观战计分板显示金币列，并让包含金币、KDA、CS 的底部区域保持可见。默认区域覆盖游戏客户区左 25%、上 65%、宽 50%、高 35%；窗口比例或 HUD 缩放变化时，可在经济采集面板调整区域。自动 HUD 在个人 OCR 开启时保留底部计分板，避免导播控制隐藏采集源。

## 当前验证

服务测试覆盖严格数字解析、重复身份拒绝、遮挡与缺失统计、个人开关、API 优先、有效期、累计倒退和回放跳转。回归样本保留 OCR 字词与来源说明，真实观战持续识别需在当前游戏布局核对。复现检查与现场边界见 [验收说明](验收.md)。
