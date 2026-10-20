$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
function Respond($response) {
  [Console]::Out.WriteLine(($response | ConvertTo-Json -Depth 16 -Compress))
  [Console]::Out.Flush()
}
try {
  Add-Type -Path (Join-Path $PSScriptRoot 'native/observer-reader.cs')
  $reader=New-Object RiftCastObserverReader
  $sourceSession=''
  $replayPath=$null
  $observerSession=$null
  Respond @{type='ready';protocol=1}
  while($null -ne ($line=[Console]::In.ReadLine())) {
    if($line.Length -gt 4096){throw 'Invalid request'}
    $request=$line|ConvertFrom-Json
    if($request.type -eq 'shutdown'){break}
    if($request.type -ne 'read' -or $request.id -isnot [int] -or $request.id -le 0){throw 'Invalid request'}
    $result=$reader.Sample()
    if($result.ok) {
      $currentSession=[string]$result.pid+':'+[string]$result.processSession
      if($currentSession -ne $sourceSession) {
        $sourceSession=$currentSession
        $replayPath=$null
        $observerSession=$null
        try {
          $processInfo=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$result.pid) -OperationTimeoutSec 3
          if($processInfo.Name -eq 'League of Legends.exe') {
            $pathMatch=[regex]::Match($processInfo.CommandLine,'(?i)"([^"\r\n]+\.rofl)"')
            if($pathMatch.Success -and [IO.Path]::IsPathRooted($pathMatch.Groups[1].Value)) {
              $replayPath=$pathMatch.Groups[1].Value
            }
            $liveMatch=[regex]::Match($processInfo.CommandLine,'"spectator ([^"\r\n]+)"')
            $targetMatch=[regex]::Match($processInfo.CommandLine,'"-TargetPuuid=([^"\r\n]+)"')
            $keyMatch=[regex]::Match($processInfo.CommandLine,'"-SpectatorKey=([^"\r\n]+)"')
            if($liveMatch.Success -and $targetMatch.Success -and $keyMatch.Success){
              $parts=$liveMatch.Groups[1].Value.Split(' ')
              if($parts.Length -eq 4){
                # Private IPC only. These credentials never enter BroadcastState, logs or exports.
                $observerSession=@{host=$parts[0];gameId=$parts[2];platform=$parts[3];target=$targetMatch.Groups[1].Value;key=$keyMatch.Groups[1].Value}
              }
            }
          }
        } catch { $replayPath=$null }
      }
      if($null -ne $replayPath){$result['replayPath']=$replayPath}
      if($null -ne $observerSession){$result['observerSession']=$observerSession}
    }
    Respond @{type='result';id=$request.id;reading=$result}
  }
} catch { Respond @{type='fatal';protocol=1} }
finally {if($null -ne $reader){$reader.Dispose()}}
