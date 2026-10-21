import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';import {pathToFileURL} from 'node:url';import {createServer} from 'vite';import react from '@vitejs/plugin-react';
const {chromium}=await import(pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href);
const version=JSON.parse(await readFile('package.json','utf8')).version,dir=path.resolve(`verification-output/release-${version}/replay-director`);await mkdir(dir,{recursive:true});
const initial={session:'test-game',connected:true,source:'replay',detail:'已解析整场伤害',coverageFrom:0,coverageUntil:1800,playback:{time:600,length:1800,paused:false,speed:1},moments:[
 {id:'kill-1',kind:'kill',title:'选手甲 → 选手乙',time:500,start:482,end:500,basis:'damage',participants:[]},
 {id:'objective-1',kind:'objective',title:'蓝方击杀男爵',time:900,start:872,end:900,basis:'damage',participants:[]},
 {id:'fight-1',kind:'teamfight',title:'团战 · 8 人参战',time:1000,start:995,end:1023,basis:'damage',participants:[]},
 {id:'objective-2',kind:'objective',title:'红方击杀巨龙',time:1200,start:1197,end:1200,basis:'event',participants:[]}
]};
await writeFile(path.join(dir,'index.html'),'<div id="root"></div><script type="module" src="./entry.tsx"></script>');
await writeFile(path.join(dir,'entry.tsx'),`import React from'react';import{createRoot}from'react-dom/client';import{GameReplayDirector}from'/src/components/GameReplayDirector';import'/src/design-tokens.css';import'/src/styles.css';import'/src/console-system.css';import'/src/ui-theme.css';import'/src/components/production-desk.css';const q=new URLSearchParams(location.search);document.documentElement.dataset.uiTheme=q.get('theme')||'light';document.body.style.margin='0';createRoot(document.getElementById('root')).render(<div className="app-shell" style={{display:'block',padding:18}}><div className="production-task" style={{maxWidth:460,margin:'auto'}}><GameReplayDirector host={!q.has('readonly')} canOutput={!q.has('readonly')} notify={()=>{}} send={async a=>window.take(a)}/></div></div>);`);
const vite=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:0}});await vite.listen();let browser;const errors=[],posts=[],takes=[],checks=[];let view=structuredClone(initial),unavailable=false;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:540,height:1050}});page.on('pageerror',e=>errors.push(e.message));await page.exposeFunction('take',a=>takes.push(a));
 await page.route('**/api/replay/director',route=>{
  if(unavailable)return route.fulfill({status:503,json:{error:'测试断线'}});
  if(route.request().method()==='POST'){const body=route.request().postDataJSON();posts.push(body);assert.equal(body.session,view.session);if(body.eventId){view.playback.time=view.moments.find(e=>e.id===body.eventId).start;view.playback.paused=false;view.playback.speed=1;}else for(const k of ['time','paused','speed'])if(body[k]!==undefined)view.playback[k]=body[k];}
  return route.fulfill({json:view});
 });
 const origin=`http://127.0.0.1:${vite.httpServer.address().port}/verification-output/release-${version}/replay-director/index.html`;
 await page.goto(origin);await page.locator('.replay-event').first().waitFor();assert.equal(await page.locator('.replay-event').count(),4);
 await page.getByRole('button',{name:/选手甲/}).click();await page.getByLabel('游戏回放时间').filter({hasText:'08:02'}).waitFor();assert.equal(posts.at(-1).eventId,'kill-1');
 await page.getByRole('button',{name:/返回原进度/}).click();await page.getByLabel('游戏回放时间').filter({hasText:'10:00'}).waitFor();
 await page.getByRole('button',{name:'暂停',exact:true}).click();await page.getByRole('button',{name:'播放',exact:true}).waitFor();
 await page.getByLabel('游戏回放倍速').selectOption('0.5');assert.equal(posts.at(-1).speed,.5);
 await page.getByLabel('跳转时间',{exact:true}).fill('12:30');await page.getByRole('button',{name:'跳转',exact:true}).click();await page.getByLabel('游戏回放时间').filter({hasText:'12:30'}).waitFor();assert.equal(posts.at(-1).time,750);
 const count=posts.length;await page.getByLabel('跳转时间',{exact:true}).fill('12:99');await page.getByRole('button',{name:'跳转',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(posts.length,count);
 await page.getByLabel('回放事件类型').selectOption('teamfight');assert.equal(await page.locator('.replay-event').count(),1);await page.getByRole('button',{name:/团战 · 8/}).click();await page.getByLabel('游戏回放时间').filter({hasText:'16:35'}).waitFor();
 await page.getByRole('button',{name:'切入团战视图',exact:true}).click();assert.deepEqual(takes.at(-1),{type:'take',scene:'teamfight'});
 await page.getByLabel('回放事件类型').selectOption('all');await page.getByLabel('搜索回放事件').fill('男爵');assert.equal(await page.locator('.replay-event').count(),1);await page.getByLabel('搜索回放事件').fill('');
 checks.push('single-click event navigation, return position, pause, speed, exact seek, input validation, event filters and teamfight TAKE');
 for(const theme of ['light','dark'])for(const width of [540,360]){await page.setViewportSize({width,height:1050});await page.goto(`${origin}?theme=${theme}`);await page.locator('.replay-event').first().waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(dir,`${theme}-${width}.png`)});}checks.push('light/dark sidebar at 540 and 360 pixels, no horizontal overflow');
 unavailable=true;await page.getByRole('alert').waitFor();assert(await page.getByRole('button',{name:'暂停',exact:true}).isDisabled());unavailable=false;
 view={...view,session:'new-game',moments:[]};await page.locator('.replay-event').waitFor({state:'detached'});assert.equal(await page.getByRole('button',{name:/返回原进度/}).count(),0);checks.push('disconnect disables controls and a new game clears event and return state');
 view=structuredClone(initial);await page.goto(`${origin}?readonly=1`);await page.locator('.replay-event').first().waitFor();assert(await page.locator('.replay-event').first().isDisabled());assert(await page.getByRole('button',{name:'切入团战视图',exact:true}).isDisabled());checks.push('non-host or non-owner cannot operate game playback');
 view=structuredClone(initial);view.playback.time=735;
 await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
 await page.goto(origin);await page.locator('.replay-event').first().waitFor();
 await page.getByRole('button',{name:/选手甲/}).click();await page.getByLabel('游戏回放时间').filter({hasText:'08:02'}).waitFor();
 await page.getByRole('button',{name:'暂停',exact:true}).click();await page.getByRole('button',{name:'播放',exact:true}).waitFor();
 await page.getByLabel('游戏回放倍速').selectOption('0.5');
 await page.clock.runFor(17000);await page.getByRole('button',{name:'返回原进度 · 12:32',exact:true}).waitFor();
 await page.getByRole('button',{name:/团战 · 8/}).click();await page.getByLabel('游戏回放时间').filter({hasText:'16:35'}).waitFor();
 await page.getByRole('button',{name:'返回原进度 · 12:32',exact:true}).click();
 await page.getByLabel('游戏回放时间').filter({hasText:'12:32'}).waitFor();assert.equal(posts.at(-1).time,752);assert.equal(posts.at(-1).speed,1);assert.equal(posts.at(-1).paused,false);
 checks.push('return timeline advances 12:15 to 12:32 after 17 seconds independently of replay pause, speed and repeated event jumps');
 assert.deepEqual(errors,[]);await writeFile(path.join(dir,'report.json'),JSON.stringify({status:'passed',version,checks,errors},null,2));console.log(checks);
}finally{await browser?.close();await vite.close();}
