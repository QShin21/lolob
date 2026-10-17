import assert from 'node:assert/strict';
import path from 'node:path';
import { stylePackFixture } from './style-pack-fixture.mjs';

/** Exercise the same real manager and HTTP routes in browser and packaged Electron. */
export async function checkStyleDeletion({ page, base, dir, checks }) {
  await page.goto(base);
  await page.waitForFunction(() => !!sessionStorage.getItem('riftcast-seat-token'));
  const existingToken = await page.evaluate(() => sessionStorage.getItem('riftcast-seat-token'));
  const seat = await (await fetch(base + '/api/control/seat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-seat-token': existingToken }, body: JSON.stringify({ role: 'director' }) })).json();
  assert.equal(seat.owner, true, 'Deletion runner must reuse the active director seat');
  await page.evaluate(token => sessionStorage.setItem('riftcast-seat-token', token), seat.token);
  await page.reload();
  await page.getByRole('button', { name: '风格包', exact: true }).click({ timeout: 30000 });
  const dialog = page.getByRole('dialog'), remove = dialog.getByRole('button', { name: '删除风格包', exact: true });
  await dialog.locator('.style-pack-choice').nth(4).waitFor();
  await dialog.locator('.style-pack-choice').filter({ hasText: '冰川极光' }).click();
  assert.equal(await remove.isDisabled(), true);
  const input = await stylePackFixture();
  await dialog.locator('input[type=file]').setInputFiles({ name: 'deletion.zip', mimeType: 'application/zip', buffer: input });
  const imported = dialog.locator('.style-pack-choice').filter({ hasText: '验证用赛事风格' });
  await imported.waitFor(); await imported.click();
  const list = await (await fetch(base + '/api/style-packs')).json();
  const ref = list.packs.find(p => p.id === 'verification-cup'); assert.ok(ref);
  const endpoint = `${base}/api/style-packs/${ref.id}/${ref.revision}`;
  const before = await (await fetch(base + '/api/state')).json();
  const stage = dialog.getByRole('button', { name: '准备到预监', exact: true });
  if (!before.overlay.stylePack || before.overlay.stylePack.id !== ref.id) await stage.click();
  await page.waitForFunction(() => document.querySelector('.style-pack-delete')?.textContent.includes('待播配置正在使用'));
  assert.equal(await remove.isDisabled(), true);
  assert.equal((await fetch(endpoint, { method: 'DELETE', headers: { 'x-seat-token': seat.token } })).status, 409);
  await dialog.locator('.style-pack-choice').filter({ hasText: '冰川极光' }).click();
  await stage.click();
  await imported.click();
  await remove.click();
  await dialog.getByRole('button', { name: '取消删除', exact: true }).click();
  assert.equal((await fetch(endpoint, { cache: 'no-store' })).status, 200);
  const readonly = await (await fetch(base + '/api/control/seat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'readonly', fresh: true }) })).json();
  assert.equal((await fetch(endpoint, { method: 'DELETE', headers: { 'x-seat-token': readonly.token } })).status, 400);
  await remove.click();
  await page.screenshot({ path: path.join(dir, 'delete-confirmation.png') });
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await imported.waitFor({ state: 'detached' });
  assert.equal((await fetch(endpoint, { cache: 'no-store' })).status, 404);
  assert.equal((await fetch(endpoint + '/assets/ink', { cache: 'no-store' })).status, 404);
  const after = await (await fetch(base + '/api/state')).json();
  assert.deepEqual(after.gameResults, before.gameResults); assert.deepEqual(after.customScenes, before.customScenes);
  assert.deepEqual(after.production.program, before.production.program);
  checks.push('UI default/preview protection, server 409, readonly denial, cancel and confirmed imported deletion; match archive, custom scenes and program preserved');
  // Restore the exact content, then delete again to verify restart persistence.
  await dialog.locator('input[type=file]').setInputFiles({ name: 'restore.zip', mimeType: 'application/zip', buffer: input });
  await imported.waitFor(); await imported.click();
  assert.equal((await (await fetch(base + '/api/style-packs')).json()).packs.find(p => p.id === ref.id).revision, ref.revision);
  await remove.click(); await dialog.getByRole('button', { name: '确认删除', exact: true }).click(); await imported.waitFor({ state: 'detached' });
  const builtin = list.packs.find(p => p.builtin && p.id === 'regalia'); assert.ok(builtin);
  const builtinEndpoint = `${base}/api/style-packs/${builtin.id}/${builtin.revision}`;
  const archive = Buffer.from(await (await fetch(builtinEndpoint + '/export')).arrayBuffer());
  const builtinChoice = dialog.locator('.style-pack-choice').filter({ hasText: builtin.name });
  await builtinChoice.click(); await remove.click();
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click(); await builtinChoice.waitFor({ state: 'detached' });
  assert.equal((await fetch(builtinEndpoint, { cache: 'no-store' })).status, 404);
  await page.screenshot({ path: path.join(dir, 'deleted-manager.png') });
  checks.push('exact original custom ZIP reimport restores its revision; nondefault built-in can also be deleted');
  return { ref, builtin, archive };
}

export async function checkDeletedAfterRestart(base, removed, checks, page) {
  const list = await (await fetch(base + '/api/style-packs')).json(); assert.equal(list.packs.length, 4);
  for (const ref of [removed.ref, removed.builtin]) {
    assert.equal(list.packs.some(p => p.id === ref.id && p.revision === ref.revision), false);
    assert.equal((await fetch(`${base}/api/style-packs/${ref.id}/${ref.revision}`, { cache: 'no-store' })).status, 404);
  }
  if (page) await page.waitForFunction(() => !!sessionStorage.getItem('riftcast-seat-token'));
  const existingToken = page && await page.evaluate(() => sessionStorage.getItem('riftcast-seat-token'));
  const seat = await (await fetch(base + '/api/control/seat', { method: 'POST', headers: { 'content-type': 'application/json', ...(existingToken ? { 'x-seat-token': existingToken } : {}) }, body: JSON.stringify({ role: 'director' }) })).json();
  assert.equal(seat.owner, true);
  const body = new FormData(); body.append('file', new Blob([removed.archive]), 'restore-builtin.zip');
  const response = await fetch(base + '/api/style-packs/import', { method: 'POST', headers: { 'x-seat-token': seat.token }, body });
  assert.equal(response.status, 201); assert.equal((await response.json()).revision, removed.builtin.revision);
  assert.equal((await (await fetch(base + '/api/style-packs')).json()).packs.length, 5);
  checks.push('process restart keeps both custom and builtin deleted; original built-in ZIP restores availability');
}
