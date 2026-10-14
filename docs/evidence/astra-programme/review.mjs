// Short implementation review of actual React components with synthetic state.
// No OBS/service/device process, no live data directory, no external resources.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tsImport } from 'tsx/esm/api';
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = path.dirname(fileURLToPath(import.meta.url));
const { createSeed, fallbackChampions, applyAction } = await tsImport('../../../server/state.ts', import.meta.url);
const { captureProgram } = await tsImport('../../../shared/production.ts', import.meta.url);
const champions = fallbackChampions();
const base = createSeed();
base.paused = true; base.selectedPlayerId = null; base.overlay.countdownEnd = Date.now() + 184000; base.overlay.sponsor = '';
base.overlay.ticker = false; base.overlay.nativeHud = 'off'; base.connections.obs.status = 'disconnected';
base.production.control = { owner: 'fixture-director', name: '合成主导播席' };
base.production.program = captureProgram(base);
const entryPath = path.join(root, '_astra-programme-review.tsx');
const entry = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BroadcastCanvas}from'/src/components/BroadcastCanvas';import{Remote}from'/src/pages/Remote';import{CustomSceneEditor}from'/src/components/CustomSceneEditor';import{UiThemeProvider}from'/src/ui-theme';
import'/src/design-tokens.css';import'/src/styles.css';import'/src/control-workspace.css';import'/src/director.css';import'/src/responsive.css';import'/src/studio-workflow.css';import'/src/console-system.css';import'/src/ui-theme.css';
const initial=await fetch('/fixture').then(r=>r.json());
function Fixture(){const [value,setValue]=useState({state:initial.state,scene:'standby',view:'program',role:'readonly'});window.review={set:setValue};const seat={id:value.role==='director'?'fixture-director':'fixture-'+value.role,name:'合成'+value.role+'席',role:value.role};const ctx={state:value.state,champions:initial.champions,seat,connected:true,send:async action=>{window.reviewActions.push(action);},notify:()=>{}};return value.view==='remote'?<Remote {...ctx} displaySeat={seat} toast={null} dismissNotice={()=>{}} seatRecovery={{status:'verified',detail:'',recover:async()=>{}}}/>:value.view==='editor'?<div className="app-shell"><CustomSceneEditor {...ctx} initial={value.state.customScenes?.[0]} onClose={()=>{}}/></div>:<div className="review-stage"><BroadcastCanvas state={value.state} champions={initial.champions} scene={value.scene} bus="program" output/></div>};window.reviewActions=[];createRoot(document.getElementById('root')).render(<UiThemeProvider><Fixture/></UiThemeProvider>);`;
const vite = await createServer({ root, configFile:false, appType:'custom', plugins:[react(),{ name:'programme-review',resolveId:id=>id==='/_astra-programme-review.tsx'?entryPath:undefined,load:id=>id===entryPath?entry:undefined }],server:{middlewareMode:true,hmr:false} });
const server = http.createServer(async(req,res)=>{
  if(req.url==='/fixture'){res.setHeader('content-type','application/json');res.end(JSON.stringify({state:base,champions}));return;}
  if(req.url==='/api/obs/custom-sources'){res.setHeader('content-type','application/json');res.end(JSON.stringify({windows:[{name:'合成窗口',value:'fixture-window'}],inputs:[{name:'合成共享来源',kind:'image_source'}]}));return;}
  if(req.url?.startsWith('/api/')){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'实现自审不连接设备'}));return;}
  if(req.url==='/'||req.url==='/remote'){
    res.setHeader('content-type','text/html');res.end(await vite.transformIndexHtml('/',`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/><style>html,body{margin:0}.review-stage{width:100vw;height:56.25vw;background:#263640}.review-stage .is-output{width:100%;height:100%}</style></head><body><div id="root"></div><script type="module" src="/_astra-programme-review.tsx"></script></body></html>`));return;
  }
  vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});
});
const shots=[],checks=[],errors=[];let browser,completed=false;
async function checkLineup(page) {
  const result = await page.locator('.arena-lineup-matchups').evaluate(root => {
    const box=root.getBoundingClientRect();
    const inside=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=box.left-1&&r.right<=box.right+1&&r.top>=box.top-1&&r.bottom<=box.bottom+1;};
    return {identities:[...root.querySelectorAll('.arena-lineup-player')].map(inside), portraits:[...root.querySelectorAll('.cast-lineup-photo')].map(inside), pairs:[...root.children].map(pair=>pair.querySelector('.blue article').getBoundingClientRect().bottom<=pair.querySelector('.red article').getBoundingClientRect().top)};
  });
  assert.equal(result.identities.length,10);assert.equal(result.portraits.length,10);
  assert.ok([...result.identities,...result.portraits,...result.pairs].every(Boolean),'All ten portraits and identities must remain inside the paired lineup without overlap');
}
async function snap(page,name){await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:false});shots.push(name+'.png');}
try {
  await mkdir(evidence,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
  const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**',route=>route.abort());await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>!!window.review);
  const set=async(scene,state=base,view='program',role='readonly')=>{await page.evaluate(value=>window.review.set(value),{scene,state,view,role});await page.waitForTimeout(110);};
  const scenes=['standby','draft','lineup','live','teamfight','gold-ranking','economy','ranking','schedule','postgame','interview'];
  for(const scene of scenes){await set(scene);await page.locator('.cast-scene-'+scene).waitFor();await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));if(scene==='lineup')await checkLineup(page);
    const styles=()=>page.locator('.cast-container').evaluate(root=>[root,...root.querySelectorAll('*')].map(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return[c.color,c.backgroundColor,c.borderTopColor,c.fontFamily,c.fontSize,c.display,c.objectFit,r.width,r.height];}));
    const dark=await styles();await page.evaluate(()=>document.documentElement.setAttribute('data-ui-theme','light'));assert.deepEqual(await styles(),dark,scene+' programme styles must remain independent of console theme');await page.evaluate(()=>document.documentElement.setAttribute('data-ui-theme','dark'));
    await snap(page,scene+'-1920');}
  checks.push('Eleven current component compositions rendered at 1920 × 1080; descendant programme colors/type/geometry unchanged by console theme');
  await set('teamfight');assert.equal(await page.locator('.cast-scene-teamfight').innerText(),'');assert.equal(await page.locator('.cast-scene-teamfight').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');checks.push('Teamfight programme remains empty and transparent');
  const focus=structuredClone(base);focus.selectedPlayerId=focus.players[0].id;await set('ranking',focus);await snap(page,'ranking-focus-1920');
  const final=applyAction(structuredClone(base),{type:'finalize-game',winner:'blue'});await set('postgame',final);await snap(page,'postgame-frozen-1920');
  const sampled=structuredClone(base);sampled.gameTime=120;sampled.stats.blue.gold=24000;sampled.stats.red.gold=25000;
  sampled.economy=[{time:0,blue:0,red:0},{time:20,blue:5000,red:6000},{time:40,blue:10000,red:8000},{time:100,blue:20000,red:19000},{time:120,blue:24000,red:25000}];
  await set('economy',sampled);assert.equal(await page.locator('.economy-chart line[stroke-width="3"]').count(),5);await snap(page,'economy-sampled-gap-1920');checks.push('Synthetic continuous samples cross zero, while the 60-second sampling gap remains disconnected');
  const stress=structuredClone(base);stress.match.game=5;stress.match.format='BO5';stress.match.blueScore=2;stress.match.redScore=2;
  stress.teams.forEach((t,i)=>{t.name=(i?'红方':'蓝方')+'合成长名称战队·跨区域邀请赛事代表队';t.tag=i?'REDTEAM':'BLUETEAM';t.logo='/missing-logo.png';});
  stress.players.forEach((p,i)=>{p.name='合成超长选手名字'+String(i+1).padStart(2,'0');p.portrait='/missing-photo.png';});
  stress.draftHistory=Array.from({length:4},(_,i)=>({seriesId:stress.match.seriesId,game:i+1,blueTeamId:i%2?stress.match.redTeamId:stress.match.blueTeamId,redTeamId:i%2?stress.match.blueTeamId:stress.match.redTeamId,bluePicks:base.draft.bluePicks,redPicks:base.draft.redPicks,recordedAt:new Date().toISOString(),source:'demo'}));
  stress.overlay.ticker=true;stress.overlay.tickerText='合成公告：比赛暂停期间请核对字幕、来源及声音。';stress.overlay.interview={name:'合成长姓名选手与采访嘉宾',team:'合成长名称战队',role:'中单选手',topic:'赛后采访：第五局的战术调整与关键时刻决策复盘',dock:'right'};
  for(const scene of ['draft','lineup','schedule','interview']){await set(scene,stress);await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));if(scene==='lineup')await checkLineup(page);await snap(page,scene+'-stress');}
  await page.setViewportSize({width:1280,height:720});await set('lineup',stress);assert.equal(await page.locator('.arena-lineup-pair').count(),5);await checkLineup(page);await snap(page,'lineup-720');await set('economy');await snap(page,'economy-720');checks.push('Long/missing assets and BO5 at 1080p and 720p; all ten lineup identities/portraits fit without overlap');
  for(const role of ['readonly','data','subtitle','replay','director']){await page.setViewportSize({width:390,height:844});await set('live',base,'remote',role);assert.equal(await page.locator('.remote-take-dock').count(),role==='director'?1:0);await snap(page,'remote-'+role+'-390');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  checks.push('Five role surfaces rendered at 390px; TAKE dock only on the controlling director');
  await set('live',base,'remote','subtitle');await page.getByRole('textbox',{name:'待播字幕',exact:true}).fill('合成软键盘草稿');await page.setViewportSize({width:390,height:450});await page.getByRole('textbox',{name:'待播字幕',exact:true}).scrollIntoViewIfNeeded();await snap(page,'remote-subtitle-short-viewport');assert.equal(await page.getByRole('textbox',{name:'待播字幕',exact:true}).inputValue(),'合成软键盘草稿');checks.push('Input survives reduced mobile viewport; this is not a physical IME test');
  assert.equal(errors.length,0);assert.equal(await page.evaluate(()=>window.reviewActions.length),0);checks.push('No page exceptions or implicit write actions during render/navigation');
  const custom=structuredClone(base);custom.connections.obs.status='connected';
  custom.customScenes=[{id:'custom:fixture',name:'合成换源检查',background:'#15212a',sources:[{id:'fixture-layer',name:'原图层名称',kind:'image',assetId:'fixture-image',x:-120,y:240,width:2100,height:480,fit:'cover',visible:true}]}];
  custom.assets.push({id:'fixture-image',name:'合成图片',kind:'image',url:champions[0].image});
  await page.setViewportSize({width:1440,height:900});await set('custom:fixture',custom,'editor','director');
  await page.getByRole('button',{name:'更换来源',exact:true}).click();await page.getByRole('button',{name:'应用窗口',exact:true}).click();
  await page.getByRole('button',{name:'刷新主机来源',exact:true}).click();await page.getByRole('button',{name:/合成窗口 本次读取/}).click();
  await page.locator('.custom-source-panel-footer').getByRole('button',{name:'更换来源',exact:true}).click();
  assert.equal(await page.getByRole('spinbutton',{name:'横向位置',exact:true}).inputValue(),'-120');
  assert.equal(await page.getByRole('spinbutton',{name:'宽度',exact:true}).inputValue(),'2100');
  assert.equal(await page.getByRole('combobox',{name:'适配方式',exact:true}).inputValue(),'cover');
  assert.equal(await page.evaluate(()=>window.reviewActions.length),0);await snap(page,'custom-replaced-window-1440');
  await page.getByRole('button',{name:'更换来源',exact:true}).click();await page.getByRole('button',{name:'已有 OBS 来源',exact:true}).click();
  await page.getByRole('button',{name:/合成共享来源 image_source/}).click();await page.locator('.custom-source-panel-footer').getByRole('button',{name:'更换来源',exact:true}).click();
  await page.getByRole('button',{name:'实际合成',exact:true}).click();assert.match(await page.locator('.custom-composition-facts').innerText(),/共享 OBS 1/);await snap(page,'custom-composite-facts-1440');
  await page.getByRole('button',{name:'返回排版编辑',exact:true}).click();await page.getByRole('button',{name:'保存到待播',exact:true}).click();
  const actions=await page.evaluate(()=>window.reviewActions);assert.equal(actions.length,1);assert.equal(actions[0].type,'save-custom-scene');
  const layer=actions[0].scene.sources[0];assert.deepEqual({id:layer.id,name:layer.name,kind:layer.kind,x:layer.x,y:layer.y,width:layer.width,height:layer.height,fit:layer.fit,inputName:layer.inputName},{id:'fixture-layer',name:'原图层名称',kind:'obs',x:-120,y:240,width:2100,height:480,fit:'cover',inputName:'合成共享来源'});
  checks.push('Explicit image→window→OBS replacement retains layer identity, negative/oversized transform and fit; local until explicit save (synthetic choices/actions only)');
  assert.equal(errors.length,0);completed=true;

} finally {
  await browser?.close();await vite.close();await new Promise(resolve=>server.close(resolve));
  const files=execFileSync('git',['ls-files','src','shared','scripts','server','package.json','package-lock.json'],{cwd:root,encoding:'utf8'}).trim().split('\n');
  const added=execFileSync('git',['ls-files','--others','--exclude-standard','src'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const source=Object.fromEntries(await Promise.all([...new Set([...files,...added])].map(async file=>[file,createHash('sha256').update(await readFile(path.join(root,file))).digest('hex')])));
  await writeFile(path.join(evidence,'result.json'),JSON.stringify({completed,base:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),scope:'Astra implementation self-review; synthetic resolved state, no independent acceptance or actual OBS/device evidence',shots,checks,errors,source},null,2));
  console.log(JSON.stringify({completed,shots:shots.length,checks,errors}));
}
