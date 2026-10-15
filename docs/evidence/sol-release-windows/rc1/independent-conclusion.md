# Sol 独立产物与安全启动结论：0.8.0-rc.1

受审构建源为 `7b1234e8c336a1454e5bad1928f042262368dec2`，sourceDigest 为 `09df3e8e7bb2a741dee1519214f60ff457b6bbd4149a7ab0de89e43422dbbff4`。本阶段独立产物审核最终 7/7 通过，真实包内安全界面启动 3/3 通过；没有产品代码新失败。完整首次失败记录、脚本、截图和日志全部保留。后续源文档 tip 与此构建 sourceRevision 分开记录。

| 产物 | 字节 | SHA256 |
| --- | ---: | --- |
| Setup | 290409352 | `77c3c8766f7a4e2b44856214d00622807710dc85d721a1f2a454d9d4a9da31de` |
| 完整 ZIP | 389572132 | `d93276c329ea88c5de6840428ef9cfe4c1106f3d1684d7f020f90319c8d587ad` |
| Setup blockmap | 301120 | `147489944e3bc6c5adff4dac4e4a811683230db6738d52b82eafe5608e7cda1b` |

`artifact-audit.json` 的 7 组结果：2204 个源码文件和摘要、clean sourceRevision、产物大小/校验和一致；Setup/ZIP/NSIS 内层归档通过 7-Zip test，归档路径无穿越；包元数据和同目录说明与源码一致；5 个服务外部依赖全部从解压目录内解析，sharp 0.35.5 的 Windows x64 `.node` 实际加载并生成 3×2 PNG；OBS 32.2.2 标记、5 个关键 runtime 文件、完整对应源码、VB-CABLE 原归档、自有 native 源码/二进制哈希与 GPL/来源说明一致；主程序/OBS/自有 helper/audio 组件均为 AMD64，NSIS 安装壳为正常 I386；未混入用户 data、OBS config、fixture、音乐或录像。

ZIP 实际 7067 个文件，NSIS payload 与打包完成的 win-unpacked 各 7068 个文件。首轮要求三树完全一致，exit 1；精确差异只有 `resources/elevate.exe`（107520 B，SHA256 `9b1fbf0c11c520ae714af8aa9af12cfd48503eedecd7398d8992ee94d1b4dc37`）。独立读取锁定 app-builder-lib 26.15.3 源码后确认，NSIS `packElevateHelper` 默认为 true，复制动作与 `allowElevation: false` 的安装器 define 分开；缓存原件、NSIS payload 和 win-unpacked 中该 helper 字节完全一致。最终断言限定仅此一个来源明确的目标差异，其余 7067 文件逐项字节一致。保留 `artifact-audit-first.json`、`audit-artifacts-first.mjs` 和首轮日志，未改包文件。ZIP 后续真实启动、保存及重启表明此次运行不依赖该 NSIS helper。

独立 `Get-AuthenticodeSignature` 实查：Setup、RiftCast.exe、自有 projector 和 elevate 为 **NotSigned**；OBS 的 obs64.exe 为 **Valid / OBS Project, LLC**。builder 的 signing stage 日志没有被当作已签名。详见 `signatures-independent.json`。

安全包内启动使用树外 `E:\codexdata\lolob-artifact-0.8.0-rc.1-rcnpYb\zip\RiftCast.exe`，全新专用 `safe-ui-userdata`，PATH 只保留系统目录；显式 `RIFTCAST_OBS_AUTOSTART=0`、`RIFTCAST_AUTO_CONNECT=0`、`RIFTCAST_OBS_MODE=external`、`RIFTCAST_OFFLINE=1`、`ENABLE_LAN=0` 及随机 loopback 端口。实际 `app.isPackaged=true`、应用/菜单/帮助/health 版本全部为 0.8.0-rc.1；保存自定义场景只待播、不改变 PGM，磁盘文件存在；正常关闭后重新启动仍保留该场景。前后 OBS 进程均为空，页面异常 0、禁止设备 POST 0、没有 TAKE。截图 `safe-ui-studio.png`、`safe-ui-help.png`、`safe-ui-restarted.png` 已人工查看。

首次安全启动 exit 1 为测试 locator 名称错误：测试写“帮助与诊断”，真实导航名称为“使用指南”。保留 `safe-package-ui-first.json`、`safe-package-ui-first.mjs`、`safe-ui-run-first.txt` 与失败截图，只修正测试定位，全部原断言保留；第二轮 exit 0、3/3 通过。`safe-package-ui.json` 的终态文字仍为 harness 使用的 `passed-so-far`，其三个检查及 shell exit0 均为最终通过，结果未人工篡改。

本阶段未运行 NSIS、真实 OBS、窗口捕获、虚拟摄像头、CABLE 混音或录制。原生授权到来后仍须先审阅新 guard 并用其对应的新候选源码/产物执行；RC1 的静态审核和安全启动不代替原生通过。没有驱动安装、注册、UAC、重启、真实平台推流或操作者数据修改。

本目录中的原始证据包括：`artifact-audit-first.json`、`artifact-audit.json`、`payload-sha256.json`、`installer-payload-sha256.json`、7-Zip 各次 log、`signatures-independent.json`、`safe-package-ui-first.json`、`safe-package-ui.json`、两次 safe-ui shell log/exit、三张成功截图与首轮失败图。源码完整性、依赖图和 baseline 复验记录另外保留，未重复执行无变化的完整测试。
