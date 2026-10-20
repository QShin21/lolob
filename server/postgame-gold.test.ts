import test from 'node:test';
import assert from 'node:assert/strict';
import {matchupGoldShares} from '../shared/postgame-gold';
test('matchup shares use the opposing pair total, independent of other players',()=>{
 assert.deepEqual(matchupGoldShares(10000,15000),[.4,.6]);
 assert.deepEqual(matchupGoldShares(13900,13900),[.5,.5]);
 assert.deepEqual(matchupGoldShares(0,10000),[0,1]);
 assert.deepEqual(matchupGoldShares(10000,0),[1,0]);
 assert.deepEqual(matchupGoldShares(Number.MAX_VALUE,Number.MAX_VALUE),[.5,.5]);
});
test('zero totals and unavailable or invalid observations do not invent percentages',()=>{
 for(const pair of [[0,0],[null,10000],[10000,undefined],[-1,10000],[Infinity,10000],[NaN,10000],['10000',10000]])assert.equal(matchupGoldShares(...pair as [unknown,unknown]),null);
});
