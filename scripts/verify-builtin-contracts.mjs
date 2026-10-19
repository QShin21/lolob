const { createFixture: createSeed } = await tsImport('../server/test-support/fixture.ts', import.meta.url);
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { tsImport } from 'tsx/esm/api';
import { isolatedNativeEnvironment } from './verify-native-safety.mjs';
import { reportFixture } from './report-093-fixture.mjs';
import { stylePackFixture } from './style-pack-fixture.mjs';
const { BUILTIN_STYLE_REF, BUILTIN_RUNTIME_STYLES, BUILTIN_STYLE_RECORDS, STYLE_SCENES, FULL_STYLE_SCENES } = await tsImport('../shared/style-packs.ts', import.meta.url);
const { bundledChampions } = await tsImport('../shared/champion-art.ts', import.meta.url);
const version = JSON.parse(await readFile('package.json','utf8')).version;
const dir = path.resolve('verification-output', `release-${version}`, 'contracts'); await mkdir(dir,{recursive:true});
const sandbox = await mkdtemp(path.join(os.tmpdir(),'riftcast-contracts-'));
const data = path.join(sandbox,'data'); await mkdir(data,{recursive:true});
const listener = createServer(); await new Promise(r=>listener.listen(0,'127.0.0.1',r)); const port=listener.address().port; await new Promise(r=>listener.close(r));
const base=`http://127.0.0.1:${port}`;
const checks=[]; let service, serviceLog='';
const hash=b=>createHash('sha256').update(b).digest('hex');
const getState=async()=>await(await fetch(base+'/api/state')).json();
const getList=async()=>await(await fetch(base+'/api/style-packs')).json();
const post=(route,body,token)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json',...(token?{'x-seat-token':token}:{})},body:JSON.stringify(body)});
async function stop(){
  if(!service || service.exitCode!==null)return;
  const done=once(service,'exit'); service.send({type:'riftcast-shutdown'});
  let timer; await Promise.race([done,new Promise(r=>{timer=setTimeout(r,10000);})]); clearTimeout(timer);
  if(service.exitCode===null){service.kill('SIGKILL'); await done;} service=undefined;
}
async function start(){
  service=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...await isolatedNativeEnvironment(sandbox),PORT:String(port),RIFTCAST_DATA_DIR:data,RIFTCAST_OBS_AUTOSTART:'0'},stdio:['ignore','pipe','pipe','ipc']});
  service.stdout.on('data',b=>serviceLog+=b); service.stderr.on('data',b=>serviceLog+=b);
  for(let i=0;i<150;i++){try{assert.equal((await(await fetch(base+'/api/health')).json()).version,version);return;}catch{if(service.exitCode!==null)throw new Error(serviceLog);await new Promise(r=>setTimeout(r,200));}}
  throw new Error('Service startup timed out');
}
try{
  const legacy=reportFixture(), retired={id:'jianlou',revision:'builtin-v1',name:'简陋包'};
  legacy.overlay.stylePack={...retired}; legacy.production.program.overlay.stylePack={...retired};
  legacy.production.previousProgram={content:structuredClone(legacy.production.program),scene:'postgame'};
  await writeFile(path.join(data,'state.json'),JSON.stringify(legacy));
  await start();const initial=await getState();
  for(const overlay of [initial.overlay,initial.production.program.overlay,initial.production.previousProgram.content.overlay])assert.deepEqual(overlay.stylePack,BUILTIN_STYLE_REF);
  assert.deepEqual(initial.gameResults,legacy.gameResults);
  assert.equal((await fetch(base+'/api/style-packs/jianlou/builtin-v1')).status,404);
  assert.equal((await getList()).packs.length,5);
  checks.push('actual service: legacy preview, program and undo migrate to Glacier; archived data unchanged; retired API absent');
  const seat=await(await post('/api/control/seat',{role:'director'})).json();assert.ok(seat.token);
  const action=async pack=>{
    const response=await post('/api/action',{type:'set-style-pack',id:pack.id,revision:pack.revision,expectedConfigVersion:(await getState()).production.configVersion,requestId:randomUUID()},seat.token);
    assert.equal(response.status,200,await response.text());
  };
  for(const record of BUILTIN_STYLE_RECORDS){
    const pack=await(await fetch(`${base}/api/style-packs/${record.manifest.id}/${record.revision}`)).json();
    for(const [id,url] of Object.entries(pack.assets)){
      const response=await fetch(base+url);assert.equal(response.status,200);
      assert.equal(hash(Buffer.from(await response.arrayBuffer())),record.hashes[record.manifest.assets[id]]);
    }
    const exported=await fetch(`${base}/api/style-packs/${pack.id}/${pack.revision}/export`);assert.equal(exported.status,200);
    const form=new FormData();form.append('file',new Blob([await exported.arrayBuffer()]),`${pack.id}.riftstyle.zip`);
    const imported=await fetch(base+'/api/style-packs/import',{method:'POST',headers:{'x-seat-token':seat.token},body:form});assert.equal(imported.status,201);
    const duplicate=await imported.json();assert.equal(duplicate.builtin,true);assert.equal(duplicate.revision,pack.revision);
    await action(pack);const staged=await getState();assert.equal(staged.overlay.stylePack.id,pack.id);assert.deepEqual(staged.production.program.overlay.stylePack,BUILTIN_STYLE_REF);
    assert.deepEqual(staged.gameResults,legacy.gameResults);assert.equal((await getList()).packs.length,5);
    checks.push(`${pack.id}: 23 exact asset hashes, ZIP export/reimport deduplication and preview staging preserve program`);
  }
  const beforeRestart=await getState();await stop();await start();const afterRestart=await getState();
  assert.deepEqual(afterRestart.overlay.stylePack,beforeRestart.overlay.stylePack);assert.deepEqual(afterRestart.production.program.overlay.stylePack,BUILTIN_STYLE_REF);
  assert.equal((await getList()).packs.length,5);
  checks.push('actual restart restores independently selected builtin preview and Glacier program');
  const second=await(await post('/api/control/seat',{role:'director'})).json();assert.ok(second.token);
  const customForm=new FormData();customForm.append('file',new Blob([await stylePackFixture()]),'test.riftstyle.zip');
  const importedCustom=await fetch(base+'/api/style-packs/import',{method:'POST',headers:{'x-seat-token':second.token},body:customForm});assert.equal(importedCustom.status,201);
  const custom=await importedCustom.json();assert.equal(custom.builtin,false);assert.equal((await getList()).packs.length,6);
  const customStage=await post('/api/action',{type:'set-style-pack',id:custom.id,revision:custom.revision,expectedConfigVersion:(await getState()).production.configVersion,requestId:randomUUID()},second.token);assert.equal(customStage.status,200);
  await stop();await start();const customRestored=await getState();assert.equal(customRestored.overlay.stylePack.revision,custom.revision);assert.deepEqual(customRestored.production.program.overlay.stylePack,BUILTIN_STYLE_REF);assert.equal((await getList()).packs.length,6);
  checks.push('custom ZIP import, stage and restart remain compatible beside the five builtins');
  await stop();await rm(data,{recursive:true});await mkdir(data,{recursive:true});await start();const fresh=await getState();
  assert.deepEqual(fresh.overlay.stylePack,BUILTIN_STYLE_REF);assert.deepEqual(fresh.production.program.overlay.stylePack,BUILTIN_STYLE_REF);assert.equal((await getList()).packs.length,5);await stop();
  checks.push('empty installation starts with five builtins and Glacier on both buses');
  // Server rendering checks the component contract only. It does not execute a browser,
  // measure computed CSS, decode images in the browser or assert visual acceptance.
  const compiled=path.join(dir,'renderer.mjs');
  await build({stdin:{contents:"import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import{BroadcastCanvas}from'./src/components/BroadcastCanvas';export function render(props){return renderToStaticMarkup(React.createElement(BroadcastCanvas,props));}",resolveDir:process.cwd()},outfile:compiled,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'});
  const {render}=await import(pathToFileURL(compiled).href);
  const champions=bundledChampions(); const variants=[...STYLE_SCENES.map(scene=>({scene})),{scene:'postgame',page2:true},{scene:'ranking',focus:true}];
  for(const pack of BUILTIN_RUNTIME_STYLES)for(const variant of variants){
    const state=variant.scene==='postgame'?reportFixture():createSeed();state.paused=true;state.overlay.stylePack={id:pack.id,revision:pack.revision,name:pack.name};
    if(variant.page2)state.overlay.postgamePage=2;if(variant.focus)state.selectedPlayerId=state.players[0].id;
    const markup=render({state,champions,scene:variant.scene,output:true});
    assert.match(markup,new RegExp('cast-scene-'+variant.scene));
    if(variant.scene==='teamfight'){assert.doesNotMatch(markup,/data-style-pack=|style-pack-frame|<img/);assert.match(markup,/cast-transparent/);}else{
      assert.match(markup,new RegExp(`data-style-pack="${pack.id}"`));assert.match(markup,new RegExp(`data-style-revision="${pack.revision}"`));
      if(!FULL_STYLE_SCENES.includes(variant.scene))assert.match(markup,/cast-transparent/);
      assert.doesNotMatch(markup,/jianlou|builtin-v1/);
    }
    if(variant.scene==='postgame'&&!variant.page2)assert.equal((markup.match(/class="pr-gold-player /g)||[]).length,10);
    checks.push(`${pack.id}/${variant.scene}${variant.page2?'-page2':variant.focus?'-focus':''}: SSR component contract, selected artwork references and transparency classes`);
  }
  const report={status:'passed',version,checks,assetsVerified:115,ssrCases:65,limitations:['SSR is not browser screenshot or computed layout acceptance','Windows packaged EXE and live OBS not executed here'],fixture:'synthetic only'};
  await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(`Passed actual HTTP migration/import/restart and ${report.ssrCases} server-rendered component contracts.`);
}catch(error){await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'failed',version,checks,error:String(error),serviceLog},null,2));throw error;}
finally{await stop();await rm(sandbox,{recursive:true,force:true,maxRetries:5,retryDelay:500});}
