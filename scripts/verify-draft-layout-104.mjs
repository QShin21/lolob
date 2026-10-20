import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {tsImport} from 'tsx/esm/api';
const {chromium}=await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE?pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href:'playwright');
const {createFixture}=await tsImport('../server/test-support/fixture.ts',import.meta.url);
const {BUILTIN_RUNTIME_STYLES,BUILTIN_STYLE_RECORDS}=await tsImport('../shared/style-packs.ts',import.meta.url);
const {bundledChampions}=await tsImport('../shared/champion-art.ts',import.meta.url);
const version=JSON.parse(await readFile('package.json','utf8')).version;
const dir=path.resolve(`verification-output/release-${version}/draft-layout`);await mkdir(dir,{recursive:true});
const champions=bundledChampions(),fixture=createFixture();fixture.overlay.ticker=false;fixture.draft.locked=true;fixture.match.format='BO5';
fixture.draft.bluePicks=fixture.players.filter(p=>p.team==='blue').map(p=>p.championId);fixture.draft.redPicks=fixture.players.filter(p=>p.team==='red').map(p=>p.championId);
fixture.draft.blueBans=champions.slice(20,25).map(c=>c.id);fixture.draft.redBans=champions.slice(25,30).map(c=>c.id);
fixture.players[0].name='超长选手ID测试ABCDEFGHIJKLMNOP';
fixture.draftHistory=Array.from({length:4},(_,i)=>({seriesId:fixture.match.seriesId,game:i+1,blueTeamId:i%2?fixture.match.redTeamId:fixture.match.blueTeamId,redTeamId:i%2?fixture.match.blueTeamId:fixture.match.redTeamId,bluePicks:champions.slice(i*10,i*10+5).map(c=>c.id),redPicks:champions.slice(i*10+5,i*10+10).map(c=>c.id)}));
await writeFile(path.join(dir,'index.html'),'<div id="root"></div><script type="module" src="./entry.tsx"></script>');
await writeFile(path.join(dir,'entry.tsx'),`import React from'react';import{createRoot}from'react-dom/client';import{BroadcastCanvas}from'/src/components/BroadcastCanvas';import'/src/styles.css';import'/src/design-tokens.css';const q=new URLSearchParams(location.search),state=${JSON.stringify(fixture)},packs=${JSON.stringify(BUILTIN_RUNTIME_STYLES)};state.match.game=Number(q.get('game')||3);state.overlay.stylePack=packs.find(p=>p.id===q.get('pack'));if(q.get('scene')==='postgame'){state.mode='demo';const values=q.has('edge')?[0,10000,0,null,13900,10000,0,0,10000,13900]:[11200,10400,13400,16300,9200,13500,12500,16300,17400,8500];state.players.forEach((p,i)=>p.gold=values[i]);}if(q.has('unlocked')){state.draft.locked=false;state.draft.bluePicks[0]='';state.draft.bluePreselect=['Ahri'];}document.body.style.margin='0';document.body.style.background='#152c42';createRoot(document.getElementById('root')).render(<BroadcastCanvas state={state} champions={${JSON.stringify(champions)}} scene={q.get('scene')||'draft'} output/>);`);
const vite=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:0}});await vite.listen();
let browser;const checks=[],errors=[];
try{
 browser=await chromium.launch({headless:true,channel:process.env.RIFTCAST_BROWSER_CHANNEL||'msedge'});
 const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const parts=new URL(route.request().url()).pathname.split('/');
  if(parts[2]==='style-packs'){
   const record=BUILTIN_STYLE_RECORDS.find(p=>p.manifest.id===parts[3]);
   if(record){if(parts[5]==='assets')return route.fulfill({contentType:'image/png',body:await readFile(path.join('public/style-packs',parts[3],parts[4],record.manifest.assets[parts[6]]))});return route.fulfill({json:BUILTIN_RUNTIME_STYLES.find(p=>p.id===parts[3])});}
  }
  return route.fulfill({json:{}});
 });
 const origin=`http://127.0.0.1:${vite.httpServer.address().port}/verification-output/release-${version}/draft-layout/index.html`;
 for(const pack of BUILTIN_RUNTIME_STYLES){
  for(const game of [1,3,4,5]){
   await page.goto(`${origin}?pack=${pack.id}&game=${game}`);await page.locator('[data-style-status=ready]').waitFor();await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('.cast-draft-card').count(),10);
   assert.equal(await page.locator('.cast-pick-order,.arena-pick-state,.cast-draft-role,.cast-draft-champion,.arena-draft-team-heading,.cast-draft-preselect').count(),0);
   assert.doesNotMatch(await page.locator('.cast-draft').innerText(),/已锁定|选择顺序|本系列|待进行/);
   assert.equal(await page.locator('.cast-draft-timer').count(),0);
   for(const side of ['blue','red']){
    const stack=page.locator('.cast-ban-history.'+side),rows=stack.locator('.cast-history-game');assert.equal(await rows.count(),game);
    assert.deepEqual(await rows.locator(':scope > span').allTextContents(),Array.from({length:game},(_,i)=>'GAME'+(i+1)));
    const actual=await rows.locator('.champion-image img').evaluateAll(nodes=>nodes.map(n=>n.alt));
    const expected=[];for(let g=1;g<game;g++){const record=fixture.draftHistory[g-1],team=fixture.match[side+'TeamId'];expected.push(...(record.blueTeamId===team?record.bluePicks:record.redPicks));}expected.push(...fixture.draft[side+'Bans']);
    assert.deepEqual(actual,expected.map(id=>champions.find(c=>c.id===id).name));
    const boxes=await rows.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom,width:r.width};}));
    for(let i=1;i<boxes.length;i++)assert.ok(boxes[i].y>=boxes[i-1].bottom);
    assert.ok(boxes[0].y>=0);assert.ok(boxes.at(-1).width>=(boxes[0].width));
    const cards=await page.locator('.cast-draft-team.'+side).boundingBox();assert.ok(Math.abs(boxes.at(-1).bottom-cards.y)<1);
    assert.ok(boxes.at(-1).width<cards.width*.5);
   }
   assert.equal(await page.locator('.cast-draft-card').evaluateAll(nodes=>nodes.every(n=>{const card=n.getBoundingClientRect(),name=n.querySelector('.fit-name').getBoundingClientRect();return name.left>=card.left&&name.right<=card.right&&name.bottom<=card.bottom;})),true);
   await page.screenshot({path:path.join(dir,`${pack.id}-game${game}.png`)});checks.push(`${pack.id}/GAME${game}: exact picks and bans, side swaps, chronological stack, ID-only cards, bounded geometry`);
  }
  for(const edge of [false,true]){
   await page.goto(`${origin}?pack=${pack.id}&scene=postgame${edge?'&edge=1':''}`);await page.locator('[data-style-status=ready]').waitFor();await page.evaluate(()=>document.fonts.ready);
   const ratios=edge?[0,1,null,null,.5]:[11200/24700,10400/22900,13400/29700,16300/33700,9200/17700];
   const rows=await page.locator('.pr-gold-pair').evaluateAll(nodes=>nodes.map(n=>{const pair=n.getBoundingClientRect(),track=n.querySelector('.pr-gold-comparison'),bars=[...track.children].map(e=>e.getBoundingClientRect()),labels=[...n.querySelectorAll('.pr-gold-label>b')].map(e=>e.getBoundingClientRect()),placeholders=[...n.querySelectorAll('.pr-bar')].map(e=>e.getBoundingClientRect());return {width:track.getBoundingClientRect().width,blue:bars[0].width,red:bars[1].width,gap:bars[1].left-bars[0].right,unavailable:track.classList.contains('is-unavailable'),center:pair.left+pair.width/2,blueLabelRight:labels[0].right,redLabelLeft:labels[1].left,barY:bars[0].y,originalY:placeholders[0].y};}));
   rows.forEach((r,i)=>{assert.ok(Math.abs(r.gap-11.52)<.2);assert.ok(Math.abs(r.barY-r.originalY)<1,JSON.stringify(r));assert.ok(Math.abs(r.blueLabelRight-(r.center-5.76))<.3);assert.ok(Math.abs(r.redLabelLeft-(r.center+5.76))<.3);if(ratios[i]===null)assert.equal(r.unavailable,true);else{assert.equal(r.unavailable,false);assert.ok(Math.abs(r.blue/(r.blue+r.red)-ratios[i])<.001);assert.ok(Math.abs(r.width-r.blue-r.red-r.gap)<.2);}});
   await page.screenshot({path:path.join(dir,`${pack.id}-postgame${edge?'-edge':''}.png`)});checks.push(`${pack.id}/postgame${edge?'-edge':''}: exact pairwise gold shares, fixed gap and center labels, missing/zero handling`);
  }
  await page.goto(`${origin}?pack=${pack.id}&scene=live`);await page.locator('[data-style-status=ready]').waitFor();
  const box=await page.locator('.lb-scoreboard').boundingBox();assert.ok(Math.abs(box.height-300.72)<1);assert.ok(Math.abs(box.width-928)<1);
  assert.equal(await page.locator('.lb-player-row').count(),10);assert.equal(await page.locator('.lb-items .lb-item-slot').count(),60);
  const feed=await page.locator('.lb-feed').first().boundingBox();if(feed)assert.ok(Math.abs(feed.y-box.y)<1&&Math.abs(feed.height-box.height)<1);
  assert.equal(await page.locator('.lb-player-row').evaluateAll(nodes=>nodes.every(n=>{const row=n.getBoundingClientRect();return [...n.querySelectorAll('.lb-identity,.lb-player-name>span,.lb-spells,.lb-runes,.lb-champion,.lb-items')].every(e=>{const r=e.getBoundingClientRect();return r.top>=row.top-1&&r.bottom<=row.bottom+1;});})),true,'row content must fit');
  await page.screenshot({path:path.join(dir,`${pack.id}-live.png`)});checks.push(`${pack.id}/live: 20% taller scoreboard, 10 players, 60 item slots and camera alignment`);
 }
 for(const width of [1280,960]){await page.setViewportSize({width,height:width*9/16});await page.goto(`${origin}?pack=qinghua-celestial&game=5&unlocked=1`);await page.locator('[data-style-status=ready]').waitFor();assert.equal(await page.locator('.cast-draft-timer').count(),1);assert.equal(await page.locator('.cast-history-game').count(),10);await page.screenshot({path:path.join(dir,`qinghua-game5-${width}.png`)});checks.push(`Qinghua ${width}px: GAME5 stack and active countdown`);}
 assert.deepEqual(errors,[]);await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'passed',version,checks,errors,scope:'Synthetic browser fixtures; no live game or OBS streaming'},null,2));console.log(`Passed ${checks.length} BP and scoreboard layout cases`);
}catch(error){await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'failed',checks,errors,error:String(error)},null,2));throw error;}
finally{await browser?.close();await vite.close();}


