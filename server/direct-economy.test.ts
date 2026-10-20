import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directEconomy } from './direct-economy';
import { EconomyBridge, defaultEconomyConfig } from './economy';
import { createFixture } from './test-support/fixture';
import { postgameOcrView } from '../shared/hud-ocr';
import { finalizeGame } from './game-results';
import { frozenGameState } from '../shared/game-results';
import { csvRecording } from '../shared/recording-export';

function fixture(){
 const s=createFixture();s.mode='live';s.gameTime=100;s.economy=[];delete s.ocrMatch;
 s.players.forEach((p,i)=>Object.assign(p,{gold:1000+i*100,currentGold:50+i,goldSource:'memory',goldGameTime:100,goldSampledAt:new Date(100000).toISOString(),goldExpiresAt:new Date(103000).toISOString()}));
 return s;
}
test('direct team totals sum five cumulative balances, never current balances, with strict freshness and roster checks',()=>{
 const s=fixture(),feed=directEconomy(s.players,100,100500);
 assert.equal(feed.source,'memory');assert.equal(feed.blue,6000);assert.equal(feed.red,8500);
 assert.equal(directEconomy(s.players,100,103001).status,'stale');
 assert.equal(directEconomy(s.players,90,100500).status,'stale');
 for(const mutate of [(p:any[])=>p.pop(),(p:any[])=>p[0].gold=null,(p:any[])=>p[0].goldSource='ocr',(p:any[])=>p[0].team='red',(p:any[])=>p[0].id=p[1].id]){
  const players=structuredClone(s.players);mutate(players);assert.notEqual(directEconomy(players,100,100500).status,'fresh');
 }
});
test('production direct mode ignores legacy gold OCR and manual inputs, expires, and retains exact postgame history',async()=>{
 const s=fixture();let now=100500,calls=0;
 const bridge=new EconomyBridge(()=>s,fn=>fn(s),{goldSource:'direct',now:()=>now,capture:async config=>{
  calls++;assert.equal(config.enabled,false);return {ok:true,blueText:'99k',redText:'98k'};
 }});
 bridge.configure({...defaultEconomyConfig,enabled:true});
 bridge.observePlayers(s.players,100);
 const live=bridge.resolve(100,s.stats);s.stats=live.stats;s.economyFeed=live.feed;
 await bridge.probe();
 assert.equal(calls,0);assert.equal(s.stats.blue.gold,6000);assert.equal(bridge.status().source,'memory');
 assert.throws(()=>bridge.sample({blue:1,red:2}),/直读/);await assert.rejects(bridge.autoCalibrate(),/直读/);
 assert.equal(s.ocrMatch?.teamGold?.source,'memory');assert.equal(s.ocrMatch?.players[s.players[0].id].source,'memory');
 now=103501;await bridge.poll();assert.equal(s.stats.blue.gold,null);assert.equal(s.players[0].gold,null);
 const view=postgameOcrView(s);assert.equal(view.players[0].gold,1000);assert.equal(view.stats.blue.gold,6000);
 const result=finalizeGame(s,{source:'manual',winner:'blue'})!;
 assert.equal(postgameOcrView(frozenGameState(s)).stats.red.gold,8500);
 assert(csvRecording(result.snapshot).includes('国服观战直读'));
 bridge.close();
});
test('same sample polling cannot renew gold freshness, and source changes/seek reset direct samples',()=>{
 const s=fixture();let now=100500;
 const bridge=new EconomyBridge(()=>s,fn=>fn(s),{goldSource:'direct',now:()=>now});
 bridge.observePlayers(s.players,100);assert.equal(bridge.resolve(100,s.stats).feed.status,'fresh');
 now=103001;assert.equal(bridge.resolve(100,s.stats).feed.status,'stale');
 now=100500;bridge.observePlayers(s.players,100);assert.equal(bridge.resolve(100,s.stats).feed.status,'fresh');
 s.match.game++;assert.equal(bridge.status().source,'none');
 bridge.observePlayers(s.players,100);bridge.resolve(100,s.stats);bridge.resolve(80,s.stats);
 assert.equal(bridge.status().source,'none');assert.equal(s.ocrMatch,undefined);
 bridge.close();
});
test('direct resource counts retain Herald and Elder for reports without OCR and follow backward seeks',()=>{
 const s=fixture();let now=100500;
 const bridge=new EconomyBridge(()=>s,fn=>fn(s),{goldSource:'direct',now:()=>now});
 for(const side of ['blue','red']as const)Object.assign(s.stats[side],{objectivesSource:'memory',objectivesSampledAt:new Date(100000).toISOString(),objectivesExpiresAt:new Date(103000).toISOString(),heralds:side==='blue'?1:0,elders:0,voidgrubs:side==='red'?3:0});
 bridge.observePlayers(s.players,100);bridge.resolve(100,s.stats);
 assert.equal(s.ocrMatch?.objectives.blue.heralds?.value,1);
 assert.equal(s.ocrMatch?.objectives.red.voidgrubs?.value,3);
 assert.equal(s.ocrMatch?.objectives.blue.elders?.value,0);
 now=104000;const missing=structuredClone(s.stats);missing.blue.heralds=99;
 bridge.resolve(100,missing);assert.equal(s.ocrMatch?.objectives.blue.heralds?.value,1);
 const earlier=structuredClone(s.stats);for(const side of ['blue','red']as const)Object.assign(earlier[side],{heralds:0,voidgrubs:0,objectivesSampledAt:new Date(now).toISOString(),objectivesExpiresAt:new Date(now+3000).toISOString()});
 bridge.resolve(20,earlier);assert.equal(s.ocrMatch?.objectives.blue.heralds?.value,0);
 assert.equal(s.ocrMatch?.objectives.red.voidgrubs?.value,0);bridge.close();
});
