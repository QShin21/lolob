param([switch]$SkipLaunch)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPackage = Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'package.json') | ConvertFrom-Json
$taskVersion = $taskPackage.version
$taskInstaller = Join-Path $taskRoot "release\$taskVersion\RiftCast-$taskVersion-Setup-x64.exe"
$taskInstallDirectory = Join-Path $env:LOCALAPPDATA 'Programs\RiftCast'
$taskExecutable = Join-Path $taskInstallDirectory 'RiftCast.exe'
$taskEvidence = Join-Path $taskRoot "verification-output\release-$taskVersion"
if (-not (Test-Path -LiteralPath $taskInstaller)) { throw 'Release 安装包缺失，请先完成构建。' }
if (Get-Process -Name RiftCast -ErrorAction SilentlyContinue) { throw '请先关闭正在运行的观澜，再安装 Release。' }
# Keep this current-user install check separate from any existing all-users installation.
$taskInstall = Start-Process -FilePath $taskInstaller -ArgumentList '/S /currentuser' -WindowStyle Hidden -PassThru -Wait
if ($taskInstall.ExitCode -ne 0) { throw "安装未完成，退出码 $($taskInstall.ExitCode)。" }
if (-not (Test-Path -LiteralPath $taskExecutable)) { throw '安装程序已退出，但未找到 RiftCast.exe。' }
$taskUninstaller = Join-Path $taskInstallDirectory 'Uninstall RiftCast.exe'
if (-not (Test-Path -LiteralPath $taskUninstaller -PathType Leaf)) { throw '安装后未找到 Uninstall RiftCast.exe。' }
$taskShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) '观澜导播.lnk'
$taskStartMenuShortcut = Join-Path ([Environment]::GetFolderPath('Programs')) '观澜导播.lnk'
$taskShell = New-Object -ComObject WScript.Shell
foreach ($taskLinkPath in @($taskShortcut, $taskStartMenuShortcut)) {
  if (-not (Test-Path -LiteralPath $taskLinkPath -PathType Leaf)) { throw "安装后未找到快捷方式：$taskLinkPath" }
  # WScript.Shell opens .lnk files through the ANSI code page; read a copy under an ASCII name so
  # the Chinese shortcut name also resolves on non-Chinese Windows.
  $taskLinkCopy = Join-Path ([IO.Path]::GetTempPath()) ("guanlan-shortcut-" + [guid]::NewGuid().ToString('N') + ".lnk")
  Copy-Item -LiteralPath $taskLinkPath -Destination $taskLinkCopy -Force
  try { $taskLink = $taskShell.CreateShortcut($taskLinkCopy); $taskLinkTarget = $taskLink.TargetPath } finally { Remove-Item -LiteralPath $taskLinkCopy -Force -ErrorAction SilentlyContinue }
  if ($taskLinkTarget -ne $taskExecutable) { throw "快捷方式未指向观澜可执行文件：$taskLinkPath -> '$taskLinkTarget'（应为 $taskExecutable）" }
}
$taskPackagedExecutable = Join-Path $taskRoot "release\$taskVersion\win-unpacked\RiftCast.exe"
if ((Get-FileHash -LiteralPath $taskExecutable -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $taskPackagedExecutable -Algorithm SHA256).Hash) { throw '安装后的可执行文件与已验证 Release 不一致。' }
$taskRecord = [ordered]@{ version = $taskVersion; installedAt = (Get-Date).ToUniversalTime().ToString('o'); installerExitCode = $taskInstall.ExitCode; executable = $taskExecutable; uninstaller = $taskUninstaller; shortcut = $taskShortcut; startMenuShortcut = $taskStartMenuShortcut; shortcutTarget = $taskLinkTarget; executableSha256 = (Get-FileHash -LiteralPath $taskExecutable -Algorithm SHA256).Hash.ToLowerInvariant(); ready = $false }
if (-not $SkipLaunch) {
  $taskPreviousImport = $env:RIFTCAST_IMPORT_FROM
  try {
    $env:RIFTCAST_IMPORT_FROM = $taskRoot
    Start-Process -FilePath $taskExecutable -WorkingDirectory $taskInstallDirectory -WindowStyle Hidden | Out-Null
  } finally { $env:RIFTCAST_IMPORT_FROM = $taskPreviousImport }
  $taskDeadline = (Get-Date).AddSeconds(50)
  while ((Get-Date) -lt $taskDeadline) {
    try { $taskHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:3888/api/health' -TimeoutSec 2; if ($taskHealth.version -eq $taskVersion) { $taskRecord.ready = $true; break } } catch {}
    Start-Sleep -Milliseconds 300
  }
  if (-not $taskRecord.ready) { throw 'Release 已安装，但启动服务尚未就绪，请查看用户数据目录的 logs\director.log。' }
  $taskMigration = Join-Path $env:APPDATA 'RiftCast\migration.json'
  if (Test-Path -LiteralPath $taskMigration) { $taskImported = Get-Content -Raw -LiteralPath $taskMigration | ConvertFrom-Json; $taskRecord.dataDir = $taskImported.dataDir; $taskRecord.importSource = $taskImported.source; $taskRecord.importedStateSha256 = $taskImported.sourceStateSha256 }
}
$taskRecord | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskEvidence 'install-report.json') -Encoding utf8
$taskRecord | ConvertTo-Json -Depth 4
