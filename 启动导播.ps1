param(
  [switch]$Browser,
  [switch]$Rebuild,
  [switch]$Lan,
  [switch]$Console,
  [switch]$HiddenLaunch
)

$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$taskLogRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'RiftCast\logs'
$taskLaunchLog = Join-Path $taskLogRoot 'launcher.log'
$taskTranscriptStarted = $false

function Protect-LaunchMessage {
  param([string]$Message)
  $taskSafeMessage = $Message -replace '(?i)((?:https?|socks[45]h?)://)[^\s/@]+@', '$1[已隐藏]@'
  $taskSafeMessage = $taskSafeMessage -replace '(?i)((?:https?|socks[45]h?)://[^\s?#]+)\?[^\s#]+', '$1?[参数已隐藏]'
  $taskSafeMessage = $taskSafeMessage -replace '(?i)(["''](?:password|token|secret|authorization|obsPassword|_authToken)["'']\s*:\s*)"(?:\\.|[^"\\])*"', '$1"[已隐藏]"'
  $taskSafeMessage = $taskSafeMessage -replace '(?i)(authorization\s*[:=]\s*)(?:Basic|Bearer)\s+\S+', '$1[已隐藏]'
  $taskSafeMessage = $taskSafeMessage -replace '(?i)((?:password|token|secret|authorization|obsPassword|_authToken)\s*["'']?\s*[:=]\s*["'']?)[^\s,"''}]+', '$1[已隐藏]'
  return $taskSafeMessage
}

function Invoke-LaunchCommand {
  param([string]$Executable, [string[]]$CommandArguments)
  # Route native output through PowerShell so the hidden launcher keeps it in its transcript.
  $taskPreviousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $Executable @CommandArguments 2>&1 | ForEach-Object { Write-Host (Protect-LaunchMessage -Message ([string]$_)) }
    $taskCommandExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $taskPreviousErrorAction
  }
  if ($taskCommandExitCode -ne 0) { throw "$Executable 执行失败，退出代码 $taskCommandExitCode。" }
}

function Invoke-Npm {
  param([string[]]$NpmArguments)
  Invoke-LaunchCommand -Executable 'npm.cmd' -CommandArguments $NpmArguments
}

function Install-DesktopRuntime {
  $taskInstallScript = Join-Path $taskRoot 'scripts\ensure-electron.cjs'
  Invoke-LaunchCommand -Executable 'node.exe' -CommandArguments @($taskInstallScript)
}

function Install-ObsRuntime {
  $taskObsInstallScript = Join-Path $taskRoot 'scripts\ensure-obs.cjs'
  Invoke-LaunchCommand -Executable 'node.exe' -CommandArguments @($taskObsInstallScript)
}

try {
  if ($HiddenLaunch) {
    New-Item -ItemType Directory -Path $taskLogRoot -Force | Out-Null
    if ((Test-Path -LiteralPath $taskLaunchLog) -and (Get-Item -LiteralPath $taskLaunchLog).Length -gt 3MB) {
      Copy-Item -LiteralPath $taskLaunchLog -Destination "$taskLaunchLog.previous" -Force
      Clear-Content -LiteralPath $taskLaunchLog
    }
    Start-Transcript -LiteralPath $taskLaunchLog -Append | Out-Null
    $taskTranscriptStarted = $true
  }
  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue) -or
      -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw '请先安装 Node.js 22.12 及以上版本（推荐 Node.js 24），安装后重新打开 PowerShell。'
  }
  $taskNodeVersion = & node.exe -p 'process.versions.node'
  $taskVersionParts = $taskNodeVersion.Split('.')
  $taskNodeMajor = [int]$taskVersionParts[0]
  $taskNodeMinor = [int]$taskVersionParts[1]
  if ($taskNodeMajor -lt 22 -or ($taskNodeMajor -eq 22 -and $taskNodeMinor -lt 12)) {
    throw "当前 Node.js $taskNodeVersion 版本过低，请安装 Node.js 22.12 及以上版本。"
  }
  $taskDependencyFiles = @('tsx\package.json', 'vite\package.json', 'typescript\package.json', 'react\package.json', 'express\package.json')
  if (-not $Browser) { $taskDependencyFiles += 'electron\install.js' }
  $taskMissingDependencies = @($taskDependencyFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $taskRoot "node_modules\$_")) })
  if ($taskMissingDependencies.Count -gt 0) {
    Write-Host '首次运行：正在安装项目依赖。' -ForegroundColor Cyan
    Invoke-Npm -NpmArguments @('install')
  }
  if (-not $Browser) { Install-DesktopRuntime }
  Install-ObsRuntime
  $env:RIFTCAST_OBS_AUTOSTART = '1'
  if ($Rebuild -or -not (Test-Path -LiteralPath (Join-Path $taskRoot 'dist\index.html'))) {
    Write-Host '正在构建导播界面。' -ForegroundColor Cyan
    Invoke-Npm -NpmArguments @('run', 'build')
  }
  if ($Lan) {
    $env:ENABLE_LAN = '1'
    Write-Host '已显式开启局域网服务。请在连接设置中取得访问凭证，并仅向现场协作设备提供。' -ForegroundColor Yellow
  }
  if ($Browser) {
    Write-Host '本地控制台：http://127.0.0.1:3888（用浏览器打开）。Ctrl+C 停止服务。' -ForegroundColor Cyan
    Invoke-Npm -NpmArguments @('start')
  } else {
    Write-Host '正在打开 RiftCast 桌面导播工作台。' -ForegroundColor Cyan
    if ($HiddenLaunch) {
      $taskElectronExecutable = Join-Path $taskRoot 'node_modules\electron\dist\electron.exe'
      if (-not (Test-Path -LiteralPath $taskElectronExecutable)) { throw 'Electron 可执行文件缺失，请使用 -Console 查看运行环境准备结果。' }
      # Electron owns its server and OBS lifecycle; the preparation shell can exit immediately.
      Start-Process -FilePath $taskElectronExecutable -ArgumentList '.' -WorkingDirectory $taskRoot | Out-Null
      Write-Host '桌面启动已交给 Electron；启动准备进程即将退出。'
    } else {
      Invoke-Npm -NpmArguments @('run', 'desktop')
    }
  }
} catch {
  $taskFailureReason = Protect-LaunchMessage -Message $_.Exception.Message
  Write-Host $taskFailureReason -ForegroundColor Red
  if ($HiddenLaunch) {
    $taskFailureMessage = "$taskFailureReason`n`n启动日志：$taskLaunchLog`n`n可运行 启动导播.cmd -Console 查看安装与启动过程。"
    try {
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.MessageBox]::Show($taskFailureMessage, 'RiftCast 启动失败', 'OK', 'Error') | Out-Null
    } catch {
      $taskErrorShell = New-Object -ComObject WScript.Shell
      $taskErrorShell.Popup($taskFailureMessage, 0, 'RiftCast 启动失败', 16) | Out-Null
    }
  } elseif ($Console) {
    Read-Host '按 Enter 关闭启动窗口' | Out-Null
  }
  exit 1
} finally {
  if ($taskTranscriptStarted) { Stop-Transcript | Out-Null }
}
