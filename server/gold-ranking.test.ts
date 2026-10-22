import { createFixture as createSeed, emptyFixture } from './test-support/fixture';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goldRanking, rankingGold } from '../shared/gold-ranking';

test('all ten players share one descending ranking and one bar scale', () => {
  const state = createSeed(), rows = goldRanking(state);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map(row => row.gold), [11100, 10600, 10400, 9500, 9400, 8300, 8100, 7600, 5400, 4900]);
  assert.deepEqual(rows.slice(0, 5).map(row => row.player.team), ['blue', 'blue', 'red', 'red', 'blue']);
  assert.deepEqual(rows.map(row => row.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(rows[0].percentage, 100);
  assert.equal(rows[5].percentage, 8300 / 11100 * 100);
  assert.equal(state.players[0].gold, 9400);
});
test('missing, negative and non-finite totals sort last; spendable gold never substitutes for total gold', () => {
  const state = createSeed();
  Object.assign(state.players[0], { gold: null, currentGold: 99999 });
  state.players[1].gold = -100; state.players[2].gold = NaN; state.players[3].gold = 0;
  const rows = goldRanking(state);
  assert.equal(rows[6].gold, 0); assert.equal(rows[6].rank, 7);
  assert.ok(rows.slice(7).every(row => row.gold === null && row.rank === null && row.percentage === 0));
});
test('live totals require fresh OCR or an active API sample and reject a pending replay seek', () => {
  const now = Date.now(), state = createSeed(); state.mode = 'live';
  const player = state.players[0];delete player.goldSource;
  assert.equal(rankingGold(state, player, now), null);
  Object.assign(player, { goldSource: 'ocr', goldExpiresAt: new Date(now + 1000).toISOString() });
  assert.equal(rankingGold(state, player, now), 9400);
  assert.equal(rankingGold(state, player, now + 1000), null);
  Object.assign(player, { goldSource: 'api', goldSampledAt: new Date(now).toISOString() });
  state.connections.live.status = 'connected';
  assert.equal(rankingGold(state, player, now), 9400);
  assert.equal(rankingGold(state, player, now + 10001), null);
  state.connections.live.status = 'disconnected'; assert.equal(rankingGold(state, player, now), null);
  state.connections.live.status = 'connected';
  state.gameClock = { awaitingLiveSample: true } as typeof state.gameClock;
  assert.equal(rankingGold(state, player, now), null);
});
test('equal totals stay in a stable order when incoming roster order changes', () => {
  const state = createSeed(); state.players.forEach(player => { player.gold = 1000; });
  const expected = goldRanking(state).map(row => row.player.id);
  state.players.reverse(); assert.deepEqual(goldRanking(state).map(row => row.player.id), expected);
});

test('direct memory gold populates all ten ranks and rejects stale, disconnected or wrong-time frames',()=>{
  const state=createSeed(),now=Date.now();state.gameTime=500;state.connections.live.status='connected';
  state.players.forEach(p=>Object.assign(p,{goldSource:'memory',goldGameTime:500,goldSampledAt:new Date(now).toISOString(),goldExpiresAt:new Date(now+3000).toISOString(),currentGold:99999}));
  const rows=goldRanking(state,now);
  assert.equal(rows.filter(r=>r.gold!==null).length,10);assert.equal(rows[0].gold,11100);assert.equal(rows[0].percentage,100);
  const p=state.players[0];assert.equal(rankingGold(state,p,now),9400);
  for(const mutate of [(s:typeof state)=>s.connections.live.status='disconnected',(s:typeof state)=>s.gameTime=400,(s:typeof state)=>s.gameTime=600,(s:typeof state)=>s.gameClock={awaitingLiveSample:true} as typeof state.gameClock]){
    const invalid=structuredClone(state);mutate(invalid);assert.equal(rankingGold(invalid,invalid.players[0],now),null);
  }
  assert.equal(rankingGold(state,p,now+3000),null);assert.equal(rankingGold(state,p,now-1001),null);
  for(const patch of [{goldExpiresAt:'invalid'},{goldSampledAt:undefined},{goldGameTime:undefined},{gold:NaN}])assert.equal(rankingGold(state,{...p,...patch},now),null);
  assert.equal(rankingGold(state,{...p,gold:0},now),0);
});
