// Two bounded additions: actual assignment exchange / undo / restore and exact stable-team history.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { evidence, source, chromium, browserOptions, createSeed, captureProgram, programState, start, stop, read, post, action, patch, safeContext, until } from './harness.mjs';
const results = [], errors = []; let service, browser, page;
try {
  const seed = createSeed(); seed.paused = true; seed.demoPaused = true; seed.phase = 'draft'; seed.production.rules.mode = 'standard'; seed.overlay.nativeHud = 'off'; seed.programScene = seed.previewScene = 'lineup'; seed.production.program = captureProgram(seed);
  service = await start('boundaries', seed); const seat = await post(service, '/api/control/seat', { name: 'Sol bounded identity regression', role: 'director' }); assert.equal(seat.status, 200); const owner = seat.data.token;
  browser = await chromium.launch(browserOptions); const context = await safeContext(browser, service, owner); await context.route('**/api/resources/asset**', route => route.fulfill({ json: { data: {} } })); page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.goto(service.base + '/overlay'); await page.locator('.cast-scene-lineup').waitFor();
  async function check(id, run) { try { const data = await run(); results.push({ id, status: 'pass', data }); console.log('PASS ' + id); } catch (e) { results.push({ id, status: 'fail', error: e.message, stack: e.stack }); console.error('FAIL ' + id + ': ' + e.message); } }
  const ids = s => programState(s).players.map(p => [p.id, p.name, p.team, p.role, p.championId]);
  const rendered = () => page.locator('.arena-lineup-player').allTextContents();
  await check('actual-http-assignment-exchange-undo-restore-source', async () => {
    await action(service, { type: 'take', scene: 'lineup' }, owner); const before = await read(service), initial = ids(before), picture = await rendered(); const pair = before.players.filter(p => p.team === 'blue').slice(0, 2);
    const mapping = pair.map((p, i) => ({ playerId: p.id, team: 'blue', role: p.role, championId: pair[1 - i].championId, locked: true }));
    const pending = await action(service, { type: 'production', command: { op: 'assign', assignments: mapping } }, owner); assert.deepEqual(ids(pending), initial); assert.deepEqual(await rendered(), picture);
    const accepted = await action(service, { type: 'take', scene: 'lineup' }, owner); for (const item of mapping) assert.equal(programState(accepted).players.find(p => p.id === item.playerId).championId, item.championId); await until(async () => JSON.stringify(await rendered()) !== JSON.stringify(picture), 'same-scene TAKE publishes exchanged identities');
    const onAir = ids(accepted); const undone = await action(service, { type: 'production', command: { op: 'immediate', action: 'undo' } }, owner); assert.deepEqual(ids(undone), initial); const redone = await action(service, { type: 'production', command: { op: 'immediate', action: 'undo' } }, owner); assert.deepEqual(ids(redone), onAir);
    await action(service, { type: 'set-draft', patch: { bluePicks: ['Akali', ...redone.draft.bluePicks.slice(1)] } }, owner); const held = await read(service), current = ids(held), production = structuredClone(held.production); const clientPlayers = structuredClone(held.players); clientPlayers[0].championId = 'Gwen'; clientPlayers[0].championName = '灵罗娃娃'; production.clientDraft = { draft: { ...structuredClone(held.draft), bluePicks: ['Gwen', ...held.draft.bluePicks.slice(1)] }, players: clientPlayers, at: new Date().toISOString() }; await patch(service, { production });
    const restored = await action(service, { type: 'production', command: { op: 'draft-mode', mode: 'auto', resolution: 'client' } }, owner); assert.deepEqual(ids(restored), current); const published = await action(service, { type: 'take', scene: 'lineup' }, owner); assert.equal(programState(published).players[0].championId, 'Gwen');
    return { actualActionQueue: true, assignmentPair: 2, sameSceneTake: true, undoRedo: true, automaticSourceWaitsForTake: true, engineAcceptance: 'synthetic' };
  });
  await check('game5-exact-history-uses-stable-team-on-each-swapped-side', async () => {
    const s = await read(service); const original = createSeed(), bluePicks = original.draft.bluePicks, redPicks = original.draft.redPicks; s.match.game = 5; s.match.format = 'BO5'; const blueId = s.match.blueTeamId, redId = s.match.redTeamId;
    const history = Array.from({ length: 4 }, (_, i) => ({ seriesId: s.match.seriesId, game: i + 1, blueTeamId: i % 2 ? redId : blueId, redTeamId: i % 2 ? blueId : redId, bluePicks: i % 2 ? redPicks : bluePicks, redPicks: i % 2 ? bluePicks : redPicks, recordedAt: new Date().toISOString(), source: 'demo' })); await patch(service, { match: s.match, draftHistory: history });
    await action(service, { type: 'take', scene: 'draft' }, owner); await page.locator('.cast-scene-draft').waitFor(); const champions = await fetch(service.base + '/api/champions').then(r => r.json()); const catalog = Array.isArray(champions) ? champions : champions.champions; assert.ok(Array.isArray(catalog)); const name = id => catalog.find(c => c.id === id)?.name;
    for (const side of ['blue', 'red']) { const actual = await page.locator(`.cast-ban-history.${side} .cast-history-game img`).evaluateAll(els => els.map(e => e.alt)); const expected = Array.from({ length: 4 }, () => side === 'blue' ? bluePicks : redPicks).flat().map(name); assert.equal(actual.length, 20); assert.deepEqual(actual, expected); }
    return { archivedGames: 4, stableTeamChecks: 40, swaps: 'games 2 and 4 exchange blue/red while each team keeps its own picks' };
  });
  assert.deepEqual(errors, []);
} catch (e) { results.push({ id: 'harness', status: 'fail', error: e.message, stack: e.stack }); console.error(e.stack); }
finally { await browser?.close(); await stop(service); await writeFile(path.join(evidence, 'boundaries.json'), JSON.stringify({ source, work: service?.work, results, errors, boundary: 'Actual isolated HTTP and renderer; synthetic adapter acceptance. Focus-player archive is additionally covered by the separately run program-render-isolation.test.ts.' }, null, 2)); }
console.log(JSON.stringify({ checks: results.length, passed: results.filter(r => r.status === 'pass').length, failed: results.filter(r => r.status === 'fail').length, errors: errors.length })); if (results.some(r => r.status === 'fail')) process.exitCode = 1;
