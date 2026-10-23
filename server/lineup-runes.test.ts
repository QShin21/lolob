import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLive} from './adapters';
import {bundledChampions} from '../shared/champion-art';
import {lineupRunes,selectedRuneIds} from '../shared/lineup-runes';
import {lineupStatRunes,selectedStatRuneIds,STAT_RUNES} from '../shared/stat-runes';
import {runeImage} from '../shared/player-assets';
import {readFileSync} from 'node:fs';
import pages from './test-support/rune-pages.json';
const ids=[8437,8446,8444,8451,8304,8345];
test('full rune pages remain bound to matching player; primary/secondary trees never fill minor rune slots',()=>{
 const players=[{riotId:'one#1',championName:'Camille',team:'ORDER',runes:{keystone:{id:8437},primaryRuneTree:{id:8400},secondaryRuneTree:{id:8300}}},{riotId:'two#2',championName:'Ambessa',team:'CHAOS',runes:{keystone:{id:8437}}}];
 const state=normalizeLive({allPlayers:players,activePlayer:{riotId:'one#1',fullRunes:{generalRunes:ids.map(id=>({id}))}},gameData:{gameTime:50}},bundledChampions());
 assert.deepEqual(lineupRunes(state.players[0]),ids);
 assert.deepEqual(state.players.find(p=>p.id==='live-one#1')?.fullRuneIds,ids);
 const other=state.players.find(p=>p.id==='live-two#2')!;assert.equal(other.fullRuneIds,undefined);assert.deepEqual(lineupRunes(other),[8437]);
 assert.equal(selectedRuneIds({generalRunes:[{id:8400},{id:8300}]}),undefined);assert.equal(selectedRuneIds({generalRunes:Array(6).fill({id:8437})}),undefined);
});
test('three stat shards preserve duplicate choices and never infer missing or unknown slots',()=>{
 assert.deepEqual(selectedStatRuneIds([{id:5008},{id:5008},{id:5001}]),[5008,5008,5001]);
 assert.deepEqual(selectedStatRuneIds([5005,5010,5013]),[5005,5010,5013]);
 for(const value of [[5008,5001],[5008,5001,999999],[5008,'5001',5011],null])assert.equal(selectedStatRuneIds(value),undefined);
 assert.deepEqual(lineupStatRunes(undefined),[]);
 for(const id of Object.keys(STAT_RUNES).map(Number)){
  assert.equal(runeImage(id),`/runes/${id}.png`);
  const data=readFileSync(new URL(`../public/runes/${id}.png`,import.meta.url));assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 }
});
test('active-player shards stay with exact identity even when the six-choice page is missing',()=>{
 const players=[{riotId:'one#1',championName:'Camille',team:'ORDER'},{riotId:'two#2',championName:'Ambessa',team:'CHAOS'}];
 const data={allPlayers:players,activePlayer:{riotId:'one#1',fullRunes:{statRunes:[5005,5008,5011].map(id=>({id}))}},gameData:{gameTime:50}};
 const state=normalizeLive(data,bundledChampions()),one=state.players.find(p=>p.id==='live-one#1')!,two=state.players.find(p=>p.id==='live-two#2')!;
 assert.deepEqual(lineupStatRunes(one),[5005,5008,5011]);assert.equal(one.fullRuneIds,undefined);assert.deepEqual(lineupStatRunes(two),[]);
 data.activePlayer.riotId='unknown#1';assert.ok(normalizeLive(data,bundledChampions()).players.every(p=>p.statRuneIds===undefined));
});
test('all ten verified native pages render six choices; shards and malformed pages do not fill rune slots',()=>{
 for(const p of pages){assert.deepEqual(selectedRuneIds({generalRunes:p.runes.map(id=>({id}))}),p.runes);}
 for(const ids of [[8437,8446,8473,8451,5008,5001],[8437,8446,8473,8451,8345,8135],[8437,8446,8473,8451,8444,8463]])assert.equal(selectedRuneIds({generalRunes:ids.map(id=>({id}))}),undefined);
 assert.deepEqual(lineupRunes(undefined),[]);
});
