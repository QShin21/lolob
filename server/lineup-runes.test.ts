import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLive} from './adapters';
import {bundledChampions} from '../shared/champion-art';
import {lineupRunes,selectedRuneIds} from '../shared/lineup-runes';
const ids=[8437,8446,8444,8451,8304,8345];
test('full rune pages remain bound to matching player; primary/secondary trees never fill minor rune slots',()=>{
 const players=[{riotId:'one#1',championName:'Camille',team:'ORDER',runes:{keystone:{id:8437},primaryRuneTree:{id:8400},secondaryRuneTree:{id:8300}}},{riotId:'two#2',championName:'Ambessa',team:'CHAOS',runes:{keystone:{id:8437}}}];
 const state=normalizeLive({allPlayers:players,activePlayer:{riotId:'one#1',fullRunes:{generalRunes:ids.map(id=>({id}))}},gameData:{gameTime:50}},bundledChampions());
 assert.deepEqual(lineupRunes({...state.players[0],fullRuneIds:undefined}),[8437,8400,8300]);
 assert.deepEqual(state.players.find(p=>p.id==='live-one#1')?.fullRuneIds,ids);
 const other=state.players.find(p=>p.id==='live-two#2')!;assert.equal(other.fullRuneIds,undefined);assert.deepEqual(lineupRunes(other),[8437]);
 assert.equal(selectedRuneIds({generalRunes:[{id:8400},{id:8300}]}),undefined);assert.equal(selectedRuneIds({generalRunes:Array(6).fill({id:8437})}),undefined);
});
