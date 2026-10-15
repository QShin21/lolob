const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const folder='E:/codexdata/lol导播软件/verification-output/release-transport/capture-fixture';
const out='E:/codexdata/lolob-release-20261014/verification-output/release-0.8.0-rc.3';
const raw=fs.readFileSync(folder+'/with-capture-fixture.cjs','utf8');
assert.ok(raw.includes('module.exports = { options, assertRender, assertTarget };'));
const source=raw.replace('module.exports = { options, assertRender, assertTarget };','module.exports = { main, options, assertRender, assertTarget };');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const calls=[],caseResults=[];
async function scenario(name,childCode=0,failAfterSwitchRole=-1,failRestoreRole=-1,coupleRoles=false){
 const initial=['render0','render1','render2','cable-id','cable-id','cable-id'],current=[...initial],files=new Map(),writes=[];
 const endpoints=[{id:'cable-id',name:'CABLE Output (VB-Audio Virtual Cable)',interfaceName:'VB-Audio Virtual Cable',capture:true,cable:true},{id:'emeet-id',name:'Microphone (EMEET SmartCam C60E 4K)',interfaceName:'EMEET SmartCam C60E 4K',capture:true,cable:false}];
 const inventory=()=>({defaults:[...current],endpoints,defaultRender:current[0],defaultCapture:current[5]});
 let failedSwitch=false,failedRestore=false;
 const fakeProcess=new EventEmitter();Object.assign(fakeProcess,{platform:'win32',execPath:'C:/mock/node.exe',exitCode:0});
 const fakeFs={mkdirSync(){},realpathSync:value=>value,mkdtempSync:()=> 'E:/mock/capture-defaults-test',openSync:()=>42,closeSync:()=>{},writeFileSync:(file,bytes)=>files.set(file,bytes),readFileSync:file=>{
   if(file.endsWith('helper-build.json'))return JSON.stringify({executableSha256:digest('capture-only.exe'),sourceSha256:digest('capture-only.cpp'),headerSha256:digest('audio-endpoints.hpp')});
   if(file.endsWith('package.json'))return JSON.stringify({version:'0.8.0-rc.3',riftcastRelease:{sourceRevision:'a'.repeat(40),workingTreeDirty:false,sourceDigest:'digest'}});
   if(file.endsWith('release-metadata.json')||file.endsWith('release-manifest.json'))return JSON.stringify({sourceRevision:'a'.repeat(40),workingTreeDirty:false,version:'0.8.0-rc.3',sourceDigest:'digest'});
   return path.basename(file);
 }};
 const fakeCp={execFileSync:(exe,args)=>args.includes('symbolic-ref')?'new':args.includes('rev-parse')?'a'.repeat(40):'',execFile:(exe,args,options,callback)=>{
   calls.push({scenario:name,args:[...args]});
   if(args[0]==='set-capture-role'){
     const role=Number(args[1]);assert.ok(role>=0&&role<=2);assert.equal(current[role+3],args[2]);assert.ok(['cable-id','emeet-id'].includes(args[3]));
     writes.push({role,target:args[3]});
     if(args[3]==='cable-id'&&role===failRestoreRole&&!failedRestore){failedRestore=true;return setTimeout(()=>callback({code:1},''),0);}
     current[role+3]=args[3];if(coupleRoles&&role<2){current[3]=args[3];current[4]=args[3];}
     if(args[3]==='emeet-id'&&role===failAfterSwitchRole&&!failedSwitch){failedSwitch=true;return setTimeout(()=>callback({code:1},''),0);}
   }
   setTimeout(()=>callback(null,JSON.stringify(inventory())),0);
 },spawn:()=>{
   const child=new EventEmitter();child.exitCode=null;child.kill=()=>{child.exitCode=1;setTimeout(()=>child.emit('close',1,'SIGTERM'),0);};
   setTimeout(()=>{child.exitCode=childCode;child.emit('close',childCode,null);},5);return child;
 }};
 const module={exports:{}},customRequire=name=>name==='node:fs'?fakeFs:name==='node:child_process'?fakeCp:require(name);
 const context={module,require:customRequire,__dirname:folder,__filename:folder+'/with-capture-fixture.cjs',process:fakeProcess,console:{log(){}},setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,2)),clearTimeout,Buffer};
 vm.runInNewContext(source,context,{filename:'with-capture-fixture-simulated.cjs'});
 await module.exports.main(['--expected-source','a'.repeat(40),'--executable','E:/isolated/RiftCast.exe','--playwright','E:/isolated/playwright.mjs','--target-capture-id','emeet-id','--target-capture-name',endpoints[1].name]);
 const audit=JSON.parse([...files].find(([key])=>key.endsWith('capture-defaults-audit.json'))[1]);
 assert.deepEqual(current.slice(0,3),initial.slice(0,3));
 if(failRestoreRole<0){assert.deepEqual(current,initial);assert.equal(audit.restoration.verified,true);assert.equal(audit.status,childCode===0&&failAfterSwitchRole<0?'passed':'failed');}
 else {assert.equal(audit.status,'failed');assert.equal(audit.restoration.verified,false);assert.ok(writes.some(w=>w.role===1&&w.target==='cable-id'));assert.ok(writes.some(w=>w.role===2&&w.target==='cable-id'));}
 caseResults.push({name,status:'passed',simulatedAuditStatus:audit.status,restorationVerified:audit.restoration.verified,writeCalls:writes,renderUnchanged:true});
}
(async()=>{await scenario('child-exit0-restores');await scenario('child-exit1-restores',1);await scenario('write-succeeded-then-readback-failed-restores',0,1);await scenario('first-restore-fails-still-attempts-other-roles',0,-1,0);await scenario('coupled-console-multimedia-roles',0,-1,-1,true);await scenario('coupled-console-multimedia-child-failure',1,-1,-1,true);const report={at:new Date().toISOString(),scope:'Independent VM/COM helper contract simulation only. No helper executable, COM write, native application or system audio operation executed.',wrapperSha256:digest(raw),cases:caseResults,status:'passed'};fs.writeFileSync(out+'/capture-wrapper-simulation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:caseResults.length,wrapperSha256:report.wrapperSha256}));})().catch(e=>{console.error(e);process.exitCode=1;});
