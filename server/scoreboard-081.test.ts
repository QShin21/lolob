import { createFixture as createSeed, emptyFixture } from './test-support/fixture';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/scoreboard-081.json';
import {parseScoreboardRows,matchPlayerScoreboardRows} from './spectator-scoreboard';
import {EconomyBridge,defaultEconomyConfig,defaultPlayerGoldRegion} from './economy';
import {applyAction} from './state';
import {playerVision,playerGoldText} from '../src/lib';
export const expected=[
 ['Trundle',9,393,4343,61],['Elise',6,1023,5478,67],['Lucian',3,355,4555,106],['Yunara',8,283,5593,116],['Nautilus',20,471,3576,19],
 ['Yasuo',11,1402,6477,141],['Nidalee',25,669,9569,120],['Sivir',7,1610,8115,128],['Ziggs',6,646,6196,116],['Jhin',21,141,4916,11]
] as const;
function setup(){const state=emptyFixture();state.gameTime=855;state.players=expected.map(([championId],i)=>({...state.players[i],id:championId,championId,team:i<5?'blue':'red',kills:0,deaths:0,assists:0,cs:0,gold:null,currentGold:undefined,visionScore:undefined}));return state;}
test('user screenshot maps all ten vision, spendable gold, cumulative gold and CS values despite stale API and death overlays',()=>{
 const state=setup();const matched=matchPlayerScoreboardRows(parseScoreboardRows(fixture.playerWords,fixture.playerPortraits),[...state.players].reverse());assert.equal(matched.size,10);
 for(const [id,vision,current,total,cs] of expected){const r=matched.get(id)!;assert.ok(r,id);assert.deepEqual([r.visionScore,r.currentGold,r.totalGold,r.cs],[vision,current,total,cs],id);}
});
test('OCR vision and economy reach live players and expire independently without retaining old values',async()=>{
 const state=setup();let now=100000;const bridge=new EconomyBridge(()=>state,f=>f(state),{now:()=>now,capture:async()=>fixture});bridge.configure({...defaultEconomyConfig,players:{enabled:true,region:defaultPlayerGoldRegion}});bridge.observePlayers(state.players,state.gameTime);await bridge.probe();
 for(const [id,vision,current,total,cs]of expected){const p=state.players.find(p=>p.id===id)!;assert.deepEqual([p.visionScore,p.currentGold,p.gold,p.cs],[vision,current,total,cs]);assert.equal(playerVision(p,now),vision);assert.equal(playerGoldText(p,now),`${current}(${total})`);}
 now+=3001;const aged=bridge.resolvePlayers(state.players);assert.ok(aged.every(p=>p.visionScore===undefined));assert.ok(aged.every(p=>p.gold!==null));
 now+=7000;assert.ok(bridge.resolvePlayers(state.players).every(p=>p.gold===null&&p.currentGold===undefined));
});
test('vision requires a unique tagged outer-column value',()=>{const rows=parseScoreboardRows(fixture.playerWords.filter(w=>w.field!=='vision'),fixture.playerPortraits);assert.ok(rows.every(r=>r.visionScore===undefined));});
