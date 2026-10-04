param(
  [double]$BlueX,
  [double]$BlueY,
  [double]$BlueWidth,
  [double]$BlueHeight,
  [double]$RedX,
  [double]$RedY,
  [double]$RedWidth,
  [double]$RedHeight,
  [switch]$ReadPlayers,
  [switch]$SkipTeam,
  [double]$PlayersX=0,
  [double]$PlayersY=.4,
  [double]$PlayersWidth=1,
  [double]$PlayersHeight=.6,
  [string]$ChampionManifest,
  [string]$ImagePath,
  [switch]$AutoLocate,
  [switch]$Diagnostics,
  [switch]$InitializeOnly
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)

function Initialize-SpectatorOcr {
  if($script:taskOcrInitialized){return}
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  if(-not ('RiftCastGoldWindow' -as [type])){Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RiftCastGoldWindow {
  [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
  [StructLayout(LayoutKind.Sequential)] public struct POINT {public int X,Y;}
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle,out uint processId);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr handle,out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr handle,ref POINT point);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr handle,uint command);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle,out RECT rect);
  [DllImport("dwmapi.dll",EntryPoint="DwmGetWindowAttribute")] private static extern int DwmCloaked(IntPtr handle,int attribute,out int value,int size);
  [DllImport("dwmapi.dll",EntryPoint="DwmGetWindowAttribute")] private static extern int DwmBounds(IntPtr handle,int attribute,out RECT value,int size);
  public static bool Overlaps(RECT first,RECT second) {return first.Left<second.Right && first.Right>second.Left && first.Top<second.Bottom && first.Bottom>second.Top;}
  public static bool RegionCoveredByOtherWindow(IntPtr target,uint gameProcessId,RECT region) {
    int visited=0;
    for(IntPtr handle=GetTopWindow(IntPtr.Zero);handle!=IntPtr.Zero && visited++<10000;handle=GetWindow(handle,2)) {
      if(handle==target)return false;
      if(!IsWindowVisible(handle)||IsIconic(handle))continue;
      int cloaked;if(DwmCloaked(handle,14,out cloaked,4)==0 && cloaked!=0)continue;
      uint processId;GetWindowThreadProcessId(handle,out processId);if(processId==gameProcessId)continue;
      RECT bounds;if(DwmBounds(handle,9,out bounds,16)!=0 && !GetWindowRect(handle,out bounds))return true;
      if(Overlaps(bounds,region))return true;
    }
    return true;
  }
}
'@
  }
  try { [void][RiftCastGoldWindow]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch { [void][RiftCastGoldWindow]::SetProcessDPIAware() }
  [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
  [Windows.Media.Ocr.OcrResult,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
  [Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
  [Windows.Graphics.Imaging.SoftwareBitmap,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
  [Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
  [Windows.Storage.Streams.DataWriter,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
  [Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime] | Out-Null
  $taskNumericLanguage=New-Object Windows.Globalization.Language('en-US')
  $taskEngine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($taskNumericLanguage)
  $taskProfileEngine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if(-not $taskEngine){$taskEngine=$taskProfileEngine}
  if(-not $taskEngine){throw 'Windows OCR 语言组件不可用，请在 Windows 语言设置安装中文或英语文字识别组件。'}
  $taskAsTask=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'} | Select-Object -First 1
  if(-not ('RiftCastPortraitMatcher' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'spectator-portrait-matcher.cs') -ReferencedAssemblies System.Drawing}
  $script:taskCachedEngine=$taskEngine;$script:taskCachedProfileEngine=$taskProfileEngine;$script:taskCachedAsTask=$taskAsTask
  $script:taskOcrInitialized=$true
}

  function Convert-GoldText([string]$taskText) {
    $taskNormalized=$taskText.Normalize([Text.NormalizationForm]::FormKC).Trim()
    $taskNormalized=[regex]::Replace($taskNormalized,'(?<=\d)\s*[·∙]\s*(?=\d)','.')
    $taskNormalized=[regex]::Replace($taskNormalized,'\s*([.,])\s*','$1')
    $taskNormalized=[regex]::Replace($taskNormalized,'(\d)\s+([kK万])$','$1$2')
    $taskMultiplier=1
    if($taskNormalized -match '^\d+(?:\.\d{1,3})?[kK]$'){$taskMultiplier=1000;$taskNormalized=$taskNormalized.Substring(0,$taskNormalized.Length-1)}
    elseif($taskNormalized -match '^\d+(?:\.\d{1,4})?万$'){$taskMultiplier=10000;$taskNormalized=$taskNormalized.Substring(0,$taskNormalized.Length-1)}
    elseif($taskNormalized -match '^\d+$' -or $taskNormalized -match '^\d{1,3}(?:,\d{3})+$'){$taskNormalized=$taskNormalized.Replace(',','')}
    else{return $null}
    $taskValue=[double]::Parse($taskNormalized,[Globalization.CultureInfo]::InvariantCulture)*$taskMultiplier
    if($taskValue -lt 0 -or $taskValue -gt 1000000 -or [Math]::Abs($taskValue-[Math]::Round($taskValue)) -gt .000001){return $null}
    return [pscustomobject]@{text=$taskText;value=$taskValue}
  }
  function Select-GoldText($taskReading) {
    $taskPrimary=Convert-GoldText $taskReading.text
    $taskAlternative=$null;if($taskReading.alternateText){$taskAlternative=Convert-GoldText $taskReading.alternateText}
    if($taskPrimary -and $taskAlternative -and $taskPrimary.value -ne $taskAlternative.value){throw '不同 OCR 语言的经济结果不一致，已拒绝模糊读数，请重新定位或校准区域。'}
    if($taskPrimary){return $taskPrimary.text};if($taskAlternative){return $taskAlternative.text}
    throw '无法确认经济数字，已拒绝模糊读数，请重新定位或校准区域。'
  }
function Read-SpectatorFrame {
param(
  [double]$BlueX,
  [double]$BlueY,
  [double]$BlueWidth,
  [double]$BlueHeight,
  [double]$RedX,
  [double]$RedY,
  [double]$RedWidth,
  [double]$RedHeight,
  [switch]$ReadPlayers,
  [switch]$SkipTeam,
  [double]$PlayersX=0,
  [double]$PlayersY=.4,
  [double]$PlayersWidth=1,
  [double]$PlayersHeight=.6,
  [string]$ChampionManifest,
  [string]$ImagePath,
  [switch]$AutoLocate,
  [switch]$Diagnostics
)
  $ErrorActionPreference='Stop'
  $script:taskPortraitDiagnostics=$null;$script:taskGlyphDiagnostics=@()
  try {
    Initialize-SpectatorOcr
    $taskEngine=$script:taskCachedEngine;$taskProfileEngine=$script:taskCachedProfileEngine;$taskAsTask=$script:taskCachedAsTask
  if($ImagePath){
    $taskFixtureImage=[Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $ImagePath).Path)
    $taskOrigin=[pscustomobject]@{X=0;Y=0}
    $taskClientWidth=$taskFixtureImage.Width;$taskClientHeight=$taskFixtureImage.Height
    function Assert-GameVisible {}
    function Assert-GoldRegionVisible {}
  }else{
  $taskGame=Get-Process -Name 'League of Legends' -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne [IntPtr]::Zero} | Select-Object -First 1
  if(-not $taskGame){throw '未找到英雄联盟游戏窗口，请打开观战或录像回放。'}
  $taskHandle=$taskGame.MainWindowHandle
  function Assert-GameVisible {
    if([RiftCastGoldWindow]::IsIconic($taskHandle) -or -not [RiftCastGoldWindow]::IsWindowVisible($taskHandle)){throw '英雄联盟窗口已最小化或不可见，请恢复并显示观战画面。'}
  }
  function Assert-GoldRegionVisible([int]$taskPixelX,[int]$taskPixelY,[int]$taskPixelWidth,[int]$taskPixelHeight) {
    Assert-GameVisible
    $taskRegion=New-Object RiftCastGoldWindow+RECT
    $taskRegion.Left=$taskPixelX;$taskRegion.Top=$taskPixelY;$taskRegion.Right=$taskPixelX+$taskPixelWidth;$taskRegion.Bottom=$taskPixelY+$taskPixelHeight
    if([RiftCastGoldWindow]::RegionCoveredByOtherWindow($taskHandle,$taskGame.Id,$taskRegion)){throw '游戏经济区域被其他窗口遮挡，请移开遮挡窗口或切回游戏；双屏可见区域可以继续识别。'}
  }
  Assert-GameVisible
  $taskRect=New-Object RiftCastGoldWindow+RECT
  $taskOrigin=New-Object RiftCastGoldWindow+POINT
  if(-not [RiftCastGoldWindow]::GetClientRect($taskHandle,[ref]$taskRect) -or -not [RiftCastGoldWindow]::ClientToScreen($taskHandle,[ref]$taskOrigin)){throw '无法读取游戏窗口区域。'}
  $taskClientWidth=$taskRect.Right-$taskRect.Left
  $taskClientHeight=$taskRect.Bottom-$taskRect.Top
  if($taskClientWidth -lt 640 -or $taskClientHeight -lt 360){throw '游戏窗口太小，请调整窗口大小后校准。'}
  }
  function Await-WinRt($taskOperation,[Type]$taskResultType) {
    $taskAwait=$taskAsTask.MakeGenericMethod($taskResultType).Invoke($null,@($taskOperation))
    if(-not $taskAwait.Wait(6000)){throw 'Windows OCR 处理超时。'}
    return $taskAwait.Result
  }
  $taskPortraitTemplates=@()
  if($ReadPlayers -and $ChampionManifest){
    $taskManifestFile=Get-Item -LiteralPath $ChampionManifest
    $taskManifestKey="$($taskManifestFile.FullName)|$($taskManifestFile.Length)|$($taskManifestFile.LastWriteTimeUtc.Ticks)"
    if($script:taskCachedManifestKey -ne $taskManifestKey){
      foreach($taskOldTemplate in @($script:taskCachedPortraitTemplates)){if($taskOldTemplate.Image){$taskOldTemplate.Image.Dispose()}}
      $taskManifest=Get-Content -LiteralPath $ChampionManifest -Raw -Encoding UTF8 | ConvertFrom-Json
      $script:taskCachedPortraitTemplates=@(foreach($taskPortrait in @($taskManifest.portraits | Select-Object -First 10)){
        if($taskPortrait.team -notin @('blue','red') -or $taskPortrait.championId -notmatch '^[A-Za-z][A-Za-z0-9]{1,40}$'){continue}
        $taskTemplate=New-Object RiftCastPortraitTemplate
        $taskTemplate.Team=$taskPortrait.team;$taskTemplate.ChampionId=$taskPortrait.championId
        $taskTemplate.Image=[Drawing.Bitmap]::FromFile($taskPortrait.imagePath)
        $taskTemplate
      })
      $script:taskCachedManifestKey=$taskManifestKey
      [RiftCastPortraitMatcher]::ResetLayout()
    }
    $taskPortraitTemplates=$script:taskCachedPortraitTemplates
  }
  function Find-PlayerPortraits($taskBitmap,$taskWords,[double]$taskRegionX,[double]$taskRegionY){
    if(-not $taskPortraitTemplates.Count){return @()}
    $taskAnchors=@(foreach($taskLine in ($taskWords | Group-Object line)){
      $taskOrdered=@($taskLine.Group | Sort-Object x)
      $taskText=($taskOrdered.text -join ' ').Normalize([Text.NormalizationForm]::FormKC)
      $taskOffset=0;$taskSpans=@(foreach($taskWord in $taskOrdered){$taskLength=$taskWord.text.Normalize([Text.NormalizationForm]::FormKC).Length;[pscustomobject]@{word=$taskWord;start=$taskOffset;end=$taskOffset+$taskLength};$taskOffset+=$taskLength+1})
      foreach($taskScore in [regex]::Matches($taskText,'(?<!\d)\d{1,3}\s*/\s*\d{1,3}\s*/\s*\d{1,3}(?!\d)')){
        $taskScoreWords=@($taskSpans | Where-Object {$_.start -lt $taskScore.Index+$taskScore.Length -and $_.end -gt $taskScore.Index} | ForEach-Object {$_.word})
        $taskLeft=($taskScoreWords.x | Measure-Object -Minimum).Minimum;$taskRight=($taskScoreWords | ForEach-Object {$_.x+$_.width} | Measure-Object -Maximum).Maximum
        $taskTop=($taskScoreWords.y | Measure-Object -Minimum).Minimum;$taskBottom=($taskScoreWords | ForEach-Object {$_.y+$_.height} | Measure-Object -Maximum).Maximum
        $taskAnchor=New-Object RiftCastScoreboardAnchor
        if(($taskLeft+$taskRight)/2 -lt .5){$taskAnchor.Team='blue'}else{$taskAnchor.Team='red'}
        $taskAnchor.Y=(($taskTop+$taskBottom)/2-$taskRegionY)*$taskClientHeight;$taskAnchor.Height=($taskBottom-$taskTop)*$taskClientHeight
        $taskAnchor
      }
    })
    if($Diagnostics){$script:taskPortraitDiagnostics=@{anchors=@($taskAnchors | Select-Object Team,Y,Height);templates=$taskPortraitTemplates.Count}}
    if($taskAnchors.Count -gt 10){return @()}
    return @([RiftCastPortraitMatcher]::Find($taskBitmap,$taskPortraitTemplates,$taskAnchors,(.5-$taskRegionX)*$taskClientWidth))
  }
  function Read-ScoreboardNumericRows($taskBitmap,$taskWords,$taskMatches,[double]$taskRegionX,[double]$taskRegionY,$taskFallbackCells=$null) {
    $taskRegions=$script:taskNumericRegions
    if($taskFallbackCells){$taskRegions=$taskFallbackCells}
    if(-not $taskRegions){
      $taskScores=@(foreach($taskLine in ($taskWords | Group-Object line)){
        $taskOrdered=@($taskLine.Group | Sort-Object x);$taskText=($taskOrdered.text -join ' ').Normalize([Text.NormalizationForm]::FormKC)
        $taskOffset=0;$taskSpans=@(foreach($taskWord in $taskOrdered){$taskLength=$taskWord.text.Normalize([Text.NormalizationForm]::FormKC).Length;[pscustomobject]@{word=$taskWord;start=$taskOffset;end=$taskOffset+$taskLength};$taskOffset+=$taskLength+1})
        foreach($taskScore in [regex]::Matches($taskText,'(?<!\d)\d{1,3}\s*/\s*\d{1,3}\s*/\s*\d{1,3}(?!\d)')){
          $taskParts=@($taskSpans | Where-Object {$_.start -lt $taskScore.Index+$taskScore.Length -and $_.end -gt $taskScore.Index} | ForEach-Object {$_.word})
          $taskLeft=($taskParts.x | Measure-Object -Minimum).Minimum;$taskRight=($taskParts | ForEach-Object {$_.x+$_.width} | Measure-Object -Maximum).Maximum
          $taskTop=($taskParts.y | Measure-Object -Minimum).Minimum;$taskBottom=($taskParts | ForEach-Object {$_.y+$_.height} | Measure-Object -Maximum).Maximum
          [pscustomobject]@{team=$(if(($taskLeft+$taskRight)/2 -lt .5){'blue'}else{'red'});left=($taskLeft-$taskRegionX)*$taskClientWidth;right=($taskRight-$taskRegionX)*$taskClientWidth;y=(($taskTop+$taskBottom)/2-$taskRegionY)*$taskClientHeight;height=($taskBottom-$taskTop)*$taskClientHeight}
        }
      })
      $taskCenters=New-Object System.Collections.Generic.List[double]
      foreach($taskScore in @($taskScores | Sort-Object y)){if(@($taskCenters | Where-Object {[Math]::Abs($_-$taskScore.y) -lt $taskScore.height*.6}).Count -eq 0){$taskCenters.Add($taskScore.y)}}
      if($taskCenters.Count -ne 5){return $null}
      $taskRegions=@(foreach($taskTeam in @('blue','red')){
        $taskSideScores=@($taskScores | Where-Object {$_.team -eq $taskTeam});$taskSidePortraits=@($taskMatches | Where-Object {$_.Team -eq $taskTeam})
        if($taskSideScores.Count -lt 3 -or $taskSidePortraits.Count -lt 3){continue}
        $taskFont=@($taskSideScores.height | Sort-Object)[[int][Math]::Floor($taskSideScores.Count/2)]
        $taskScoreLeft=@($taskSideScores.left | Sort-Object)[[int][Math]::Floor($taskSideScores.Count/2)]
        $taskScoreRight=@($taskSideScores.right | Sort-Object)[[int][Math]::Floor($taskSideScores.Count/2)]
        $taskPortraitLeft=@($taskSidePortraits.X | Sort-Object)[[int][Math]::Floor($taskSidePortraits.Count/2)]
        $taskPortraitRight=@($taskSidePortraits | ForEach-Object {$_.X+$_.Width} | Sort-Object)[[int][Math]::Floor($taskSidePortraits.Count/2)]
        $taskLeft=$(if($taskTeam -eq 'blue'){$taskScoreLeft-$taskFont*.2}else{$taskPortraitRight+$taskFont*.2})
        $taskRight=$(if($taskTeam -eq 'blue'){$taskPortraitLeft-$taskFont*.2}else{$taskScoreRight+$taskFont*.2})
        $taskGoldLeft=$(if($taskTeam -eq 'blue'){$taskScoreLeft-$taskFont*13}else{$taskScoreRight+$taskFont*1.2})
        $taskGoldRight=$(if($taskTeam -eq 'blue'){$taskScoreLeft-$taskFont*1.2}else{$taskScoreRight+$taskFont*13})
        foreach($taskCenter in $taskCenters){
          $taskTop=[Math]::Max(0,[Math]::Floor($taskCenter-$taskFont*.68));$taskBottom=[Math]::Min($taskBitmap.Height,[Math]::Ceiling($taskCenter+$taskFont*.68))
          foreach($taskColumns in @(@{kind='stats';left=$taskLeft;right=$taskRight},@{kind='gold';left=$taskGoldLeft;right=$taskGoldRight})){
            $taskL=[Math]::Max(0,[Math]::Floor($taskColumns.left));$taskR=[Math]::Min($taskBitmap.Width,[Math]::Ceiling($taskColumns.right))
            if($taskR-$taskL -gt 12 -and $taskBottom-$taskTop -gt 12){[pscustomobject]@{kind=$taskColumns.kind;x=$taskL;y=$taskTop;width=$taskR-$taskL;height=$taskBottom-$taskTop}}
          }
        }
      })
      if(@($taskRegions | Where-Object {$_.kind -eq 'stats'}).Count -ne 10){return $null}
      $script:taskNumericRegions=$taskRegions
    }
    $taskMontage=$null;$taskMontageGraphics=$null;$taskScaled=$null;$taskGraphics=$null;$taskMemory=$null;$taskRandom=$null;$taskWriter=$null;$taskSoftware=$null
    try{
      $taskMontageWidth=[int](($taskRegions | ForEach-Object {if($taskFallbackCells){($_.width+4)*3}else{$_.width}} | Measure-Object -Maximum).Maximum+24)
      $taskMontageHeight=24;foreach($taskRegion in $taskRegions){$taskRegion | Add-Member -NotePropertyName offsetY -NotePropertyValue $taskMontageHeight -Force;$taskMontageHeight+=[int]$taskRegion.height+20}
      $taskMontage=New-Object Drawing.Bitmap($taskMontageWidth,$taskMontageHeight);$taskMontageGraphics=[Drawing.Graphics]::FromImage($taskMontage);$taskMontageGraphics.Clear([Drawing.Color]::Black)
      foreach($taskRegion in $taskRegions){
        $taskCopies=1;if($taskFallbackCells){$taskCopies=3}
        for($taskCopy=0;$taskCopy -lt $taskCopies;$taskCopy++){$taskMontageGraphics.DrawImage($taskBitmap,(New-Object Drawing.Rectangle((12+$taskCopy*($taskRegion.width+4)),$taskRegion.offsetY,$taskRegion.width,$taskRegion.height)),$taskRegion.x,$taskRegion.y,$taskRegion.width,$taskRegion.height,[Drawing.GraphicsUnit]::Pixel)}
      }
      $taskScale=[Math]::Min(3,[Math]::Min([Windows.Media.Ocr.OcrEngine]::MaxImageDimension/$taskMontageWidth,[Windows.Media.Ocr.OcrEngine]::MaxImageDimension/$taskMontageHeight))
      $taskScaled=New-Object Drawing.Bitmap([int]($taskMontageWidth*$taskScale),[int]($taskMontageHeight*$taskScale));$taskGraphics=[Drawing.Graphics]::FromImage($taskScaled);$taskGraphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $taskGraphics.DrawImage($taskMontage,(New-Object Drawing.Rectangle(0,0,$taskScaled.Width,$taskScaled.Height)),0,0,$taskMontage.Width,$taskMontage.Height,[Drawing.GraphicsUnit]::Pixel)
      $taskMemory=New-Object IO.MemoryStream;$taskScaled.Save($taskMemory,[Drawing.Imaging.ImageFormat]::Png)
      $taskRandom=New-Object Windows.Storage.Streams.InMemoryRandomAccessStream;$taskWriter=New-Object Windows.Storage.Streams.DataWriter($taskRandom);$taskWriter.WriteBytes($taskMemory.ToArray());[void](Await-WinRt ($taskWriter.StoreAsync()) ([uint32]));[void]$taskWriter.DetachStream();$taskRandom.Seek(0)
      $taskDecoder=Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($taskRandom)) ([Windows.Graphics.Imaging.BitmapDecoder]);$taskSoftware=Await-WinRt ($taskDecoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
      $taskRecognized=Await-WinRt ($taskEngine.RecognizeAsync($taskSoftware)) ([Windows.Media.Ocr.OcrResult])
      if($taskFallbackCells){
        # Isolated single digits are often omitted by Windows OCR. Triplicate only the
        # captured digit pixels, require three identical reads, and map back to this frame.
        $taskFreshWords=@(foreach($taskRegion in $taskRegions){
          $taskPieces=@(foreach($taskLine in $taskRecognized.Lines){foreach($taskWord in $taskLine.Words){$taskBox=$taskWord.BoundingRect;$taskCenterY=($taskBox.Y+$taskBox.Height/2)/$taskScale;if($taskCenterY -ge $taskRegion.offsetY -and $taskCenterY -le $taskRegion.offsetY+$taskRegion.height){[pscustomobject]@{text=$taskWord.Text;x=$taskBox.X}}}})
          $taskPieces=@($taskPieces | Sort-Object x)
          $taskRepeated=(($taskPieces.text -join '').Normalize([Text.NormalizationForm]::FormKC)) -replace '\s',''
          $taskLength=[int]$taskRegion.glyphCount
          if($taskRepeated -notmatch '^\d+$' -or $taskRepeated.Length -ne $taskLength*3){continue}
          $taskValue=$taskRepeated.Substring(0,$taskLength)
          if($taskRepeated.Substring($taskLength,$taskLength) -ne $taskValue -or $taskRepeated.Substring($taskLength*2,$taskLength) -ne $taskValue){continue}
          [pscustomobject]@{text=$taskValue;x=$taskRegionX+($taskRegion.x+2)/$taskClientWidth;y=$taskRegionY+($taskRegion.y+2)/$taskClientHeight;width=($taskRegion.width-4)/$taskClientWidth;height=($taskRegion.height-4)/$taskClientHeight}
        })
        return [pscustomobject]@{words=$taskFreshWords}
      }
      $taskFreshWords=@(foreach($taskLine in $taskRecognized.Lines){foreach($taskWord in $taskLine.Words){
        $taskBox=$taskWord.BoundingRect;$taskBoxY=$taskBox.Y/$taskScale;$taskBoxCenterY=$taskBoxY+$taskBox.Height/$taskScale/2
        $taskRegion=@($taskRegions | Where-Object {$taskBoxCenterY -ge $_.offsetY -and $taskBoxCenterY -le $_.offsetY+$_.height})
        if($taskRegion.Count -ne 1){continue};$taskRegion=$taskRegion[0]
        [pscustomobject]@{text=$taskWord.Text;line=[array]::IndexOf($taskRegions,$taskRegion);x=$taskRegionX+($taskRegion.x+$taskBox.X/$taskScale-12)/$taskClientWidth;y=$taskRegionY+($taskRegion.y+$taskBoxY-$taskRegion.offsetY)/$taskClientHeight;width=$taskBox.Width/$taskScale/$taskClientWidth;height=$taskBox.Height/$taskScale/$taskClientHeight}
      }})
      return [pscustomobject]@{words=$taskFreshWords}
    }finally{foreach($taskResource in @($taskSoftware,$taskWriter,$taskRandom,$taskMemory,$taskGraphics,$taskScaled,$taskMontageGraphics,$taskMontage)){if($null -ne $taskResource){try{$taskResource.Dispose()}catch{}}}}
  }
  function Read-GoldRegion([double]$taskX,[double]$taskY,[double]$taskWidth,[double]$taskHeight,[bool]$taskPlayerRegion=$false) {
    $taskMaximumY=.5;if($ReadPlayers){$taskMaximumY=1}
    if(-not ([double]::IsNaN($taskX) -eq $false -and [double]::IsNaN($taskY) -eq $false -and [double]::IsNaN($taskWidth) -eq $false -and [double]::IsNaN($taskHeight) -eq $false) -or $taskX -lt 0 -or $taskY -lt 0 -or $taskWidth -le 0 -or $taskHeight -le 0 -or $taskX+$taskWidth -gt 1 -or $taskY+$taskHeight -gt $taskMaximumY){throw '识别区域需位于游戏画面内，坐标使用 0–1 的归一化数值。'}
    Assert-GameVisible
    $taskPixelX=$taskOrigin.X+[int][Math]::Floor($taskX*$taskClientWidth)
    $taskPixelY=$taskOrigin.Y+[int][Math]::Floor($taskY*$taskClientHeight)
    $taskPixelWidth=[int][Math]::Ceiling($taskWidth*$taskClientWidth)
    $taskPixelHeight=[int][Math]::Ceiling($taskHeight*$taskClientHeight)
    $taskDesktop=[System.Windows.Forms.SystemInformation]::VirtualScreen
    if($ImagePath){$taskDesktop=[pscustomobject]@{Left=0;Top=0;Right=$taskClientWidth;Bottom=$taskClientHeight}}
    if($taskPixelWidth -lt 8 -or $taskPixelHeight -lt 8 -or $taskPixelX -lt $taskDesktop.Left -or $taskPixelY -lt $taskDesktop.Top -or $taskPixelX+$taskPixelWidth -gt $taskDesktop.Right -or $taskPixelY+$taskPixelHeight -gt $taskDesktop.Bottom){throw '识别区域太小或不在可见屏幕内，请重新校准。'}
    Assert-GoldRegionVisible $taskPixelX $taskPixelY $taskPixelWidth $taskPixelHeight
    $taskBitmap=$null;$taskGraphics=$null;$taskScaled=$null;$taskScaleGraphics=$null;$taskMemory=$null;$taskRandom=$null;$taskWriter=$null;$taskSoftware=$null
    try {
      $taskBitmap=New-Object System.Drawing.Bitmap($taskPixelWidth,$taskPixelHeight)
      $taskGraphics=[System.Drawing.Graphics]::FromImage($taskBitmap)
      if($ImagePath){$taskGraphics.DrawImage($taskFixtureImage,(New-Object Drawing.Rectangle(0,0,$taskPixelWidth,$taskPixelHeight)),$taskPixelX,$taskPixelY,$taskPixelWidth,$taskPixelHeight,[Drawing.GraphicsUnit]::Pixel)}
      else{$taskGraphics.CopyFromScreen($taskPixelX,$taskPixelY,0,0,$taskBitmap.Size,[System.Drawing.CopyPixelOperation]::SourceCopy)}
      Assert-GoldRegionVisible $taskPixelX $taskPixelY $taskPixelWidth $taskPixelHeight
      $taskCachedRead=$null
      if($taskPlayerRegion -and $script:taskNumericRegions){$taskCachedRead=Read-ScoreboardNumericRows $taskBitmap @() @() $taskX $taskY}
      if($taskCachedRead){$taskWords=@($taskCachedRead.words);$taskAlternateText=$null;$taskRecognized=[pscustomobject]@{Text=''}}else{
      $taskScale=[Math]::Min([double]3,[Math]::Min([Windows.Media.Ocr.OcrEngine]::MaxImageDimension/$taskPixelWidth,[Windows.Media.Ocr.OcrEngine]::MaxImageDimension/$taskPixelHeight))
      $taskScaled=New-Object System.Drawing.Bitmap([int][Math]::Floor($taskPixelWidth*$taskScale),[int][Math]::Floor($taskPixelHeight*$taskScale))
      $taskScaleGraphics=[System.Drawing.Graphics]::FromImage($taskScaled)
      $taskScaleGraphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $taskScaleGraphics.DrawImage($taskBitmap,0,0,$taskScaled.Width,$taskScaled.Height)
      $taskMemory=New-Object System.IO.MemoryStream
      $taskScaled.Save($taskMemory,[System.Drawing.Imaging.ImageFormat]::Png)
      $taskRandom=New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
      $taskWriter=New-Object Windows.Storage.Streams.DataWriter($taskRandom)
      $taskWriter.WriteBytes($taskMemory.ToArray())
      [void](Await-WinRt ($taskWriter.StoreAsync()) ([uint32]))
      [void]$taskWriter.DetachStream()
      $taskRandom.Seek(0)
      $taskDecoder=Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($taskRandom)) ([Windows.Graphics.Imaging.BitmapDecoder])
      $taskSoftware=Await-WinRt ($taskDecoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
      $taskRecognized=Await-WinRt ($taskEngine.RecognizeAsync($taskSoftware)) ([Windows.Media.Ocr.OcrResult])
      $taskAlternateText=$null
      if(-not $AutoLocate -and -not $taskPlayerRegion -and $taskProfileEngine -and $taskProfileEngine.RecognizerLanguage.LanguageTag -ne $taskEngine.RecognizerLanguage.LanguageTag){
        $taskAlternate=Await-WinRt ($taskProfileEngine.RecognizeAsync($taskSoftware)) ([Windows.Media.Ocr.OcrResult])
        $taskAlternateText=$taskAlternate.Text
      }
      Assert-GoldRegionVisible $taskPixelX $taskPixelY $taskPixelWidth $taskPixelHeight
      $taskRecognizedLines=@($taskRecognized.Lines)
      $taskWords=@(for($taskLineIndex=0;$taskLineIndex -lt $taskRecognizedLines.Count;$taskLineIndex++){
        foreach($taskWord in $taskRecognizedLines[$taskLineIndex].Words){
          $taskBox=$taskWord.BoundingRect
          [pscustomobject]@{text=$taskWord.Text;line=$taskLineIndex;x=$taskX+($taskBox.X/$taskScale)/$taskClientWidth;y=$taskY+($taskBox.Y/$taskScale)/$taskClientHeight;width=($taskBox.Width/$taskScale)/$taskClientWidth;height=($taskBox.Height/$taskScale)/$taskClientHeight}
        }
      })
      }
      $taskPortraits=@()
      if($taskPlayerRegion){
        $taskMatches=@(Find-PlayerPortraits $taskBitmap $taskWords $taskX $taskY)
        if(-not $taskCachedRead -and $taskMatches.Count -ge 6){
          $taskNumericRead=Read-ScoreboardNumericRows $taskBitmap $taskWords $taskMatches $taskX $taskY
          if($taskNumericRead){$taskWords=@($taskNumericRead.words);$taskMatches=@(Find-PlayerPortraits $taskBitmap $taskWords $taskX $taskY)}
        }
        $taskPortraits=@(foreach($taskMatch in $taskMatches){[pscustomobject]@{team=$taskMatch.Team;championId=$taskMatch.ChampionId;method=$taskMatch.Method;x=$taskX+$taskMatch.X/$taskClientWidth;y=$taskY+$taskMatch.Y/$taskClientHeight;width=$taskMatch.Width/$taskClientWidth;height=$taskMatch.Height/$taskClientHeight;score=$taskMatch.Score;margin=$taskMatch.Margin}})
        $taskGlyphCs=@()
        if($taskMatches.Count){
          $taskNativeWords=@(foreach($taskWord in $taskWords){$taskNativeWord=New-Object RiftCastNumericWord;$taskNativeWord.Text=$taskWord.text.Normalize([Text.NormalizationForm]::FormKC);$taskNativeWord.X=($taskWord.x-$taskX)*$taskClientWidth;$taskNativeWord.Y=($taskWord.y-$taskY)*$taskClientHeight;$taskNativeWord.Width=$taskWord.width*$taskClientWidth;$taskNativeWord.Height=$taskWord.height*$taskClientHeight;$taskNativeWord})
          $taskGlyphCs=@([RiftCastPortraitMatcher]::ReadCs($taskBitmap,$taskNativeWords,$taskMatches))
        }
        $taskConflictCs=@()
        foreach($taskCsWord in $taskGlyphCs){
          $taskFreshWord=[pscustomobject]@{text=$taskCsWord.Text;x=$taskX+$taskCsWord.X/$taskClientWidth;y=$taskY+$taskCsWord.Y/$taskClientHeight;width=$taskCsWord.Width/$taskClientWidth;height=$taskCsWord.Height/$taskClientHeight}
          $taskExisting=@($taskWords | Where-Object {[Math]::Abs($_.x+($_.width/2)-$taskFreshWord.x-($taskFreshWord.width/2)) -lt $taskFreshWord.width -and [Math]::Abs($_.y+($_.height/2)-$taskFreshWord.y-($taskFreshWord.height/2)) -lt $taskFreshWord.height*.65})
          $taskExistingNumeric=@($taskExisting | Where-Object {$_.text.Normalize([Text.NormalizationForm]::FormKC) -match '^\d{1,4}$'})
          # Reject numeric disagreements. A glyph match can recover omitted or nonnumeric OCR cells.
          if(@($taskExistingNumeric | Where-Object {$_.text.Normalize([Text.NormalizationForm]::FormKC) -ne $taskFreshWord.text}).Count){$taskWords=@($taskWords | Where-Object {$taskExisting -notcontains $_});$taskConflictCs+=@($taskFreshWord)}
          elseif($taskExistingNumeric.Count -eq 0){$taskWords=@($taskWords | Where-Object {$taskExisting -notcontains $_})+@($taskFreshWord)}
          if($Diagnostics){$script:taskGlyphDiagnostics+=@([pscustomobject]@{text=$taskCsWord.Text;score=$taskCsWord.Score})}
        }
        $taskMissingCells=@(foreach($taskCell in @([RiftCastPortraitMatcher]::FindCsCells($taskBitmap,$taskMatches))){
          $taskCenterX=$taskX+($taskCell.X+$taskCell.Width/2)/$taskClientWidth;$taskCenterY=$taskY+($taskCell.Y+$taskCell.Height/2)/$taskClientHeight
          $taskNearby=@($taskWords | Where-Object {[Math]::Abs($_.x+($_.width/2)-$taskCenterX) -lt $taskCell.Width/$taskClientWidth -and [Math]::Abs($_.y+($_.height/2)-$taskCenterY) -lt $taskCell.Height/$taskClientHeight*.65})
          $taskBlocked=@($taskConflictCs | Where-Object {[Math]::Abs($_.x+($_.width/2)-$taskCenterX) -lt $taskCell.Width/$taskClientWidth -and [Math]::Abs($_.y+($_.height/2)-$taskCenterY) -lt $taskCell.Height/$taskClientHeight*.65})
          if(@($taskNearby | Where-Object {$_.text.Normalize([Text.NormalizationForm]::FormKC) -match '^\d{1,4}$'}).Count -or $taskBlocked.Count){continue}
          if($taskCell.X -lt 2 -or $taskCell.Y -lt 2 -or $taskCell.X+$taskCell.Width+2 -gt $taskBitmap.Width -or $taskCell.Y+$taskCell.Height+2 -gt $taskBitmap.Height){continue}
          [pscustomobject]@{x=[int]$taskCell.X-2;y=[int]$taskCell.Y-2;width=[int]$taskCell.Width+4;height=[int]$taskCell.Height+4;glyphCount=$taskCell.GlyphCount}
        })
        if($taskMissingCells.Count){
          $taskCsFallback=Read-ScoreboardNumericRows $taskBitmap @() @() $taskX $taskY $taskMissingCells
          foreach($taskFreshWord in @($taskCsFallback.words)){
            $taskExisting=@($taskWords | Where-Object {[Math]::Abs($_.x+($_.width/2)-$taskFreshWord.x-($taskFreshWord.width/2)) -lt $taskFreshWord.width -and [Math]::Abs($_.y+($_.height/2)-$taskFreshWord.y-($taskFreshWord.height/2)) -lt $taskFreshWord.height*.65})
            $taskWords=@($taskWords | Where-Object {$taskExisting -notcontains $_})+@($taskFreshWord)
          }
          if($Diagnostics){$script:taskPortraitDiagnostics.csFallback=@($taskCsFallback.words.text)}
        }
        # An old layout cannot trap the worker in permanently empty number strips.
        # Recheck current-frame cells, then relocalize on the next frame with a bounded retry interval.
        if($taskCachedRead -and $script:taskNumericRegions){
          $taskCompleteCells=0
          foreach($taskRegion in @($script:taskNumericRegions | Where-Object {$_.kind -eq 'stats'})){
            $taskCellWords=@($taskWords | Where-Object {($_.x+($_.width/2)-$taskX)*$taskClientWidth -ge $taskRegion.x -and ($_.x+($_.width/2)-$taskX)*$taskClientWidth -le $taskRegion.x+$taskRegion.width -and ($_.y+($_.height/2)-$taskY)*$taskClientHeight -ge $taskRegion.y -and ($_.y+($_.height/2)-$taskY)*$taskClientHeight -le $taskRegion.y+$taskRegion.height} | Sort-Object x)
            $taskCellText=($taskCellWords.text -join ' ').Normalize([Text.NormalizationForm]::FormKC)
            $taskCellScores=[regex]::Matches($taskCellText,'(?<!\d)\d{1,3}\s*/\s*\d{1,3}\s*/\s*\d{1,3}(?!\d)')
            if($taskCellScores.Count -eq 1 -and $taskCellText.Replace($taskCellScores[0].Value,'').Trim() -match '^\d{1,4}$'){$taskCompleteCells++}
          }
          if(($taskCompleteCells -lt 10 -or $taskMatches.Count -lt 6) -and (-not $script:taskLastForcedLocate -or ([DateTime]::UtcNow-$script:taskLastForcedLocate).TotalSeconds -ge 3)){
            $script:taskLastForcedLocate=[DateTime]::UtcNow;$script:taskNumericRegions=$null;$script:taskPlayerReadRoi=$null;$script:taskPlayerNeedsBroad=$true
            [RiftCastPortraitMatcher]::ResetLayout()
          }
          if($Diagnostics){$script:taskPortraitDiagnostics.completeNumericCells=$taskCompleteCells}
        }
      }
      return [pscustomobject]@{text=$taskRecognized.Text;alternateText=$taskAlternateText;words=$taskWords;portraits=$taskPortraits}
    } finally {
      foreach($taskResource in @($taskSoftware,$taskWriter,$taskRandom,$taskMemory,$taskScaleGraphics,$taskScaled,$taskGraphics,$taskBitmap)){if($null -ne $taskResource){try{$taskResource.Dispose()}catch{}}}
    }
  }
  function Find-GoldRegions($taskRead) {
    $taskChunks=New-Object System.Collections.Generic.List[object]
    foreach($taskLine in ($taskRead.words | Group-Object line)){
      $taskChunk=New-Object System.Collections.Generic.List[object]
      $taskPreviousWord=$null
      foreach($taskWord in ($taskLine.Group | Sort-Object x)){
        if($taskPreviousWord){
          $taskGap=($taskWord.x-$taskPreviousWord.x-$taskPreviousWord.width)*$taskClientWidth
          $taskHeight=[Math]::Max($taskWord.height,$taskPreviousWord.height)*$taskClientHeight
          if($taskGap -gt [Math]::Max([double]4,$taskHeight*.4)){$taskChunks.Add(@($taskChunk.ToArray()));$taskChunk.Clear()}
        }
        $taskChunk.Add($taskWord);$taskPreviousWord=$taskWord
      }
      if($taskChunk.Count){$taskChunks.Add(@($taskChunk.ToArray()))}
    }
    $taskCandidates=New-Object System.Collections.Generic.List[object]
    foreach($taskChunk in $taskChunks){
      $taskText=($taskChunk.text -join ' ').Normalize([Text.NormalizationForm]::FormKC).Trim()
      $taskText=[regex]::Replace($taskText,'(?<=\d)\s*[·∙]\s*(?=\d)','.')
      $taskText=[regex]::Replace($taskText,'\s*([.,])\s*','$1')
      $taskText=[regex]::Replace($taskText,'(\d)\s+([kK万])$','$1$2')
      if($taskText -notmatch '^\d+(?:\.\d{1,3})?[kK]$' -and $taskText -notmatch '^\d+(?:\.\d{1,4})?万$'){continue}
      $taskValue=[double]::Parse($taskText.Substring(0,$taskText.Length-1),[Globalization.CultureInfo]::InvariantCulture)
      if($taskText.EndsWith('万')){$taskValue*=10000}else{$taskValue*=1000}
      if($taskValue -lt 1000 -or $taskValue -gt 1000000){continue}
      $taskLeft=($taskChunk.x | Measure-Object -Minimum).Minimum
      $taskTop=($taskChunk.y | Measure-Object -Minimum).Minimum
      $taskRight=($taskChunk | ForEach-Object {$_.x+$_.width} | Measure-Object -Maximum).Maximum
      $taskBottom=($taskChunk | ForEach-Object {$_.y+$_.height} | Measure-Object -Maximum).Maximum
      $taskCenterX=($taskLeft+$taskRight)/2;$taskCenterY=($taskTop+$taskBottom)/2
      if($taskCenterX -lt .2 -or $taskCenterX -gt .8 -or $taskBottom -gt .12){continue}
      $taskCandidates.Add([pscustomobject]@{text=$taskText;x=$taskLeft;y=$taskTop;width=$taskRight-$taskLeft;height=$taskBottom-$taskTop;centerX=$taskCenterX;centerY=$taskCenterY})
    }
    if($taskCandidates.Count -ne 2){throw "顶部计分栏识别到 $($taskCandidates.Count) 个明确的经济候选，需要唯一的双方数字；请显示原生计分栏，或手动校准区域。"}
    $taskOrdered=@($taskCandidates | Sort-Object centerX);$taskBlue=$taskOrdered[0];$taskRed=$taskOrdered[1]
    if($taskBlue.centerX -ge .48 -or $taskRed.centerX -le .52 -or [Math]::Abs($taskBlue.centerY-$taskRed.centerY) -gt [Math]::Max($taskBlue.height,$taskRed.height) -or $taskBlue.height -lt $taskRed.height*.5 -or $taskRed.height -lt $taskBlue.height*.5){throw '顶部候选数字位置无法确认蓝红方，请手动校准区域。'}
    function Pad-GoldRegion($taskCandidate){
      $taskPaddingX=[Math]::Max(4/$taskClientWidth,$taskCandidate.height*$taskClientHeight*.4/$taskClientWidth)
      $taskPaddingY=[Math]::Max(3/$taskClientHeight,$taskCandidate.height*.3)
      $taskLeft=[Math]::Max([double]0,$taskCandidate.x-$taskPaddingX);$taskTop=[Math]::Max([double]0,$taskCandidate.y-$taskPaddingY)
      $taskRight=[Math]::Min([double]1,$taskCandidate.x+$taskCandidate.width+$taskPaddingX);$taskBottom=[Math]::Min([double]0.12,$taskCandidate.y+$taskCandidate.height+$taskPaddingY)
      return [pscustomobject]@{x=$taskLeft;y=$taskTop;width=$taskRight-$taskLeft;height=$taskBottom-$taskTop}
    }
    return [pscustomobject]@{ok=$true;blueText=$taskBlue.text;redText=$taskRed.text;blueRoi=(Pad-GoldRegion $taskBlue);redRoi=(Pad-GoldRegion $taskRed)}
  }
  if($AutoLocate){
    $taskTop=Read-GoldRegion .2 0 .6 .12
    return (Find-GoldRegions $taskTop)
  }else{
    $taskResult=@{ok=$true}
    if(-not $SkipTeam){
      try{
        $taskBlue=Read-GoldRegion $BlueX $BlueY $BlueWidth $BlueHeight
        $taskRed=Read-GoldRegion $RedX $RedY $RedWidth $RedHeight
        $taskResult.blueText=Select-GoldText $taskBlue;$taskResult.redText=Select-GoldText $taskRed
      }catch{$taskResult.ok=$false;$taskResult.error=$_.Exception.Message}
    }
    if($ReadPlayers){
      try{
        $taskPlayerContext="$taskClientWidth|$taskClientHeight|$PlayersX|$PlayersY|$PlayersWidth|$PlayersHeight|$taskManifestKey"
        if($script:taskPlayerContext -ne $taskPlayerContext){
          $script:taskPlayerContext=$taskPlayerContext;$script:taskPlayerReadRoi=$null;$script:taskNumericRegions=$null;$script:taskPlayerNeedsBroad=$false;$script:taskLastForcedLocate=$null
          [RiftCastPortraitMatcher]::ResetLayout()
        }
        $taskPlayerRoi=$script:taskPlayerReadRoi
        if(-not $taskPlayerRoi){
          $taskPlayerRoi=[pscustomobject]@{x=$PlayersX;y=$PlayersY;width=$PlayersWidth;height=$PlayersHeight}
          # Native widescreen spectator scoreboards occupy a compact bottom panel.
          # Explicit calibration and cropped attachment coordinates keep their requested region.
          if(-not $script:taskPlayerNeedsBroad -and $PlayersX -eq 0 -and $PlayersY -eq .4 -and $PlayersWidth -eq 1 -and $PlayersHeight -eq .6 -and $taskClientWidth/$taskClientHeight -gt 1.7 -and $taskClientWidth/$taskClientHeight -lt 1.85){
            $taskPlayerRoi=[pscustomobject]@{x=.31;y=.76;width=.38;height=.24}
          }
        }
        $script:taskPlayerNeedsBroad=$false
        $taskPlayers=Read-GoldRegion $taskPlayerRoi.x $taskPlayerRoi.y $taskPlayerRoi.width $taskPlayerRoi.height $true
        if(-not $script:taskPlayerNeedsBroad -and -not $script:taskPlayerReadRoi -and $taskPlayers.portraits.Count -ge 8){$script:taskPlayerReadRoi=$taskPlayerRoi}
        if($Diagnostics){$taskResult.playerReadRoi=$taskPlayerRoi}
        $taskResult.playerWords=@($taskPlayers.words)
        $taskResult.playerPortraits=@($taskPlayers.portraits)
      }catch{$taskResult.playerError=$_.Exception.Message}
    }
    if($Diagnostics -and $taskPortraitDiagnostics){$taskResult.portraitDiagnostics=$taskPortraitDiagnostics}
    if($Diagnostics -and $taskGlyphDiagnostics){$taskResult.glyphDiagnostics=$taskGlyphDiagnostics}
    return [pscustomobject]$taskResult
  }
} catch {
  $taskFailure=@{ok=$false;error=$_.Exception.Message}
  if($Diagnostics -and $taskTop -and $taskTop.words){
    $taskFailure.diagnostics=@{clientWidth=$taskClientWidth;clientHeight=$taskClientHeight;numericWords=@($taskTop.words | Where-Object {$_.text.Normalize([Text.NormalizationForm]::FormKC) -match '^[\p{N}\p{P}\s kK万]+$'} | Select-Object -First 30 text,x,y,width,height)}
  }
  return [pscustomobject]$taskFailure
}
 finally {
  if($taskFixtureImage){$taskFixtureImage.Dispose()}
}
}

try {
  Initialize-SpectatorOcr
  if($InitializeOnly){return}
  $taskArguments=@{}
  foreach($taskParameter in $PSBoundParameters.Keys){if($taskParameter -ne 'InitializeOnly'){$taskArguments[$taskParameter]=$PSBoundParameters[$taskParameter]}}
  $taskReading=Read-SpectatorFrame @taskArguments
  $taskReading | ConvertTo-Json -Depth 6 -Compress
  if(-not $taskReading.ok){exit 1}
}catch{
  [pscustomobject]@{ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Depth 4 -Compress
  if(-not $InitializeOnly){exit 1}
  throw
}
