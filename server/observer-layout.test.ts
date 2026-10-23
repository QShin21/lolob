import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

test('native reader compiles on Windows PowerShell and decodes captured 16.21 buff expiry values', {skip:process.platform!=='win32'}, async()=>{
  const script=`
$ErrorActionPreference='Stop'
Add-Type -Path './scripts/native/observer-reader.cs'
$flags=[Reflection.BindingFlags]'NonPublic,Static'
$decode=[RiftCastObserverReader].GetMethod('DecodeBuffExpiry',$flags)
$select=[RiftCastObserverReader].GetMethod('SelectLayout',$flags)
$values=@(0x8f8d539dL,0x5813ef9cL,0x1ce25f89L) | ForEach-Object { $decode.Invoke($null,@([uint32]$_)) }
$rejected=0
foreach($bits in @(0x2e225eedL,0x2e225eeeL)) {try {$null=$decode.Invoke($null,@([uint32]$bits))} catch {$rejected++}}
$old=$select.Invoke($null,@('EE3C887B4579AEAB12CA77B2A43CC1CC3411A8AA30BC43D2DFEA856F6CE497C8'))
$current=$select.Invoke($null,@('6CA9446AC4E65A311CB0796B72A459097CDF912A337619D1D1FD207E01AEDD6F'))
$unknown=$select.Invoke($null,@('6CA9446AC4E65A311CB0796B72A459097CDF912A337619D1D1FD207E01AEDD60'))
@{values=$values;rejected=$rejected;old=$old.Profile;current=$current.Profile;unknown=($null -eq $unknown)}|ConvertTo-Json -Compress
`;
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:20000});
  const result=JSON.parse(stdout);
  [463.3028259277344,594.064697265625,25000].forEach((value,i)=>assert(Math.abs(result.values[i]-value)<.001));
  assert.equal(result.rejected,2);
  assert.equal(result.old,'cn-16.20.824.8524');assert.equal(result.current,'cn-16.21.829.9102');assert.equal(result.unknown,true);
});
