# 国服原生团战伤害采集

2026-10-20：用户选择自研伤害采集，停止 League Broadcast 后端接入路线。RiftCast 不增加该程序或 SDK 依赖。

## 当前证据

研究对象为本机国服 `16.20.824.8524` 客户端的已有只读样本。
EXE SHA-256：`EE3C887B4579AEAB12CA77B2A43CC1CC3411A8AA30BC43D2DFEA856F6CE497C8`。
以下地址均为这个构建的 RVA 或结构内偏移，尚未用于生产伤害输出。

通过客户端类型信息与函数引用定位：

- `PKT_S2C_HeroStats_s` 处理函数 RVA `0x2cba10`，调用统计更新函数 `0x2ed660`。
- 更新函数读取全局英雄统计管理器：RVA `0x1ee9418`。
- 管理器 `+0x30` 为按标识键索引的树。节点键在 `+0x20`，统计对象指针序列的起止地址在 `+0x28`、`+0x30`。
- 统计对象构造函数 RVA `0x274a00` 明确关联下列字段名称。

| 字段 | 字段对象偏移 | 候选值偏移 |
| --- | --- | --- |
| TOTAL_DAMAGE_DEALT_TO_CHAMPIONS | 0x12b8 | 0x12d8 |
| PHYSICAL_DAMAGE_DEALT_TO_CHAMPIONS | 0x12e0 | 0x1300 |
| MAGIC_DAMAGE_DEALT_TO_CHAMPIONS | 0x1308 | 0x1328 |
| TRUE_DAMAGE_DEALT_TO_CHAMPIONS | 0x1330 | 0x1350 |
| TOTAL_DAMAGE_TAKEN | 0x1358 | 0x1378 |

这些证据确认字段存在及更新入口；**局内更新频率、数值类型、选手对应关系和回放跳转行为仍需真实回放验证**。
累计字段只有在确认持续更新后才能用于团战区间差分。

## 验证工具与下一步

本地研究工具位于忽略目录：

- `verification-output/release-1.1.2/research/static_stats.py`：已有客户端样本的静态引用与反汇编检查。
- `verification-output/release-1.1.2/research/probe_native_stats.py`：构建哈希校验、十英雄检查、限定树节点与对象数量的只读探测。

真实回放验证需记录：

1. 十名英雄与统计条目的对应关系，核对名称、队伍及 K/D/A。
2. 团战前后累计伤害增量，分项与总量一致性。
3. 暂停时的稳定性，回放跳转及重开后的重置行为。
4. 样本失效、读取失败、版本不匹配时保持“未知”，避免显示伪造的零伤害。

验证通过后加入现有 `observer-reader.cs`，经 `mergeObserverTelemetry` 接入 `damageStats`，由 `shared/combat-display.ts` 按实际切入团战场景的时间累计。

## 本次第三方便携版清理状态

League Broadcast 进程已关闭。自动审批阻止递归删除，便携版 ZIP、解压目录及本次创建的 BlueBottle 配置目录尚未移除。仓库中的后端探测脚本已移除；未安装 SDK 依赖，未将第三方程序加入发布包。
