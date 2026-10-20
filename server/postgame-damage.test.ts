import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFixture} from './test-support/fixture';
import {damageShare,reportDamage} from '../shared/postgame-damage';
import {finalizeGame,absorbTerminalGameSample} from './game-results';
import {frozenGameState} from '../shared/game-results';
test('report consumes observed damage and received totals from a frozen game and calculates within each team',()=>{
 const state=createFixture();state.players.forEach((p,i)=>{delete p.damageDealt;delete p.damageTaken;p.telemetryDamage={toChampions:(i%5+1)*100,taken:(5-i%5)*200};p.telemetryDamageSource='packets';p.telemetryDamageSince=0;});
 const result=finalizeGame(state,{source:'manual'})!;const frozen=frozenGameState(state,result);
 for(const team of ['blue','red'] as const){const players=frozen.players.filter(p=>p.team===team);assert.equal(damageShare(players[0],players,'damageDealt'),100/1500*100);assert.equal(damageShare(players[0],players,'damageTaken'),1000/3000*100);assert(Math.abs(players.reduce((n,p)=>n+damageShare(p,players,'damageTaken')!,0)-100)<.00001);}
});
test('official zeros take precedence, missing teammates and partial-match captures remain unknown',()=>{
 const players=createFixture().players.filter(p=>p.team==='blue');for(const p of players){delete p.damageDealt;p.telemetryDamage={toChampions:100,taken:20};p.telemetryDamageSource='packets';p.telemetryDamageSince=0;}
 players[0].damageDealt=0;assert.equal(reportDamage(players[0],'damageDealt'),0);assert.equal(damageShare(players[0],players,'damageDealt'),0);
 players[1].telemetryDamageSince=100;assert.equal(damageShare(players[0],players,'damageDealt'),null);
 players[1].telemetryDamageSince=0;delete players[1].telemetryDamage!.taken;assert.equal(damageShare(players[0],players,'damageTaken'),null);
 for(const p of players)p.damageDealt=0;assert.equal(damageShare(players[0],players,'damageDealt'),0);
 assert.equal(damageShare(players[0],players.slice(1),'damageDealt'),null);
});

test('late packet totals fill an accepted terminal archive without replacing official postgame data',()=>{
 const state=createFixture();state.mode='live';state.events=[];state.players.forEach(p=>p.statsSource='api');
 const result=finalizeGame(state,{source:'live',terminal:true})!;
 const sample={players:structuredClone(state.players),stats:state.stats,events:state.events,gameTime:state.gameTime,ended:true};
 sample.players.forEach(p=>{p.telemetryDamage={toChampions:100,taken:200};p.telemetryDamageSource='packets';p.telemetryDamageSince=0;});
 assert.equal(absorbTerminalGameSample(state,sample),true);assert.equal(result.snapshot.players[0].telemetryDamage?.taken,200);assert.equal(state.recordings[0].players[0].telemetryDamage?.taken,200);
 result.snapshot.players[0].telemetryDamageSource='postgame';result.snapshot.players[0].telemetryDamage={taken:999};
 absorbTerminalGameSample(state,sample);assert.equal(result.snapshot.players[0].telemetryDamage.taken,999);
});
