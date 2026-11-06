$ErrorActionPreference='Stop'
try {
  $helper=$env:RIFTCAST_UPDATE_HELPER
  if ([string]::IsNullOrWhiteSpace($helper) -or $helper.Contains('"')) { throw 'Invalid updater helper path' }
  $start=[System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName=[System.IO.Path]::Combine($env:SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe')
  $start.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$helper+'"'
  $start.UseShellExecute=$false
  $start.CreateNoWindow=$true
  $start.WindowStyle=[System.Diagnostics.ProcessWindowStyle]::Hidden
  $child=[System.Diagnostics.Process]::Start($start)
  if ($null -eq $child) { throw 'Updater helper failed to start' }
  $ready=$env:RIFTCAST_UPDATE_READY_FILE
  if ([string]::IsNullOrWhiteSpace($ready)) { throw 'Updater handshake path missing' }
  $deadline=[DateTime]::UtcNow.AddSeconds(20)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ([System.IO.File]::Exists($ready)) {
      if ([System.IO.File]::ReadAllText($ready) -ne 'ready') { throw 'Updater helper rejected handoff' }
      $child.Dispose()
      exit 0
    }
    if ($child.HasExited) { throw 'Updater helper exited early' }
    [System.Threading.Thread]::Sleep(100)
  }
  throw 'Updater helper did not become ready'
} catch { exit 1 }
