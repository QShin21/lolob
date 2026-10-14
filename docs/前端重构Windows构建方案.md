# Windows 安装包与免安装包构建方案

2026-10-14，接续 `d6d33ee`，当前 package / lock 仍为 0.7.0。本文件准备后续构建执行，不表示已生成 Windows 产物。本轮小播放器实现须先交 Sol 针对性复验，之后才进入最终版本与发布。

## 当前能不能构建

**当前选中的环境不能运行仓库的正式 Windows 构建。** 这里只有 Linux x64、Node 24.19.0；`scripts/build-release.mjs` 在准备 runtime 前明确要求 Windows x64。`runtime/obs-studio`、VB-CABLE 归档、Windows Electron runtime 与 release 目录均不存在。没有另一个已连接、已选择的 Windows 执行环境。

现有 `obs-projector-window.exe`、`riftcast-audio-bridge.dll`、`audio-device-tool.exe` 的源码/二进制 SHA256 与各自 manifest 一致，可交 Windows 构建脚本复核并复用，不能把“二进制存在”当作已运行验证。见 [只读环境结果](evidence/astra-readability/windows-environment.json)。

仓库沿用锁定的 electron-builder 26.15.3、Electron 44.5.1 与 NSIS / ZIP 目标。electron-builder 官方说明跨平台打包与原生依赖编译存在不同条件；本仓库还包含 Windows helper、OBS 音频桥及明确的平台守卫，因此本任务不通过修改守卫或自造跨编译流程宣称 Linux 可打正式包。[electron-builder v26 官方说明](https://www.electron.build/v26/docs/features/multi-platform-build/)

上一轮只读 API 结果为：没有现成 Actions workflow / run，读取 Actions 管理与 billing usage 返回 403。本轮保留这一边界，没有改设置、创建工作流、申请长期 runner 权限、开通付费资源或重新试探被拒绝端点。远端 tag 重新只读核对仍为 v0.3.0 / v0.4.0 / v0.4.1；版本文件中的 0.7.0 不能当成已发布新产物。

## 采用的构建路径

优先使用已有、可用的 Windows x64 独立构建目录。若后续能使用原有权限下的标准 GitHub Windows 托管 runner，可作为一次性产物构建候选；当前并无已运行的 runner 或 workflow 可以直接接续。GitHub 的 Windows 托管 runner 是官方提供的 VM，具体工具应按实际 job 的镜像清单检查；不用更大付费 runner或新建持久自托管 runner来代替环境缺口。[GitHub 官方 runner 说明](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners)

实际构建入口保持 `npm run release:win`。脚本准备并校验 Electron、官方 OBS 32.2.2 归档及对应源码、原生 helper、音频桥、官方 VB-CABLE Pack45 归档，执行 TypeScript / Vite / 服务 bundle 后调用 electron-builder，`publish: never`。

产物为：

- `release/<新版本>/RiftCast-<新版本>-Setup-x64.exe`：NSIS 当前用户安装程序。
- `release/<新版本>/RiftCast-<新版本>-Windows-x64.zip`：完整免安装目录包；解压后运行 RiftCast.exe，不只拷一个 EXE。
- 同目录的 `release-manifest.json`、`SHA256SUMS.txt`、`使用说明.md`。

NSIS 仍为 `perMachine:false`、`allowElevation:false`、`runAfterFinish:false`、`deleteAppDataOnUninstall:false`。生成包只准备驱动归档，不安装或注册系统驱动。随包 allowlist、OBS 对应源码、第三方 DLL/EXE 许可证和原生模块校验全部保留；不打入操作者 data、录制或 OBS 恢复文件。

## 构建前必须具备的条件

| 条件 | 说明 |
| --- | --- |
| 源码 | 独立检出 Sol 确认后的最终 SHA，工作区干净，不操作主机真实项目目录 |
| 新版本 | 父线程在 new 提交新的未占用版本，同步 package / lock / README / `docs/Windows-Release-<版本>.md`；保留旧 tag/release，不复活 v0.5 |
| Node 与依赖 | Windows x64 Node/npm，按 lock 执行 `npm ci`；记录实际版本，不把 Linux node_modules 拷进 Windows 包 |
| 运行时 | 允许下载现有脚本锁定的官方 Electron / OBS / 源码 / VB-CABLE 归档；任何哈希错误原样保留 |
| 原生编译 | 当前预编译文件哈希有效。若源码/产物变化触发重建，需要 MinGW-w64 g++，同目录 gendef.exe / dlltool.exe，可设置 `RIFTCAST_CXX`；需要 tar.exe。缺少时报告具体工具，不静默安装新系统工具 |
| 磁盘 | 同时容纳下载归档、解压 runtime、依赖、OBS 源码、win-unpacked、EXE 和 ZIP；OBS 归档本身 187851583 字节。最终空间峰值和产物大小目前未实测 |

## Windows 执行清单

以下 PowerShell 仅为后续执行方案，**本轮未执行**。先把 `$taskSource` 替换成最终已验收的 40 位 SHA，并使用新的独立检出目录。当前 0.7.0 检查点不是最终发布版本。

```powershell
$ErrorActionPreference = 'Stop'
$taskSource = '<最终已验收的40位SHA>'
if ($taskSource -notmatch '^[0-9a-f]{40}$') { throw '先填写最终已验收源码 SHA。' }
if ((node -p 'process.platform + "/" + process.arch') -ne 'win32/x64') { throw '需要 Windows x64 Node。' }
if (git status --porcelain) { throw '请使用干净的独立检出目录。' }
git checkout --detach $taskSource
if ($LASTEXITCODE -ne 0 -or (git rev-parse HEAD) -ne $taskSource) { throw '未检出指定源码。' }
$taskVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
if ($taskVersion -eq '0.7.0') { throw '尚未提交本次新的发布版本。' }
if (Test-Path "release/$taskVersion") { throw '同版本产物目录已存在，换新检出目录。' }
if (-not (Test-Path "docs/Windows-Release-$taskVersion.md")) { throw '缺少对应版本使用说明。' }
$taskTag = git ls-remote --tags origin "refs/tags/v$taskVersion" "refs/tags/v$taskVersion^{}"
if ($LASTEXITCODE -ne 0) { throw '无法核对远端版本，停止构建准备。' }
if ($taskTag) { throw '此版本 tag 已存在，不覆盖。' }
node --version
npm --version
Get-Command tar.exe
# 若当前有效预编译文件需要重建，使用已存在的工具链：
# $env:RIFTCAST_CXX = 'C:\Strawberry\c\bin\g++.exe'
# 并核对同目录 gendef.exe / dlltool.exe。
npm ci
if ($LASTEXITCODE -ne 0) { throw '依赖准备失败。' }
npm run release:win
if ($LASTEXITCODE -ne 0) { throw 'Windows 构建失败，保留日志。' }
$taskOutput = "release/$taskVersion"
$taskManifest = Get-Content "$taskOutput/release-manifest.json" -Raw | ConvertFrom-Json
if ($taskManifest.version -ne $taskVersion -or $taskManifest.sourceRevision -ne $taskSource) { throw '产物版本/源码不符。' }
if ($taskManifest.workingTreeDirty) { throw '构建捕获了未审查工作区变更，先核对，不能宣称对应干净提交。' }
foreach ($taskName in @("RiftCast-$taskVersion-Setup-x64.exe", "RiftCast-$taskVersion-Windows-x64.zip")) {
  if (-not (Test-Path "$taskOutput/$taskName")) { throw "缺少 $taskName" }
  if (-not ($taskManifest.artifacts | Where-Object { $_.name -eq $taskName })) { throw "manifest 缺少 $taskName" }
}
foreach ($taskArtifact in $taskManifest.artifacts) {
  $taskPath = Join-Path $taskOutput $taskArtifact.name
  if ((Get-FileHash $taskPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskArtifact.sha256) { throw "SHA256 不符：$taskPath" }
  if ((Get-Item $taskPath).Length -ne $taskArtifact.bytes) { throw "大小不符：$taskPath" }
}
Get-Content "$taskOutput/SHA256SUMS.txt"
Get-AuthenticodeSignature "$taskOutput/RiftCast-$taskVersion-Setup-x64.exe"
git status --short
```

后续检查 ZIP 内的运行时、依赖、license/源码和 manifest 一致性，另在仓库树外验证包内模块解析。未配置签名时如实说明签名状态，不把文件哈希等同可信签名。构建成功后先保留产物和日志；本方案不自动启动应用、不安装驱动、不上传 Release。

## 真实 Windows 验收条件

| 验收项 | 需要的真实条件 | 当前结果 |
| --- | --- | --- |
| 安装 / 免安装 / 升级 | 独立 Windows 用户目录，实际两个新产物；允许的安装测试；检查原数据保留与默认路径 | 未运行 |
| 原生监视 / 窗口合成 | 可交互且保持连接的桌面，会话不中断；随包 OBS；可见的测试窗口；实际 HWND、DPI、遮挡/最小化 | 未运行 |
| 虚拟摄像头 | 已准备且获准使用的 OBS Virtual Camera；接收端真实读取 Program 帧，PVW 不泄漏 | 未运行 |
| Program 音频 | 已准备且获准使用的基础双声道 VB-CABLE；48kHz 双声道音轨1 → CABLE Input；检查伴侣 CABLE Output，并实际试听 | 未运行 |
| 录制与恢复 | 独立的合成测试音画和测试录制目录；检查音乐/回放静音恢复、录制独立停止、退出/重启、恢复文件保留 | 未运行 |
| 真实游戏 / 手机 / 平台 | LoL/LCU/OCR 信号、真实手机键盘与生命周期；平台送出和观众端另需相应授权 | 未运行 |

两个正式 Windows 脚本的 UI 入口已在本批更新、业务断言保留，详见 [小播放器修复交接](前端重构小播放器修复交接.md)。`verify:custom-scenes` 会启动真实 OBS 与可见窗口 fixture；`verify:release` 会运行包内 Electron / OBS、尝试复用已注册摄像头并做本机录制，不能在当前 Linux 阶段运行，不能把设备缺失分支当成摄像头或伴侣实听通过。

系统驱动安装/卸载、UAC、重启、改真实 OBS 配置、删除真实录像和真实平台送出不在本轮授权内。缺少设备时精确标记未运行，完成其余已授权部分后交接；不无限重复模拟测试。最终 Release 授权已在任务内，待最终验收与新产物核验完成后由父线程推进，不需为普通实施再次逐项征求批准，也不能在本轮尚未验收时提前发布。
