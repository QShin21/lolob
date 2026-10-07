import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bottomGoldDifference, bottomItemSlots, bottomPlayers } from './bottom-scoreboard';
import { applyAction, createSeed, normalizeSavedState } from './state';

test('bottom scoreboard pairs lanes independently of source order',()=>{
  const s=createSeed();s.players.reverse();
  assert.deepEqual(bottomPlayers(s,'blue').map(p=>p?.role),['上单','打野','中单','下路','辅助']);
  assert.deepEqual(bottomPlayers(s,'red').map(p=>p?.role),['上单','打野','中单','下路','辅助']);
  s.players=s.players.filter(p=>p.role!=='中单');
  assert.equal(bottomPlayers(s,'blue')[2],undefined);
  assert.equal(bottomPlayers(s,'blue')[3]?.role,'下路');
});
test('live lead accepts matched fresh API and OCR cumulative gold and rejects stale or mismatched samples',()=>{
  const [blue,red]=[createSeed().players[0],createSeed().players[5]],now=Date.now();
  Object.assign(blue,{gold:12800,currentGold:200,goldSource:'ocr',goldSampledAt:new Date(now).toISOString(),goldGameTime:100,goldExpiresAt:new Date(now+1000).toISOString()});
  Object.assign(red,{gold:12000,currentGold:2000,goldSource:'ocr',goldSampledAt:new Date(now).toISOString(),goldGameTime:100,goldExpiresAt:new Date(now+1000).toISOString()});
  assert.equal(bottomGoldDifference('live',blue,red,now),800);
  assert.equal(bottomGoldDifference('live',blue,red,now+1000),null);
  red.goldSource='api';assert.equal(bottomGoldDifference('live',blue,red,now),800);
  red.goldGameTime=104;assert.equal(bottomGoldDifference('live',blue,red,now),null);red.goldGameTime=100;
  red.role='待分路';assert.equal(bottomGoldDifference('live',blue,red,now),null);red.role=blue.role;
  assert.equal(bottomGoldDifference('live',blue,undefined,now),null);
  assert.equal(bottomGoldDifference('demo',blue,red,now),800);
});
test('bottom equipment keeps six slots and separates compact inventory trinkets',()=>{
  const p=createSeed().players[0];p.items=[1001,3340,3031];
  delete p.itemSlots;delete p.itemCounts;
  assert.deepEqual(bottomItemSlots(p),[1001,3031,0,0,0,0,3340]);
  p.itemSlots=[1001,0,3031,0,0,0,3364];assert.deepEqual(bottomItemSlots(p),p.itemSlots);
});
test('bottom settings persist independently, migrate older saves, and validate feed sources',()=>{
  const s=createSeed();const next=applyAction(s,{type:'set-overlay',patch:{patchVersion:'26.19',bottomTitle:'校园杯决赛',playerFeeds:{blue:{mode:'camera',cameraDeviceId:'camera-id',label:'选手 A'}}}});
  assert.equal(next.overlay.patchVersion,'26.19');assert.equal(next.overlay.bottomTitle,'校园杯决赛');assert.equal(next.overlay.playerFeeds?.blue.cameraDeviceId,'camera-id');
  assert.deepEqual(next.overlay.playerFeeds?.red,s.overlay.playerFeeds?.red);assert.equal(s.overlay.patchVersion,'26.18');
  for(const patch of [{playerFeeds:{blue:{mode:'camera'}}},{playerFeeds:{red:{imageUrl:'javascript:alert(1)'}}},{patchVersion:'x'.repeat(21)}])assert.throws(()=>applyAction(s,{type:'set-overlay',patch}));
  const legacy=structuredClone(s);delete legacy.overlay.playerFeeds;delete legacy.overlay.patchVersion;
  const migrated=normalizeSavedState(legacy);assert.equal(migrated.overlay.patchVersion,'26.18');assert.equal(migrated.overlay.playerFeeds?.red.mode,'image');
});
