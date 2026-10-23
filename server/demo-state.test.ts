import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, demoTwitchState } from '../shared/demo-state';
import { seasonStatistics } from '../shared/season-statistics';
import { lineupRunes } from '../shared/lineup-runes';
import { lineupStatRunes } from '../shared/stat-runes';
import { archiveMetrics } from '../shared/archive-graphics';
import { liveDamage } from '../shared/combat-display';

test('browser demonstration has isolated complete graphic data with fresh telemetry and archived examples',()=>{
  const now=Date.now(),state=createDemoState(now),other=createDemoState(now);
  assert.equal(state.players.length,10);assert.equal(new Set(state.players.map(p=>p.registeredPlayerId)).size,10);
  assert(state.players.every(p=>lineupRunes(p).length===6&&lineupStatRunes(p).length===3&&liveDamage(p,state,now)!>0));
  assert.equal(state.settings.obsUrl,'');assert.equal(state.production?.program,undefined);assert.equal(state.match.title,'RiftCast 图形演示');
  assert.equal(seasonStatistics(state).games,2);assert.equal(seasonStatistics(state).players.length,10);assert(archiveMetrics(state,state.gameResults![0]).every(r=>r.blue!==null&&r.red!==null));
  state.players[0].name='changed';assert.notEqual(other.players[0].name,'changed');
});
test('Twitch mock data provides all three graphical modes without credentials or platform access',()=>{
  for(const display of ['poll','prediction','chat-vote'] as const){const sample=demoTwitchState(display,100000);assert.equal(sample.display,display);assert.equal(sample.poll?.choices.reduce((n,c)=>n+c.votes,0),100);assert.equal(sample.chatVote?.totalVoters,100);assert.equal(sample.channel,undefined);}
});
