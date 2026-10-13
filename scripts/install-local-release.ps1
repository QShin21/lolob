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
if (Get-Process -Name RiftCast -ErrorAction SilentlyContinue) { throw '请先关闭正在运行的 RiftCast，再安装 Release。' }
$taskInstall = Start-Process -FilePath $taskInstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
if ($taskInstall.ExitCode -ne 0) { throw "安装未完成，退出码 $($taskInstall.ExitCode)。" }
if (-not (Test-Path -LiteralPath $taskExecutable)) { throw '安装程序已退出，但未找到 RiftCast.exe。' }
$taskDesktop = [Environment]::GetFolderPath('Desktop')
$taskShortcut = Join-Path $taskDesktop 'RiftCast 导播.lnk'
if (-not (Test-Path -LiteralPath $taskShortcut)) { throw '安装后未找到桌面快捷方式。' }
$taskShell = New-Object -ComObject WScript.Shell
$taskLink = $taskShell.CreateShortcut($taskShortcut)
if ($taskLink.TargetPath -ne $taskExecutable) { throw '桌面快捷方式未指向 Release 可执行文件。' }
$taskPackagedExecutable = Join-Path $taskRoot "release\$taskVersion\win-unpacked\RiftCast.exe"
if ((Get-FileHash -LiteralPath $taskExecutable -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $taskPackagedExecutable -Algorithm SHA256).Hash) { throw '安装后的可执行文件与已验证 Release 不一致。' }
$taskRecord = [ordered]@{ version = $taskVersion; installedAt = (Get-Date).ToUniversalTime().ToString('o'); installerExitCode = $taskInstall.ExitCode; executable = $taskExecutable; shortcut = $taskShortcut; shortcutTarget = $taskLink.TargetPath; executableSha256 = (Get-FileHash -LiteralPath $taskExecutable -Algorithm SHA256).Hash.ToLowerInvariant(); ready = $false }
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
