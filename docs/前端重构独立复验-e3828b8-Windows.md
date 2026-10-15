# e3828b8 Windows 有界独立复验

**本批小播放器与更新控件入口通过独立复验，已测范围没有产品新失败。上一轮 live / BP 小播放器 P2 字级优化目标达到；真实 Windows 原生合成、安装、摄像头、节目混音和录制仍未运行，本报告不能作为完整 Windows Release 验收。**

本次受测实现固定为 `new@e3828b807774af2ee7ae9af18f383c8fb8b66f12`，版本 `0.7.0`。独立副本为 `E:\codexdata\lolob-release-20261014`；构建在 2026-10-14 中断前实际通过，2026-10-15 接续完成以下新验证。主源码树随后产生的文档提交或候选版本不计入受测 SHA。239 个受保护实现文件的 SHA256 在前后守卫中完全一致，独立副本实现无 Git 差异；[最终源码守卫](evidence/sol-e3828b8-windows/source-final.json) 与 [证据 SHA256 清单](evidence/sol-e3828b8-windows/evidence-manifest.json) 可核对。

环境为 Windows x64 `10.0.26200.0`、Node `24.12.0`、npm `11.6.2`、已有 Chrome `155.0.8059.40` 和 Codex 自带 Playwright。[环境记录](evidence/sol-e3828b8-windows/windows-environment.json)。全部 fixture、服务状态、上传文件和临时目录位于独立副本的 `verification-output` 下，均保留。结束时本次隔离服务已关闭；未接触用户 OBS 配置、真实用户数据、录像、驱动、UAC、重启或平台推流。

## 实际执行与结果

下列命令均在独立副本运行。自编脚本位于主源码树的 `docs/evidence/sol-e3828b8-windows`，通过受测根目录导入独立副本依赖；产品实现没有为验收增加旁路。

| 实际命令 | exit | 本批结果与证据 |
| --- | ---: | --- |
| `npm.cmd run build` | 0 | TypeScript + Vite，1695 模块，主包 534.94 kB；保留 >500 kB 提示。[日志](evidence/sol-e3828b8-windows/logs/build.txt) |
| `node E:\codexdata\lol导播软件\docs\evidence\sol-e3828b8-windows\readability.mjs`，`SOL_QA_PASS=readability-final` | 0 | 22 项通过、0 失败、页面异常 0；18 张三尺寸 live/BP 与 3 张逐像素透明证据。[结果](evidence/sol-e3828b8-windows/readability-final/result.json)、[日志](evidence/sol-e3828b8-windows/logs/readability-run-final.txt) |
| `node E:\codexdata\lol导播软件\docs\evidence\sol-e3828b8-windows\controls-transactions.mjs` | 0 | 8 组通过、0 失败、页面异常 0；实际控件与真实 HTTP/WS/持久化，设备接口明确模拟。[结果](evidence/sol-e3828b8-windows/controls-first/result.json)、[日志](evidence/sol-e3828b8-windows/logs/controls-run-first.txt) |
| `node E:\codexdata\lol导播软件\docs\evidence\sol-e3828b8-windows\boundaries.mjs` | 0 | 归属交换/撤回/恢复自动与 GAME 5 稳定归属两组通过。[结果](evidence/sol-e3828b8-windows/boundaries-final.json)、[日志](evidence/sol-e3828b8-windows/logs/boundaries-run-final.txt) |
| `npm.cmd run verify:frontend-safety` | 0 | 正式原脚本 15 组通过、页面异常 0；草稿、重验证、同场景 TAKE、低高度应急控制。[结果](evidence/sol-e3828b8-windows/frontend-safety-result.json)、[日志](evidence/sol-e3828b8-windows/logs/frontend-safety-run.txt) |
| `node --import tsx --test server/bottom-scoreboard.test.ts server/program-draft-isolation.test.ts server/program-roster-isolation.test.ts server/program-render-isolation.test.ts server/virtual-camera-driver.test.ts server/virtual-audio-driver.test.ts` | 0 | 34 通过、0 失败、0 跳过；包含此前缺归档/非 Windows 的三项环境失败对应模拟分支。[完整日志](evidence/sol-e3828b8-windows/logs/targeted-tests.txt) |
| `node --check scripts/verify-custom-scenes.mjs`、`node --check scripts/verify-release.mjs` | 各 0 | 仅语法，不加载或执行集成流程。[记录](evidence/sol-e3828b8-windows/windows-scripts-syntax.json) |

正式安全脚本设置 `RIFTCAST_EXPECT_SOURCE=e3828b807774af2ee7ae9af18f383c8fb8b66f12`，并显式选择上述 Playwright 与 Chrome。`TEMP` / `TMP` 指向独立副本 `verification-output/sol-e3828b8-windows/formal-temp`；针对性单测另用同级 `unit-temp`。启动隔离服务时使用 loopback 随机端口、`ENABLE_LAN=0`、`RIFTCAST_AUTO_CONNECT=0`、`RIFTCAST_OBS_AUTOSTART=0`、`RIFTCAST_OFFLINE=1`、`RIFTCAST_OBS_MODE=external`。自编 harness 还拒绝真实设备操作，并给引擎接受结果加明确模拟边界。

本批没有重复整个 `npm test` 或所有历史正式脚本。两份驱动测试源码已完整检查，外部程序执行器全部注入模拟；测试只校验归档、固定脚本文本、调用/回读逻辑和 fixture 文件，不启动 PowerShell、安装器或真实驱动。官方 Pack45 归档由父线程按既有准备脚本取得后提供；归档存在不证明驱动音画行为。

## 小播放器、几何与透明

普通、压力、缺数据各包含 live 与 BP 的 1920×1080、1280×720、640×360，共 18 张新采样。压力数据包括中英文长姓名、四位补刀 `1234`、KDA `12/34/56`、就绪/未学习/45 秒冷却三种大招状态、未锁定预选、第五局四局历史。普通 BP 验证已锁定，压力 BP 验证预选与待选，缺数据 BP 验证选择中与待选。

| 实测字段 | 1920×1080 | 1280×720 | 640×360 |
| --- | ---: | ---: | ---: |
| live 姓名 | 24 px | 16 px | 8 px |
| live CS | 24 px | 16 px | 8 px |
| live KDA | 21.6 px | 14.4 px | 7.2 px |
| BP 状态 | 24 px | 16 px | 8 px |
| BP 历史局号 | 24 px | 16 px | 8 px |

三种尺寸、三类数据下，五行 `.lb-pair`、外框 `.lb-scoreboard`、两侧 `.lb-feed` 和 `.lb-patch` 相对同状态历史几何契约的 x/y/宽/高最大差值均为 **0 CSS px**；外框与五行背景均为 `rgb(0, 0, 0)`。BP 卡片区域几何差值同为 0。历史测量仅作为保护契约，所有当前测量与截图均重新执行，未拿历史截图作为本轮结果。CS/KDA 同时检查 DOM 滚动宽度与实际字形 Range 宽度，没有数字溢出；长姓名按现有省略策略保留标题原文。

三种尺寸的 18 个节目样本逐个比较深浅操作主题下全部后代与伪元素的颜色、字体、透明度、尺寸与位置，均一致。另实际切换工作台外观控件，独立输出页的节目样式仍保持。团战节目内文为空，分别检查 2073600、921600、230400 个像素，**非透明像素均为 0**。[1920 alpha PNG](evidence/sol-e3828b8-windows/readability-final/teamfight-1920-alpha.png) 保留可直接逐像素复核。

普通与压力 live 每帧 **130 个图像成功解码**：10 英雄图标使用仓库 `/champion-art/*-icon.webp` 本地素材；70 装备/饰品、20 召唤师技能、20 符文、10 大招图标使用显式合成 PNG/元数据响应，均有 `complete=true` 与 `naturalWidth>0`。它验证填满全部图标槽后的排版与解码，不证明官方在线装备/符文/技能资源链。缺数据样本保留未知占位，不补造图标。正常空 live TAKE 被真实服务以 400 拒绝；其后缺数据 live 画面使用明确注入的“已播但信号缺失”合成节目快照检查降级排版，不能写成合法空数据切入。

人工按原尺寸审阅三类数据的全部六张 640 图，并查看压力 live 1920、压力 BP 1280。姓名、CS、状态和历史局标比上一轮测量值有实质提升，KDA 完整保留斜线；没有扩大黑底或卡片换取空间。640 的 7.2–8px 仍属紧凑辅助文字，本轮将上一项 P2 字级修复列为通过，真实游戏捕获与 Windows DPI 显示继续等待原生阶段核验。

可直接查看 [普通 live 640](evidence/sol-e3828b8-windows/readability-final/normal-live-640.png)、[压力 live 640](evidence/sol-e3828b8-windows/readability-final/pressure-live-640.png)、[压力 BP 640](evidence/sol-e3828b8-windows/readability-final/pressure-draft-640.png)、[缺数据 live 640](evidence/sol-e3828b8-windows/readability-final/missing-live-640.png)、[缺数据 BP 640](evidence/sol-e3828b8-windows/readability-final/missing-draft-640.png)。底色来自浏览器截图显示条件；没有游戏或 OBS 画面合成结论。

## 两份 Windows 脚本与必要安全回归

先完整阅读脚本副作用及业务断言，再以实际 React 控件执行明确模拟验证。`verify-custom-scenes` 的“新建场景→上传→添加来源→应用窗口→刷新主机来源→选择→添加窗口→保存到待播”、实际画布定位、节目引用提示和确认删除禁用均走通。图像上传、场景保存与磁盘状态真实；窗口枚举与引擎接受合成，没有真实捕获像素。

`verify-release` 的“连接与输出→声音”定位限定于当前 tabpanel，音乐上传/播放/暂停请求均走向正确接口，隐藏导播台未抢定位。输出路径查看没有发目标修改，显式“设为下一次输出”才应用；新本机录制按钮、工作台外观入口和 Program 伴侣路径均可达。此处音乐、录制、设备和输出回执全部模拟，不涉及真实声音或文件录制。已人工查看 [来源工作面](evidence/sol-e3828b8-windows/controls-first/custom-source-controls.png)、[声音工作面](evidence/sol-e3828b8-windows/controls-first/scoped-music-controls.png)、[浅色输出](evidence/sol-e3828b8-windows/controls-first/output-controls-light.png) 和 [丢回执核对](evidence/sol-e3828b8-windows/controls-first/record-lost-receipt.png)。

只读对比 `d6d33ee` 与受测脚本，custom 断言调用由 20 增为 21，release 由 42 增为 43；结合全文核对，真实窗口像素、PGM/PVW、快照、持久保存、关闭窗口失败保旧节目、删除保留素材、原生 EXE/DLL、音乐、摄像头帧、伴侣音画失败、录制独立停止、退出提示和重启恢复断言保留。[审计记录](evidence/sol-e3828b8-windows/controls-first/script-audit.json)。计数只作辅助，未将静态存在等同执行通过。

必要回归结果如下：

- 保存待播不改变 PGM；同场景再 TAKE 才发布；正式安全脚本验证真实画面英雄保持、明确重切后改变。
- 实际 HTTP 验证两名选手英雄归属交换保存仍待播、TAKE 发布、撤回/重做恢复对应画面；清除手动映射后恢复自动仍等待 TAKE。对应模块单测另外覆盖新采集、失败准备保旧身份、个人焦点与更晚终局归档快照的隔离。
- GAME 5 四局历史在第 2/4 局交换蓝红，40 个实际英雄 alt 与稳定战队所属列表逐项一致。
- 同回合两次原生 `click()`、真实指针双击、在途切管理分类，各只发一次保存、增加一条记录。真实服务已提交后故意丢 HTTP 回执，再用原请求 ID/版本/标题重试，仍只保留一条；原请求对象逐字段一致。
- 五席真实身份验证、非持有者无 TAKE、5 条真实越权请求被拒绝；关闭真实控制 WebSocket 后字幕输入禁用且草稿保留，重验证后可用。正式安全脚本另验证重启失效席位、旧连接晚回执不能解锁、新邀请恢复不自动写入。
- PGM 与串联单引用的 custom 删除确认均禁用，真实 API 拒绝。上传素材留在隔离副本，没有为通过测试删除素材或真实数据。

## 原始失败与修正分类

本批全部首次失败结果、截图与日志保留，业务断言未删除，没有增加 skip、放宽权限或修改产品来消除失败。

| 原始执行 | 原结果 | 分类与后续 |
| --- | --- | --- |
| 小播放器首启 | exit 1，Windows `ERR_UNSUPPORTED_ESM_URL_SCHEME` | 验收 harness 使用盘符路径传入动态 `tsImport`；改为 file URL。[原始日志](evidence/sol-e3828b8-windows/logs/readability-run-first.txt)、[原 helper](evidence/sol-e3828b8-windows/logs/harness-first.mjs) |
| 第二轮采样 | exit 1，13 通过/9 失败 | 压力 BP 误与无预选条普通样本比几何，改为同条件压力契约；图标 fixture 的 `items` 被 seed 自带 `itemSlots` 优先读取。[原结果](evidence/sol-e3828b8-windows/readability/result.json) |
| 第三轮采样 | exit 1，16 通过/6 失败 | 几何已通过，诊断确认每帧仅 110 图像、部分装备空槽；显式填充 7 个 `itemSlots`，最终加强为精确 130 图像与分组解码断言。[原结果](evidence/sol-e3828b8-windows/readability-third/result.json) |
| 追加身份边界首轮 | exit 1，1 通过/1 失败 | 测试把已接受且锁定的手动归属与恢复自动混在同一输入，错误预期客户端英雄覆盖锁定映射；原始 `LeeSin != Gwen` 保留。先通过真实动作显式解除映射，再验证纯自动来源；原有 Gwen 断言保持。[原结果](evidence/sol-e3828b8-windows/boundaries.json) |

最终小播放器 22/22、控件事务 8/8、追加边界 2/2、正式安全 15/15、针对性单测 34/34。所有最终浏览器运行页面异常均为 0。上述失败定位在验收输入/测试环境边界，当前没有需要 Astra 修改产品实现的新发现。

## 保持未运行与下一阶段

`verify:custom-scenes` 原脚本会启动真实独立 OBS、可见窗口 fixture 和窗口捕获，随后操作 PGM；`verify:release` 会启动包内 Electron/OBS、调用摄像头注册复用接口、启动伴侣音画、读取实际虚拟摄像头并本机录制。因此两条原脚本均保持 **未运行**，等待父线程在具体新产物与隔离目录明确后取得限定授权。

其余未运行：安装/升级/卸载留数据、便携包运行、Windows 原生 HWND/DPI/遮挡与最小化、真实 LoL/LCU/OCR、物理手机软键盘及生命周期、真实窗口/共享 OBS 合成、最终音轨1、VB-CABLE 实听、伴侣与观众端。当前机器安装隔离条件与旧版本登记由父线程单独评估，本报告没有更改相关状态。新候选包、版本与最终构建 SHA 应另记；本次基线结果不直接覆盖后续版本变更或产物运行。

本轮 Sol 只增加报告、独立验收脚本和证据；未修改实现、版本、main、tag/release，未提交或推送 Git。下一阶段可据此推进候选版本的一致性核对、正式 Windows 构建和产物只读审计，再按允许范围执行实机验收。
