param([string]$Installer=$env:RIFTCAST_UPDATE_INSTALLER,
      [int]$ParentId=$env:RIFTCAST_UPDATE_PARENT_ID,
      [long]$ParentStartMillis=$env:RIFTCAST_UPDATE_PARENT_STARTED,
      [string]$ExpectedSha256=$env:RIFTCAST_UPDATE_SHA256)
$ErrorActionPreference='Stop'
$notified=$false
try {
  $ready=$env:RIFTCAST_UPDATE_READY_FILE
  if ([string]::IsNullOrWhiteSpace($ready) -or ![System.IO.File]::Exists($Installer) -or $ExpectedSha256 -notmatch '^[0-9a-fA-F]{64}$') { throw '更新助手参数不完整。' }
  $parent=[System.Diagnostics.Process]::GetProcessById($ParentId)
  $epoch=[datetime]'1970-01-01T00:00:00Z'
  $started=($parent.StartTime.ToUniversalTime()-$epoch.ToUniversalTime()).TotalMilliseconds
  if ([Math]::Abs($started-$ParentStartMillis) -gt 3000) { throw '无法确认原导播进程，请手动打开下载的安装包。' }
  [System.IO.File]::WriteAllText($ready,'ready')
  $notified=$true
  if (!$parent.WaitForExit(90000)) { throw '等待导播退出超时，请手动打开下载的安装包。' }
  $parent.Dispose()
  $file=[System.IO.File]::Open($Installer,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read)
  try {
    $sha=[System.Security.Cryptography.SHA256]::Create()
    try { $digest=[BitConverter]::ToString($sha.ComputeHash($file)).Replace('-','') } finally { $sha.Dispose() }
  } finally { $file.Dispose() }
  if ($digest -ne $ExpectedSha256) { throw '安装包校验失败，请重新下载。' }
  $start=[System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName=$Installer
  $installDir=$env:RIFTCAST_UPDATE_INSTALL_DIR
  if ([string]::IsNullOrEmpty($installDir)) {
    # Portable editions use the interactive installer so the user chooses a location.
    $start.UseShellExecute=$true
    [void][System.Diagnostics.Process]::Start($start)
  } else {
    if (![System.IO.Path]::IsPathRooted($installDir) -or $installDir.Contains('"') -or $installDir.Contains("`r") -or $installDir.Contains("`n")) { throw '安装目录无效，请手动运行安装包。' }
    $start.UseShellExecute=$false
    $start.CreateNoWindow=$true
    $start.Arguments='/S --updated /D='+$installDir
    $setup=[System.Diagnostics.Process]::Start($start)
    if ($null -eq $setup) { throw '安装程序启动失败。' }
    if (!$setup.WaitForExit(600000)) { throw '安装等待超时，请检查安装状态。' }
    if ($setup.ExitCode -ne 0) { throw ('安装程序返回错误代码 '+$setup.ExitCode) }
    $setup.Dispose()
    $restart=$env:RIFTCAST_UPDATE_RESTART
    if (![string]::IsNullOrEmpty($restart) -and [System.IO.File]::Exists($restart)) {
      $next=[System.Diagnostics.ProcessStartInfo]::new()
      $next.FileName=$restart
      $next.UseShellExecute=$true
      [void][System.Diagnostics.Process]::Start($next)
    }
  }
} catch {
  $message=$_.Exception.Message
  if (!$notified) { try { [System.IO.File]::WriteAllText($env:RIFTCAST_UPDATE_READY_FILE,'error') } catch { }; exit 1 }
  try {
    $shell=[Activator]::CreateInstance([Type]::GetTypeFromProgID('WScript.Shell'))
    [void]$shell.Popup($message,0,'RiftCast 更新',16)
  } catch { }
}
