# Windows 打包与验收后续交接（只读核对）

2026-10-14，受测源码 `cbbcc7cb308bb1af20f4f7b4e12c2b417c6aea5f`，package 与 lock 仍为 0.7.0。本轮没有执行打包、创建工作流、发布 Release、安装驱动或更改账单。

## 现有路径与真实发布状态

本地仓库没有 `.github/workflows`；GitHub API 返回工作流总数 0、近期运行列表为空。公开仓库 `QShin21/lolob` 的默认分支为 main。当前远端 Release/tag 只有 `v0.3.0`、`v0.4.0`、`v0.4.1`，三个 Release 的 assets 都为空。本地 0.7.0 发布文档与 README 示例不证明已有公开 Windows 包；本轮没有下载或运行旧包。

真正构建入口为 `npm run release:win` → `scripts/build-release.mjs`，明确拒绝非 Windows x64。它校验/准备 Electron、官方 OBS 32.2.2、原生投影 helper、节目音频 DLL/设备工具及官方 VB-CABLE Pack45 归档，然后 TypeScript、Vite、服务端 esbuild，生成 manifest，调用 electron-builder，`publish: never`。

`electron-builder.cjs` 同时构建 x64 NSIS 安装 `.exe` 和完整便携 `.zip`，目录 `release/<package.version>`。安装是当前用户、可选目录、asInvoker，`allowElevation:false`、`runAfterFinish:false`、`deleteAppDataOnUninstall:false`。普通打包及安装包生成不需要安装音频/摄像头驱动；设备准备和真实软件运行属于另一个验收阶段。

随包文件是显式 allowlist：前端、服务、Electron、原生组件、OBS/VB-CABLE、许可证及对应源码。运行目录、个人赛事/照片/音乐/录像/恢复记录不应混入包。`afterPack` 校验依赖解析来自产物内，确认 sharp 原生库存在，避免“开发目录有依赖所以包看似可用”。

## 环境、权限与额度

- 构建机器：Windows x64、Node/npm 与锁文件匹配、Git、可联网取得锁定依赖和官方 runtime/source；tar.exe；原生组件需要时有兼容 MinGW-w64 g++、同目录 gendef.exe/dlltool.exe。脚本支持 `RIFTCAST_CXX`，默认候选 `C:\Strawberry\c\bin\g++.exe`。不能假定某个 runner 镜像一定有这些工具。
- OBS 归档规格当前是 187851583 字节，另需 Electron、解压 runtime、win-unpacked、安装/便携两产物和对应 OBS 源码的空间。此 Linux 环境缺所需 runtime，未测量最终包大小或实际磁盘峰值。
- 仓库读取 API 报告 admin/maintain/push 为 true，但当前集成读取 Actions 管理设置及用户 billing usage 均被 403 拒绝；所以不能用仓库权限字段推导当前令牌能改工作流、手工调度或读取剩余额度。没有尝试扩大授权或调整费用。
- 当前仓库公开，标准 GitHub 托管 runner 的执行分钟免费；更大 runner 始终收费，产物/缓存存储另有额度，不把整个交付笼统说成无成本。使用标准 Windows runner即可作为候选，不应为本任务购买更大 runner或重置账单。当前账户计划、剩余存储/预算和实际运行权限未获验证。[GitHub 官方计费说明](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- 如后续使用 CI，需能提交工作流文件及相应 Actions 执行权限；生成 artifacts 阶段只需读取源码，发布新 Release 阶段再授予 `contents:write`。当前没有现成工作流可“直接重跑”。`workflow_dispatch` 手工入口要求工作流在默认分支存在；本任务禁止本阶段写 main，后续应选择授权的新分支 push 构建路径或独立 Windows 机器，不为注册手工入口擅自改 main。[官方手工工作流说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

## 前置修正交 Astra

1. 先处理 [独立验收](前端重构独立验收-cbbcc7c.md) 中的 BP/实况小播放器字级，不移动受保护黑底/遮挡区域，交 Sol 重查。
2. 正式 `scripts/verify-custom-scenes.mjs` 和 `scripts/verify-release.mjs` 仍使用旧“新建自定义场景”“保存场景”等入口及旧输出表单。当前为“新建场景”“保存到待播”、新的输出路径按钮和工作面。它们包含真实 OBS/设备操作，本轮未运行；Astra 必须按实际界面维护定位并保留全部来源、快照、文件、原生、音画断言，不能只生成包后将旧脚本失败标成通过。
3. 最终新版本由父线程核对未占用 tag/release 后确定，不能覆盖旧版本或复活已删除的 v0.5。package、lock、应用读取与 README 保持一致；同步建立 `docs/Windows-Release-<新版本>.md`，否则构建末尾按版本复制说明文件会失败。当前仍为 0.7.0，不在此 QA 提交改版本。

## 可执行的构建步骤

在独立 Windows 目录检出最终获准源码；不要使用操作员真实项目的 data/runtime，不覆盖旧产物。下面命令是交接方案，本轮没有执行。

```powershell
# 在独立 Windows x64 检出目录运行，父线程填写最终源码 SHA。
$taskSource = 'cbbcc7cb308bb1af20f4f7b4e12c2b417c6aea5f' # 本轮已测起点；最终交付前替换成获准的新源码 SHA。
git checkout --detach $taskSource
git status --porcelain
$taskVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
if (Test-Path "release/$taskVersion") { throw '同版本产物目录已存在，请使用新的独立检出目录。' }
if (-not (Test-Path "docs/Windows-Release-$taskVersion.md")) { throw '缺少当前版本使用说明。' }
# 检查可用编译器；需要时设置已有编译器路径。
$env:RIFTCAST_CXX = 'C:\Strawberry\c\bin\g++.exe'
if (-not (Test-Path $env:RIFTCAST_CXX)) { throw '请选择兼容的 Windows x64 C++ 工具链。' }
& $env:RIFTCAST_CXX --version
npm ci
npm run release:win
Get-Content "release/$taskVersion/SHA256SUMS.txt"
Get-Content "release/$taskVersion/release-manifest.json" -Raw
```

构建后核对两个产物、对应 sourceRevision/sourceDigest、版本、所有 SHA256、许可证/对应源码与打包 allowlist；检查构建产生的 Git 差异。如果原生组件重建产生差异，manifest 不能虚报工作区干净，也不能把未审查的新二进制当成原提交。下载失败、哈希不符、sharp/工具链缺失均应保留错误，不能取消校验绕过。

## 构建与实机验收分开

可先做纯产物核验及独立用户目录的启动检查。`npm run verify:release` 当前会运行打包 Electron、真实随包 OBS、虚拟摄像头及音频相关流程；`scripts/install-local-release.ps1` 会安装到当前用户目录并可能启动/导入。不能在当前 Linux 或普通源码 UI 验收中直接执行。

Windows 补验需要拥有可交互桌面的隔离机器、已知且允许的音视频测试设备、权限明确的用户目录。首次应用启动、随包 runtime 准备、导入原文件保留、默认目录/便携差异、升级卸载留数据、原生 DPI/遮挡、音频恢复逐项记录。驱动安装/卸载、UAC/重启和真实平台送出仍须相应授权；不把 CI 打包成功、模拟设备或端点枚举称为观众端正常。

完整验证后才选择新 tag/release、发布两种新 Windows 产物与 manifest/checksum。保留所有旧 tag/release。当前阶段的缺口是没有 Windows 执行环境、两份真实验收脚本入口需维护、实机音画及设备权限尚未核验，不是已观察到的“额度用尽”；没有为此购买资源或暂停其他验证。
