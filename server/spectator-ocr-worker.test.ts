import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SpectatorOcrWorker } from './spectator-ocr-worker';

function processWorker(mode = 'normal'): ChildProcessWithoutNullStreams {
  const source = `const readline=require('node:readline');let count=0,active=0;if(${JSON.stringify(mode)}!=='startup-hang')process.stdout.write(JSON.stringify({type:'ready',protocol:1})+'\\n');readline.createInterface({input:process.stdin}).on('line',line=>{const request=JSON.parse(line);if(request.type==='shutdown'){if(${JSON.stringify(mode)}==='hang'||${JSON.stringify(mode)}==='startup-hang')return;process.exit(0);}count++;active++;if(${JSON.stringify(mode)}==='hang')return;if(${JSON.stringify(mode)}==='broken'){process.stdout.write('not-json\\n');return;}const reading={ok:true,count,active,pid:process.pid,args:request.args};setTimeout(()=>{active--;process.stdout.write(JSON.stringify({type:'result',id:request.id,reading})+'\\n');},${mode === 'slow' ? 40 : 0});});`;
  return spawn(process.execPath, ['-e', source], { windowsHide: true, stdio: 'pipe' });
}

test('warm OCR requests share one process and preserve Unicode paths through the JSON protocol',async()=>{
  let launches=0;
  const worker=new SpectatorOcrWorker({spawn:()=>{launches++;return processWorker();}});
  try{
    await worker.ready();await worker.ready();
    const args=['-ImagePath','E:\\中文 图片\\first.png','-PlayersY','0.4'];
    const first=await worker.request(args),second=await worker.request(['-ImagePath','E:\\中文 图片\\second.png']);
    assert.equal(launches,1);assert.equal(first.pid,second.pid);assert.equal(first.count,1);assert.equal(second.count,2);assert.deepEqual(first.args,args);
  }finally{await worker.close();}
  await assert.rejects(worker.request([]),/已关闭/);
});

test('initialization can time out and restart before any frame is read',async()=>{
  const children:ChildProcessWithoutNullStreams[]=[];
  const worker=new SpectatorOcrWorker({timeoutMs:250,closeTimeoutMs:80,spawn:()=>{const child=processWorker(children.length?'normal':'startup-hang');children.push(child);return child;}});
  try{
    await assert.rejects(worker.ready(),/初始化超时/);
    await worker.ready();const first=await worker.request(['-ImagePath','first-frame.png']);
    assert.equal(first.count,1);assert.equal(children.length,2);assert.ok(children[0].exitCode!==null||children[0].signalCode!==null);
  }finally{await worker.close();}
});

test('closing during initialization rejects readiness and closes the uninitialized process',async()=>{
  const child=processWorker('startup-hang');
  const worker=new SpectatorOcrWorker({spawn:()=>child,closeTimeoutMs:50});
  const ready=worker.ready();const rejected=assert.rejects(ready,/已关闭/);
  await new Promise<void>(resolve=>setImmediate(resolve));await worker.close();await rejected;
  assert.ok(child.exitCode!==null||child.signalCode!==null);
});

test('concurrent callers serialize frames so responses cannot cross between samples',async()=>{
  const worker=new SpectatorOcrWorker({spawn:()=>processWorker('slow')});
  try{
    const readings=await Promise.all([worker.request(['-ImagePath','frame-a.png']),worker.request(['-ImagePath','frame-b.png']),worker.request(['-ImagePath','frame-c.png'])]);
    assert.deepEqual(readings.map(reading=>reading.active),[1,1,1]);assert.deepEqual(readings.map(reading=>reading.count),[1,2,3]);
    assert.deepEqual(readings.map(reading=>(reading.args as string[])[1]),['frame-a.png','frame-b.png','frame-c.png']);
  }finally{await worker.close();}
});

test('timeouts terminate the stalled process and the next request recovers with a new runtime',async()=>{
  const children:ChildProcessWithoutNullStreams[]=[];
  const worker=new SpectatorOcrWorker({timeoutMs:250,closeTimeoutMs:80,spawn:()=>{const child=processWorker(children.length?'normal':'hang');children.push(child);return child;}});
  try{
    await assert.rejects(worker.request(['-ReadPlayers']),/超时/);
    const recovered=await worker.request(['-ReadPlayers']);assert.equal(recovered.ok,true);assert.equal(children.length,2);assert.notEqual(children[0].pid,children[1].pid);assert.ok(children[0].exitCode!==null||children[0].signalCode!==null);
  }finally{await worker.close();}
});

test('invalid protocol output is discarded without logging contents and a later request restarts cleanly',async()=>{
  let launches=0;
  const worker=new SpectatorOcrWorker({closeTimeoutMs:80,spawn:()=>processWorker(launches++?'normal':'broken')});
  try{
    await assert.rejects(worker.request(['-ReadPlayers']),/无效通信响应/);
    assert.equal((await worker.request(['-ReadPlayers'])).ok,true);assert.equal(launches,2);
    await assert.rejects(worker.request(['-ImagePath','bad\npath.png']),/参数无效/);
  }finally{await worker.close();}
});

test('closing during a stuck sample rejects queued work and leaves no worker process alive',async()=>{
  const child=processWorker('hang');
  const worker=new SpectatorOcrWorker({spawn:()=>child,closeTimeoutMs:50});
  const reading=worker.request(['-ReadPlayers']);const rejected=assert.rejects(reading,/已关闭/);
  const queued=worker.request(['-ImagePath','queued-frame.png']);const queuedRejected=assert.rejects(queued,/已关闭/);
  // Let the queued request establish its child before shutting down.
  await new Promise<void>(resolve=>setImmediate(resolve));
  await worker.close();await Promise.all([rejected,queuedRejected]);
  assert.ok(child.exitCode!==null||child.signalCode!==null);await worker.close();
});

test('the PowerShell protocol initializes once, validates arguments, and recovers after an invalid request', {skip:process.platform!=='win32'},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'riftcast-ocr-protocol-'));
  const scriptFile=path.join(directory,'spectator-ocr-worker.ps1');
  let worker:SpectatorOcrWorker|undefined;
  try{
    await writeFile(scriptFile,await readFile(new URL('../scripts/spectator-ocr-worker.ps1',import.meta.url)));
    await writeFile(path.join(directory,'read-spectator-gold.ps1'),`param([switch]$InitializeOnly)
$script:taskFakeReads=0
function Read-SpectatorFrame {
  param([string]$ImagePath,[double]$BlueX,[switch]$ReadPlayers,[switch]$SkipTeam)
  $script:taskFakeReads++
  return [pscustomobject]@{ok=$true;count=$script:taskFakeReads;image=$ImagePath;blueX=$BlueX;players=[bool]$ReadPlayers;skip=[bool]$SkipTeam}
}
`, 'utf8');
    worker=new SpectatorOcrWorker({spawn:()=>spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',scriptFile],{windowsHide:true,stdio:'pipe'})});
    await worker.ready();
    const first=await worker.request(['-ImagePath','E:\\中文 Images\\frame 1.png','-BlueX','0.33','-ReadPlayers','-SkipTeam']);
    assert.equal(first.ok,true);assert.equal(first.count,1);assert.equal(first.image,'E:\\中文 Images\\frame 1.png');assert.equal(first.blueX,.33);assert.equal(first.players,true);assert.equal(first.skip,true);
    assert.equal((await worker.request(['-BlueX','Infinity'])).ok,false);
    const second=await worker.request(['-ImagePath','frame2.png']);assert.equal(second.ok,true);assert.equal(second.count,2);
  }finally{
    await worker?.close();assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));assert.ok(path.basename(directory).startsWith('riftcast-ocr-protocol-'));await rm(directory,{recursive:true,force:true});
  }
});
