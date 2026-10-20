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
  Respond @{type='ready';protocol=1}
  while($null -ne ($line=[Console]::In.ReadLine())) {
    if($line.Length -gt 4096){throw 'Invalid request'}
    $request=$line|ConvertFrom-Json
    if($request.type -eq 'shutdown'){break}
    if($request.type -ne 'read' -or $request.id -isnot [int] -or $request.id -le 0){throw 'Invalid request'}
    $result=$reader.Sample()
    Respond @{type='result';id=$request.id;reading=$result}
  }
} catch { Respond @{type='fatal';protocol=1} }
finally {if($null -ne $reader){$reader.Dispose()}}
