const { createFixture: createSeed } = await tsImport('../server/test-support/fixture.ts', import.meta.url);
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
const { finalizeGame } = await tsImport('../server/game-results.ts', import.meta.url);
const { writableOcrMatch, retainTeamGold } = await tsImport('../server/hud-ocr.ts', import.meta.url);
export const amounts = [11200,10400,13400,16300,9200,13500,12500,16300,17400,8500];
export const counts = {blue:{towers:5,dragons:2,barons:1,voidgrubs:0},red:{towers:7,dragons:3,barons:1,voidgrubs:3}};
/** Synthetic report data for layout and isolated packaged-renderer verification only. */
export function reportFixture(variant='full') {
  assert.ok(['full','partial','missing'].includes(variant));
  const state=createSeed();state.mode='live';state.phase='live';state.gameTime=2008;state.activeSourceGameId='fixture-093';
  state.match.blueScore=0;state.match.redScore=0;
  // Exercise the normal finalization guard with explicitly simulated observed statistics.
  // Demo event IDs and unobserved seed statistics must never masquerade as an archived live match.
  state.events=[];
  const names=['三千风月','也曾拥有过青春吗','只打我好么QWQ','O又甜又糯小蛋糕O','Rainy、Night','WWWWWWWWWWWWWWWW','一二三四五六七八九十一二三四五六','ur3','AB中文混合1234567890','爱做高手'];
  const data=writableOcrMatch(state);const at=Date.parse('2026-10-15T00:00:00Z');
  assert.ok(data);
  state.players.forEach((p,i)=>{
    p.name=names[i];p.gold=null;p.goldSource='unknown';delete p.goldExpiresAt;delete p.damageDealt;delete p.damageTaken;
    p.statsSource='ocr';p.statsAvailable=true;p.statsSampledAt=new Date(at).toISOString();p.statsGameTime=2008;p.statsExpiresAt=new Date(at+10000).toISOString();
    p.fullRuneIds=[8437,8446,8444,8451,8304,8345];
    data.players[p.id]={value:amounts[i],team:p.team,championId:p.championId,gameTime:2008,sampledAt:new Date(at).toISOString()};
  });
  for(const side of ['blue','red'])for(const key of Object.keys(counts[side]))data.objectives[side][key]={value:counts[side][key],sampledAt:new Date(at).toISOString(),gameTime:2008};
  for(const point of [[0,2500,2500],[600,20000,21500],[1200,38500,36100],[1800,55800,62000],[2008,60500,68200]])retainTeamGold(data,point[1],point[2],at-2008000+point[0]*1000,point[0]);
  state.economy=[];state.stats.blue.gold=null;state.stats.red.gold=null;
  if(variant==='partial'){delete data.players[state.players[0].id];delete data.objectives.red.barons;}
  if(variant==='missing')delete state.ocrMatch;
  state.draft.locked=true;state.draft.bluePicks=state.players.filter(p=>p.team==='blue').map(p=>p.championId);state.draft.redPicks=state.players.filter(p=>p.team==='red').map(p=>p.championId);
  const result=finalizeGame(state,{source:'manual',winner:'red',terminal:true});
  assert.ok(result,'synthetic observations must pass real finalization before layout or package checks');
  assert.equal(state.finishedGameId,result.id);assert.equal(result.winner,'red');assert.equal(state.phase,'postgame');
  state.previewScene='postgame';state.overlay.postgamePage=1;
  return state;
}
