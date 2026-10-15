# RiftCast 0.8.0-rc.3 Windows 发布验收

2026-10-15。正式 Windows 构建、Sol 独立产物 7/7、现有设备可用分支的随包原生 17/17，以及极短录像的只读元数据和静音视频解码通过。临时默认录音切换已精确恢复，render 保持，owned 进程退出。安装/升级/卸载隔离仍阻塞，长录制、最终音轨实听和真实平台观众端尚未验证，保持 Windows 候选版结论。

发布状态：[v0.8.0-rc.3 Release](https://github.com/QShin21/lolob/releases/tag/v0.8.0-rc.3) 已公开为候选 pre-release。父线程 API 回读确认 ID 413608496、draft=false、prerelease=true，published_at=`2026-10-15T09:18:38Z`（上海 2026-10-15 17:18:38）；`refs/tags/v0.8.0-rc.3` 精确指向 commit `eab48e23e624c47fe511dbdefd064f6a6d1fe505`，与二进制 sourceRevision 相同。六资产 ID、字节数与 SHA-256 digest 均未变，逐项与本地产物一致；latest stable v0.4.1 保持。发布后对 Setup 和 ZIP 的匿名 asset 请求使用 Range 0-0，各 exit 0、HTTP 206、返回 1 字节 application/octet-stream、重定向 1 次，确认公开资产实际可取；没有二次完整下载，完整字节一致性依据仍为本地 hash 与官方 ingestion digest。

独立结论见 [Sol 产物与原生签认](前端重构Sol独立产物与原生验收-0.8.0-rc.3-Windows.md)，原字节证据见 [证据 SHA 清单](evidence/sol-release-windows/evidence-manifest.json)。本报告整合交付事实，独立测试与签认由 Sol 完成。

实现与针对性修正由 GPT-6 Astra max 完成，独立验收由 GPT-6.1 Sol max 完成。实现自审、语法检查、编译结果和历史版本结果均按范围单列。父线程统一审核、提交、推送和发布。

## 构建来源与发布状态

| 项目 | 已确认事实 |
| --- | --- |
| 候选版本 | `0.8.0-rc.3` |
| 生成二进制的源码提交 | `eab48e23e624c47fe511dbdefd064f6a6d1fe505` |
| 构建检出 | `E:\codexdata\lolob-release-20261014`，clean detached HEAD 固定上述提交 |
| 正式入口 | `npm run release:win`，exit 0 |
| manifest 工作区状态 | `workingTreeDirty=false` |
| manifest 源码文件数 | 2207 |
| sourceDigest | `5bbf66d75b9c383d5608fc56e6a6f749a1efd3514cd6389a92b7a44c0d10ee3e` |
| 主分支保护 | main 保持 `7f2f39981b7e91d33d6d32e47d1c2003f2c81296`；本轮工作在 new |
| RC3 Release | 见文首发布状态；创建草稿和上传六资产阶段 gh create exit 0，ID `413608496` |
| 既有候选 | RC1、RC2 原有说明和六项 draft assets 保留，不覆盖 |
| 稳定版 | 本轮候选验收时 latest stable 为 v0.4.1；RC3 使用 pre-release |
| 报告提交与包来源 | 本报告和独立证据在 new 的后续文档提交归档，其提交由本文件 Git 历史确定；二进制 build source 固定 eab48e2 |

上述源码元数据已从 RC3 实际 `release-manifest.json` 复读。字节数和 SHA-256 使用正式构建记录及父线程逐项核验结果。原始构建日志保留在同目录 `release-win.txt`、`release-win-exit.txt` 和 `build-report.json`。

## 本次产物

产物位于独立检出的 `release/0.8.0-rc.3/`。GitHub 使用说明资产已以 `README-zh-CN.md` 上传，显示标签“使用说明.md”；本地产物文件名仍为 `使用说明.md`，内容与 hash 保持一致。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `RiftCast-0.8.0-rc.3-Setup-x64.exe` | 290409455 | `2dda5ff00d7ce86b1e3139de12c01ce9bcb2ed774d8ddcfcdc72f94e80a35210` |
| `RiftCast-0.8.0-rc.3-Windows-x64.zip` | 389572247 | `eb10d8e1a827f335c1ebb982794a71e23316f19238af06b15ca89de97f106d32` |
| `RiftCast-0.8.0-rc.3-Setup-x64.exe.blockmap` | 301196 | `b2f527b521faa99bcb825c826466b810f17a9f09087f57fe92e8ccc7927cdf39` |
| `release-manifest.json` | 284169 | `7d483ba24f10b65a755350942650631b100202801c4338c86c82299fd86daae4` |
| `SHA256SUMS.txt` | 311 | `624faa61168674ab7ef793e9b1bf15fb7adb93fa076bff8f3ba3e9081da187c6` |
| `使用说明.md` | 13044 | `8bad6196bc8dc92e5451bb2a1b6891b80fc407454c67ae331a5fa742f7a1cfd7` |

父线程对本轮 Setup 与随包 `RiftCast.exe` 实际执行签名查询，均为 **NotSigned**。官方 Electron 归档哈希、产品文件哈希和 Authenticode 签名分别记录；归档匹配不能替代签名。

## 分版本验证矩阵

| 受测对象 | 已完成结果 | 边界 |
| --- | --- | --- |
| e3828b8 独立基线 | 构建 exit 0；可读性 22/22；控件、记录事务和五席 ACL 8/8；身份与历史边界 2/2；正式前端安全 15/15；六组测试 34/34，0 失败、0 skip | React/HTTP/WebSocket/浏览器与 fixture 范围，设备回执及相关驱动行为有模拟；239 个受保护源码文件前后 hash 一致 |
| RC1 产物 | Sol 7/7 | 安装包解包、归档和模块/来源核验；没有执行 NSIS |
| RC1 受限桌面操作 | Sol 3/3，页面异常 0、设备准备请求 0、OBS 启动 0 | 版本/菜单、保存待播不改 PGM、退出及重启数据保留 |
| RC2 正式构建和产物 | 构建 exit 0；Sol 7/7 | 来源 daddc81，独立版本产物；六个 draft assets 已上传并与 API digest 一致 |
| RC2 真实 custom | 9/9，页面异常 0、blockedRequests 0 | 实际 OBS 32.2.2，专用窗口像素、PVW/PGM/TAKE 和关闭保护；fixture 保留，owned OBS 已退出；该脚本无录制 |
| RC2 随包音乐诊断 | 正向等待后的诊断副本确认 HTTP 201、真实 ffmpeg_source、默认暂停和播放/暂停 | 原始失败与诊断副本分开保留，未宣称完整随包验收通过 |
| RC2 伴侣与录制 | 环境阻塞及尾部失败保留 | CABLE 默认 capture 触发回采保护；独立尾部开始录制收到 busy 400，未产生录像 |
| RC3 正式源码自审 | Node 语法与 diff 检查通过；版本同步完成；依赖锁图保持 | 实现方自审，不计作独立验收 |
| RC3 独立静态核验 | Sol 已核对 515 项依赖及根对象、原 47 处 assert 调用保留和 HTTP 201 新检查、66 个文档链接；产品实现 delta 0 | 仅当前版本/说明和 QA 同步修正；不代表实际设备通过 |
| RC3 正式构建 | exit 0，clean eab48e2，2207 sourceFiles | 已生成本表六项本地产物 |
| RC3 产物独立审核 | Sol 7/7，failures=[]，exit 0 | fresh RC3 source=eab48e2；父线程复读 artifact-audit.json 和 16:55:48 完成记录，与 RC1/RC2 分开 |
| RC3 capture wrapper | Sol 独立六个 VM 场景审核及实际执行通过；BSQt8k child exit 0、restorationVerified=true、恢复错误 0 | 六角色精确恢复、三个 render 保持；首次 J3lSkE 前置失败和安全恢复原件保留 |
| RC3 完整随包原生 | 正式 runner 在现有设备可用分支报告 17/17 组，exit 0、errors 0、blockedRequests 0 | 保留原 47 处 assert 调用并新增上传 HTTP 201 检查；设备不可用分支本轮未触发，48 处调用总数不代表每个分支均实际执行 |
| RC3 录像只读后验 | exit 0，0.133 秒 MKV 元数据及静音视频解码通过 | 极短功能样本，不含长录制、真实声音回放或最终混音实听结论 |
| 安装、升级和卸载留数据 | 阻塞 | 无可用独立用户/VM 安装环境；本机有旧 0.5.0 登记，未运行 NSIS |
| 直播伴侣实听、口型、最终观众端、真实手机、LoL/LCU/OCR | 未运行 | 图像、设备状态和本地输出回执均不能补足这些现场验证 |

基线完整报告为 [e3828b8 Windows 独立复验](前端重构独立复验-e3828b8-Windows.md)。Sol 原始证据按 allowlist 归档于 `docs/evidence/sol-release-windows/rc1`、`rc2`、`rc3`；保留原字节与 SHA 清单，scoped attributes 识别 Windows CRLF 并避免 Git 换行转换破坏 hash。不得复制完整 fixture、配置、OBS WebSocket 密码、会话或录像到公开证据。

## RC2 失败与 RC3 最小修正

RC2 首次音乐组超时，没有生成音乐文件和 OBS 音乐输入。诊断揭示两项测试时序问题：`connected=true` 早于 OBS 初始化完成，inputs 为空、摄像头状态未确认时读取录制目录返回 207；Playwright `setInputFiles` 可向 disabled 控件触发上传，服务真实返回 busy 400。

RC3 正式 `verify-release.mjs` 等待受管 HUD、桌面声音、解说麦克风及确认的摄像头状态，再读取录制目录；音乐组等待 scoped 文件输入 enabled，并断言上传响应 HTTP 201 后继续原 available/play/pause 断言。原 47 处 assert 调用全部保留，没有新增 skip，没有改服务权限或 OBS 产品互斥；本次执行范围按可用设备分支的实际报告记录。

后续 RC2 伴侣启动因三个默认 capture 角色均为 CABLE Output 被产品回采保护拒绝。默认 render 为 P275MV PLUS。独立尾部补验在正常 enabled UI 点击录制后收到 busy 400，未录制，原失败保留。摄像头 probe 与失败日志存在时间关联；5 秒窗口枚举、原生 monitor 元数据路径也具有源码可确认的排他竞争窗口。由于没有完整请求时序，首因仍待验证。本阶段未为这些候选改变产品行为或加入盲重试。

## 授权、隔离与 capture 恢复

用户原授权：“允许隔离原生验收；禁止驱动安装、注册、UAC、重启和真实推流。”其后单独授权：验收期间仅将三个默认录音角色从现有 CABLE Output 临时切到现有 EMEET Mic，结束后逐项精确恢复原 ID，三个默认播放角色保持。Sol 为唯一实际设备操作人。

本轮使用独立 APPDATA、LOCALAPPDATA、TEMP、TMP、userData 和 OBS runtime/config。`ENABLE_LAN=0`，明确 fixture 游戏窗口目标，禁止导入真实项目数据。正式随包验收必须带 `--reuse-drivers-only`，Node 和浏览器请求 guard 拦截准备/安装/注册与 start-stream；要求现有摄像头注册和 CABLE 状态，设备缺失如实失败。录制前通过 OBS 实际 `GetRecordDirectory` 与 realpath 核对 fixture 的 `user-data/data/videos`，录制与诊断文件保留。

独立 capture helper 仅允许 role 0/1/2 和 active EMEET/base-CABLE capture，拒绝 render 目标。wrapper 先保存六角色，再逐项切换并读回；运行期间只读监视，finally 逐项尝试恢复，最后六角色精确比对。启动前将 clean exact source 与包内 manifest/package 绑定。诊断写失败不阻断其余角色恢复。强制杀进程或断电无法保证 finally，必须凭保留的 before 快照核对和恢复，不能把未确认恢复写成通过。产品旧 restore-defaults 无法反向恢复 CABLE，未用其替代此次闭环。

首次真实 wrapper 前置 `capture-defaults-J3lSkE` 观察到 Windows 将 role0 设置联动到 role1；原 wrapper 要求下个角色必须仍为原值，因而拒绝继续。RiftCast 和 OBS 均未启动，childResult=null；finally 六角色精确恢复、render 保持，恢复 errors=0。此原始失败保留。Astra 仅修正 ignored wrapper：当前角色可为原 ID 或本次唯一授权的 EMEET target；已是 target 则记录 `already-target-role-N` 并跳过重复写，未知端点仍拒绝。纯 VM 直接运行实际 wrapper，模拟联动及反向恢复，child exit0/exit1 两种情况均验证三 target 后才启动、role1 无重复写、render 保持和六角色恢复；此为实现自检。产品、RC3 包和正式 runner 未变。

Sol 对修正后的 wrapper 独立完成六种 VM 场景，并实际执行 `capture-defaults-BSQt8k`。正式原字节 runner 在现有设备可用分支报告 17/17 组、exit 0、errors 0、blockedRequests 0。其 AST 保留原 47 处 assert 调用并新增上传 HTTP 201 检查；条件分支中的调用并非全部在此设备环境执行，设备不可用分支本次未触发。wrapper child code 0、restorationVerified=true、恢复 errors=0；六个原默认角色精确恢复，三个 render 保持，owned RiftCast/OBS 进程数 0。没有产品或正式源码修正。

实际 OBS Virtual Camera 读回 1920×1080 图像：15 帧时蓝色样本 24/79/146，待播修改后 40 帧仍为蓝色，TAKE 后 50 帧红色样本 162/25/34。并行录制、停止、退出确认、按住停止、配置 RTMP 目标后返回伴侣、duplicate、关闭、重启与设备快照均通过；没有真实 start-stream。RC2 独立尾部 record busy 400 在本轮完整正式流程没有复现，原始失败继续保留，其首因没有新增归因证据。

唯一 fixture 录像保留，为 77063 字节 MKV，SHA-256 `7ba376c5432c713f0c5709e6ca4309dfe1b465961797738cfc6a4eb656a66aa1`。Matroska EBML 时长 0.133 秒，包含 H.264 1920×1080 和 AAC 48 kHz 双声道。既有 Chrome 使用静音、volume=0 实际解码 3 帧、收到 2 次帧回调，中心红色样本 187/28/40；只读后验 exit 0。首次 file:// canvas 同源限制记录保留，改为仅该 fixture 的 loopback 只读 viewer，没有放宽浏览器权限或安装工具。此样本非常短，只验证功能性文件与视频解码，长录制和最终音轨实听未验。

本轮不运行 NSIS，不改真实 OBS 配置，不安装/注册驱动，不触发 UAC，不重启，不真实推流，不删除真实录像。停止伴侣恢复托管监听和音轨；OBS 受管采集源钉到实际端点的选择按产品预期保留。恢复默认录音角色与恢复 OBS 音轨/监听分别验收。`companionAudioVerified` 原有字段继续按实证解释，active 或图像不作为最终混音实听证明。

## 发布与归档边界

父线程统一创建和公开候选 Release、核对 tag、远端 new/main 与六资产 API digest，并提交本报告及脱敏证据。本轮 package、依赖锁、产品源码和已经封装的 `Windows-Release-0.8.0-rc.3.md` 保持 eab48e2 的原字节；无需为纯验收报告重新构建同一包。封装指南中的“待验”描述保留为构建时快照，当前实测以本报告和 Sol 独立签认为准。

证据归档使用精确前缀的 `.gitattributes` 保留 Windows 原始 CRLF；默认空格检查继续启用，不能通过转换日志换行或删失败记录使检查通过。父线程 stage 后，Sol 已独立核对 134 项证据及 manifest 共 135 个 Git index blob，原字节大小与 SHA-256 全部一致，索引核验 exit 0。公开仓库仅接收 allowlist 中的报告、必要日志和截图，不含用户赛事、完整 fixture/config、OBS 密码、会话或录像。原始 fixture 和录像保留在本机验收目录。

本轮完整原生未发现需新增产品修复的失败。RC2 尾部 busy 400 保留为待归因历史失败，RC3 完整运行未复现；安装隔离、长录制、最终音轨实听和真实客户端/手机/平台观众端仍待后续现场验证。RC1/RC2 草稿和资产均保留，main 不改，不覆盖 tag 或 Release。
