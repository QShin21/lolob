import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {tsImport} from 'tsx/esm/api';
const {chromium}=await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE?pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href:'playwright');
const {createFixture}=await tsImport('../server/test-support/fixture.ts',import.meta.url);
const state=createFixture();state.production.control={owner:'identity-director'};
const dir=path.resolve('verification-output/player-identity');await mkdir(dir,{recursive:true});
await writeFile(path.join(dir,'index.html'),'<html><head><meta charset="utf-8"/></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>');
await writeFile(path.join(dir,'entry.tsx'),`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{AutoSidesControls}from'/src/components/AutoSidesControls';import{TeamForm}from'/src/pages/ManagementEditors';import'/src/design-tokens.css';import'/src/styles.css';import'/src/pages/management-workspace.css';import'/src/operator-150.css';const initial=${JSON.stringify(state)};window.actions=[];function App(){const[state,setState]=useState(initial),[draft,setDraft]=useState(initial.teams[0]);window.identityState=state;const send=async action=>{window.actions.push(action);setState(s=>({...s,production:{...s.production,...action.command}}))};return <main style={{maxWidth:1200,margin:'auto',padding:20}}><AutoSidesControls state={state} seat={{id:'identity-director',role:'director',name:'验收导播'}} connected={true} send={send} notify={()=>{}}/><TeamForm value={draft} onChange={setDraft} state={state} disabled={false} onSave={()=>setState(s=>({...s,teams:s.teams.map(t=>t.id===draft.id?draft:t)}))} onDiscard={()=>setDraft(state.teams[0])}/><button onClick={()=>setState(s=>({...s,production:{...s.production,control:{owner:'other'}}}))}>模拟失去控制权</button></main>}createRoot(document.getElementById('root')).render(<App/>);`);
const server=await createServer({configFile:false,cacheDir:path.join(dir,'vite-cache'),plugins:[react()],server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();let browser;const checks=[],errors=[];
try{
 browser=await chromium.launch({headless:true,channel:process.env.RIFTCAST_BROWSER_CHANNEL||'msedge'});const page=await browser.newPage({viewport:{width:1400,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/verification-output/player-identity/index.html`);
 const toggle=page.getByRole('checkbox',{name:'启用自动阵营识别',exact:true});await toggle.waitFor();assert.equal(await toggle.isChecked(),false);await toggle.check();await page.waitForFunction(()=>window.identityState.production.autoSides===true);assert.equal(await page.evaluate(()=>window.actions.at(-1).command.autoSides),true);checks.push('Automatic side matching defaults off and the active director saves the explicit setting');
 const account=page.getByLabel('选手 1 游戏账号',{exact:true});await account.fill('  张 三 # CN1  ');await account.blur();assert.equal(await account.inputValue(),'张 三#CN1');await page.getByRole('button',{name:'保存战队',exact:true}).click();await page.getByText('识别条件与双方账号完整度',{exact:true}).click();await page.getByText('苍穹竞技：1 个完整账号 · 赤焰战队：0 个完整账号',{exact:true}).waitFor();checks.push('The actual roster form normalizes pasted complete Riot IDs and updates the configured-account count');
 await page.getByLabel('选手 2 游戏账号',{exact:true}).fill('LegacyName');await page.getByLabel('选手 2 游戏账号',{exact:true}).blur();assert.equal(await page.getByLabel('选手 2 游戏账号',{exact:true}).inputValue(),'LegacyName');checks.push('Legacy accounts remain editable without inventing a TAG');
 await page.screenshot({path:path.join(dir,'identity-1400.png'),fullPage:true});await page.getByRole('button',{name:'模拟失去控制权',exact:true}).click();assert.equal(await toggle.isDisabled(),true);checks.push('Losing director ownership disables the automatic-side setting');
 await page.setViewportSize({width:800,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(dir,'identity-800.png'),fullPage:true});assert.deepEqual(errors,[]);
 await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'passed',checks,errors,scope:'Real React roster and setting components with isolated synthetic state; no game client or production commands'},null,2));console.log(JSON.stringify({status:'passed',checks}));
}finally{await browser?.close();await server.close();}
