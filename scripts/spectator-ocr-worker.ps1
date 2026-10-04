$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)

function Write-WorkerResponse($taskResponse) {
  [Console]::Out.WriteLine(($taskResponse | ConvertTo-Json -Depth 14 -Compress))
  [Console]::Out.Flush()
}

try {
  . (Join-Path $PSScriptRoot 'read-spectator-gold.ps1') -InitializeOnly
  if(-not (Get-Command Read-SpectatorFrame -CommandType Function -ErrorAction SilentlyContinue)){throw 'OCR runtime unavailable'}
}catch{
  Write-WorkerResponse @{type='fatal';protocol=1}
  exit 1
}
Write-WorkerResponse @{type='ready';protocol=1}

$taskNumeric=@('BlueX','BlueY','BlueWidth','BlueHeight','RedX','RedY','RedWidth','RedHeight','PlayersX','PlayersY','PlayersWidth','PlayersHeight')
$taskSwitches=@('ReadPlayers','SkipTeam','AutoLocate','Diagnostics')
$taskPaths=@('ImagePath','ChampionManifest')
while($null -ne ($taskLine=[Console]::In.ReadLine())) {
  $taskId=$null
  try {
    if($taskLine.Length -gt 65536){throw 'Invalid request'}
    $taskRequest=$taskLine | ConvertFrom-Json
    if($taskRequest.type -eq 'shutdown'){break}
    if($taskRequest.type -ne 'read' -or $taskRequest.id -isnot [int] -or $taskRequest.id -le 0){throw 'Invalid request'}
    $taskId=$taskRequest.id
    if($taskRequest.args -isnot [Array] -or $taskRequest.args.Count -gt 64){throw 'Invalid arguments'}
    $taskParameters=@{}
    for($taskIndex=0;$taskIndex -lt $taskRequest.args.Count;$taskIndex++) {
      $taskArgument=$taskRequest.args[$taskIndex]
      if($taskArgument -isnot [string] -or $taskArgument -notmatch '^-[A-Za-z]+$'){throw 'Invalid argument'}
      $taskName=$taskArgument.Substring(1)
      if($taskParameters.ContainsKey($taskName)){throw 'Duplicate argument'}
      if($taskName -in $taskSwitches){$taskParameters[$taskName]=$true;continue}
      if($taskName -notin $taskNumeric -and $taskName -notin $taskPaths){throw 'Unsupported argument'}
      $taskIndex++;if($taskIndex -ge $taskRequest.args.Count){throw 'Missing argument'}
      $taskValue=$taskRequest.args[$taskIndex]
      if($taskValue -isnot [string] -or $taskValue.Length -gt 4096 -or $taskValue -match '[\r\n\x00]'){throw 'Invalid value'}
      if($taskName -in $taskNumeric){
        $taskNumber=[double]::Parse($taskValue,[Globalization.CultureInfo]::InvariantCulture)
        if([double]::IsNaN($taskNumber) -or [double]::IsInfinity($taskNumber) -or $taskNumber -lt 0 -or $taskNumber -gt 1){throw 'Invalid region'}
        $taskParameters[$taskName]=$taskNumber
      }else{$taskParameters[$taskName]=$taskValue}
    }
    $taskStopwatch=[Diagnostics.Stopwatch]::StartNew()
    $taskReading=Read-SpectatorFrame @taskParameters
    $taskStopwatch.Stop()
    Write-WorkerResponse @{type='result';id=$taskId;reading=$taskReading;elapsedMs=$taskStopwatch.ElapsedMilliseconds}
  }catch{
    Write-WorkerResponse @{type='result';id=$taskId;reading=@{ok=$false;error='Windows OCR 请求未完成，请核对采样图和识别区域'}}
  }
}
