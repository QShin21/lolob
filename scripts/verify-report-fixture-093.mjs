import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { reportFixture, amounts, counts } from './report-093-fixture.mjs';
const { normalizeSavedState, resetRuntimeState } = await tsImport('../server/state.ts', import.meta.url);
const { currentGameResult, frozenGameState } = await tsImport('../shared/game-results.ts', import.meta.url);
const { postgameOcrView, currentOcrMatch } = await tsImport('../shared/hud-ocr.ts', import.meta.url);

for (const variant of ['full','partial','missing']) {
  const input=reportFixture(variant);
  const restored=normalizeSavedState(JSON.parse(JSON.stringify(input)));
  resetRuntimeState(restored);
  const result=currentGameResult(restored);
  assert.ok(result,`${variant}: finalization must survive the same startup path as the packaged service`);
  assert.equal(result.id,input.finishedGameId);assert.equal(result.winner,'red');
  assert.equal(restored.phase,'postgame');assert.equal(restored.players.length,10);
  const view=postgameOcrView(frozenGameState(restored));
  const expected=amounts.map((value,i)=>variant==='missing'||variant==='partial'&&i===0?null:value);
  assert.deepEqual(view.players.map(p=>p.gold),expected,`${variant}: all ten retained gold values`);
  const ocr=currentOcrMatch(view);
  for (const side of ['blue','red']) for (const [key,value] of Object.entries(counts[side])) {
    const expected=variant==='missing'||variant==='partial'&&side==='red'&&key==='barons'?undefined:value;
    assert.equal(ocr?.objectives[side][key]?.value,expected,`${variant}: ${side} ${key}`);
  }
  assert.equal(view.economy.length,variant==='missing'?0:5);
  assert.equal(view.stats.blue.gold,variant==='missing'?null:60500);
  assert.equal(view.stats.red.gold,variant==='missing'?null:68200);
  assert.deepEqual(result.snapshot.ocrMatch,input.gameResults[0].snapshot.ocrMatch);
  console.log(`${variant}: confirmed synthetic archive survives JSON, normalization and service restart with all OCR values and curve intact`);
}
