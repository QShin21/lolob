import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSeed, applyAction, resetRuntimeState } from './state';
import { takeBlockReason } from '../shared/presentation';

test('restart releases an orphaned TAKE without publishing pending content', () => {
  const s=createSeed();
  const candidate=applyAction(s,{type:'take',scene:'lineup'});
  s.production!.application=structuredClone(candidate.production!.application);
  const program=structuredClone(s.production!.program), scene=s.programScene;
  resetRuntimeState(s);
  assert.equal(s.production!.application!.status,'failed');
  assert.equal(s.production!.application!.id,candidate.production!.application!.id);
  assert.deepEqual(s.production!.program,program);
  assert.equal(s.programScene,scene);
  s.connections.obs.status='connected';
  s.production!.control={owner:'test',name:'test'};
  assert.equal(takeBlockReason(s,{id:'test',name:'test',role:'director'}),'');
});

for(const status of ['applied','confirmed','failed'] as const)test(`restart preserves ${status} receipt`,()=>{
  const s=applyAction(createSeed(),{type:'take'});
  s.production!.application!.status=status;
  const receipt=structuredClone(s.production!.application);
  resetRuntimeState(s);
  assert.deepEqual(s.production!.application,receipt);
});

test('HTTP restart recovers saved TAKE and rejects offline switches without changing program', {timeout:30000},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'riftcast-take-recovery-'));
  const s=applyAction(createSeed(),{type:'take'});
  await writeFile(path.join(dir,'state.json'),JSON.stringify(s));
  // Ask the OS for an available port instead of guessing inside Windows' reserved ranges.
  const listener=createServer();
  await new Promise<void>((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
  const port=(listener.address() as AddressInfo).port;
  await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
  const base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{
    cwd:process.cwd(),windowsHide:true,stdio:['ignore','ignore','pipe','ipc'],
    env:{...process.env,PORT:String(port),RIFTCAST_DATA_DIR:dir,RIFTCAST_AUTO_CONNECT:'0',RIFTCAST_OBS_AUTOSTART:'0',RIFTCAST_OFFLINE:'1'},
  });
  let errors='';child.stderr?.on('data',b=>{errors+=b;});
  const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));
  try{
    let ready=false;
    for(let i=0;i<100;i++){
      try{ready=(await fetch(base+'/api/health')).ok;}catch{}
      if(ready)break;
      if(child.exitCode!==null)throw new Error(errors);
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(ready,errors);
    const before=await fetch(base+'/api/state').then(r=>r.json());
    assert.equal(before.production.application.status,'failed');
    for(const action of [{type:'take',scene:'lineup'},{type:'production',command:{op:'immediate',action:'analysis-off'}}]){
      const response=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action)});
      assert.equal(response.status,400);
      assert.match((await response.json()).error,/连接 OBS/);
      const after=await fetch(base+'/api/state').then(r=>r.json());
      assert.equal(after.programScene,before.programScene);
      assert.deepEqual(after.production.program,before.production.program);
      assert.deepEqual(after.production.application,before.production.application);
    }
  }finally{
    if(child.exitCode===null)child.send({type:'riftcast-shutdown'});
    await exited;
    await rm(dir,{recursive:true,force:true});
  }
});
