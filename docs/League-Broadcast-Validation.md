# League Broadcast 国服数据验证

## 2026-10-20 本机进度

已从官方 https://leaguebroadcast.gg/download 的便携版链接下载并启动后端。
应用日志报告版本 **1.13.4 stable**，签名发布者为 **BlueBottle GmbH**，Windows 签名验证有效。

下载地址：
https://bb-leaguebroadcast-update.s3.eu-central-1.amazonaws.com/LeagueBroadcast-win-Portable.zip

本次 ZIP 的 SHA-256：
`F3E6F9F88C61B0EB9CF1C1867F883A270547CC5BA1A91500BE871372A782F07F`

本地安装及采样结果存放于忽略目录 `verification-output/release-1.1.2/league-broadcast/`，第三方程序不随 RiftCast 发布。

30 秒只读探测结果：

- `ws://127.0.0.1:58869/ws/in` 连接成功，收到 `gameStatus`。
- `GET /api/ingame/status` 返回 `0`（OutOfGame）。
- `GET /api/ingame/mock` 返回 `false`。
- `GET /api/ingame/showing` 返回当前输出字段设置。
- 未收到局内快照；软件停在账号登录窗口，本机没有运行中的 League 游戏进程。

**当前只确认后端启动和本地协议连通，国服伤害数据尚待登录后实测。**

## 已核对的公开协议

来源：https://github.com/BlueBottleGG/leaguebroadcast-js-client

本次核对提交：`b8c70f1d5b9f70c5fb9d36c5ea2f37a31a91ae91`。

- 局内消息 `ingame-state-update` 的 `state` 包含 `gameTime`、`gameStatus`、`isTestingEnvironment`。
- `damageGraph.damageDealt[]` 包含英雄、队伍、`totalDamageDealt`、`damageByType`。
- `damageComposition.teams[].players[]` 包含 `physical`、`magic`、`trueDamage`、`total`。
- `teamfightDamageOverview` 提供团战输出数据。
- `GET /api/ingame/showing` 与对应 POST 控制字段输出，包括 `fullGameDamageGraph`、`damageComposition` 等；初始配置未启用伤害输出。
- `POST /api/ingame/teamfight/start`、`stop` 与 `GET /api/ingame/teamfight/active` 提供团战跟踪。

字段存在尚不足以确认当前国服可用。需实测其统计口径、可用性、输出开关及重置行为，再选择累计值差分或后端团战区间接口。

## 复现采样

在项目根目录运行：

```powershell
node scripts/probe-league-broadcast.mjs 30 verification-output/release-1.1.2/league-broadcast/probe-live
```

采样器只读取本地 API 和 WebSocket，不登录、不修改输出设置、不启用模拟模式。
`report.json` 保存连接状态、消息计数和逐秒摘要；`samples.jsonl` 保存伤害字段及同一时段 Live Client 英雄与时间，用于交叉核对。

登录并准备国服观战后，验证以下行为：

1. 模拟标识关闭，十名英雄及队伍与 Live Client 一致，游戏时间对齐。
2. 如伤害字段未输出，保存原输出设置，再通过官方接口启用所需字段，验证后恢复。
3. 团战中伤害随实际技能命中增长，并确认数值代表对英雄伤害。
4. 暂停、跳转、新局、断线重连的计数与时间行为明确。
5. 数据通过验证后接入 RiftCast；保留独立时间戳、来源标识和失效判断。

1.1.2 仍等待真实伤害数据验证；本探测结果不构成实时团战伤害功能验收。
