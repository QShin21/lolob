import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLive} from './adapters';
import {bundledChampions} from '../shared/champion-art';
import {lineupRunes,selectedRuneIds} from '../shared/lineup-runes';
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
test('all ten verified native pages render six choices; shards and malformed pages do not fill rune slots',()=>{
 for(const p of pages){assert.deepEqual(selectedRuneIds({generalRunes:p.runes.map(id=>({id}))}),p.runes);}
 for(const ids of [[8437,8446,8473,8451,5008,5001],[8437,8446,8473,8451,8345,8135],[8437,8446,8473,8451,8444,8463]])assert.equal(selectedRuneIds({generalRunes:ids.map(id=>({id}))}),undefined);
 assert.deepEqual(lineupRunes(undefined),[]);
});
