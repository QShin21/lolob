import test from 'node:test';
import { syntheticStyleArchive } from './style-pack-fixture';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { StylePackStore, builtinStyleArchive, validateStyleManifest } from './style-packs';
import { readStyleZip, writeStyleZip } from './style-pack-zip';
import { BUILTIN_STYLE_REF, BUILTIN_RUNTIME_STYLES, STYLE_SCENES, validStyleRef } from '../shared/style-packs';
import { applyAction, createSeed, normalizeSavedState } from './state';
import { programState, takeProgram } from '../shared/production';
import { ControlSeats } from './control-seats';

async function fixture(change: (manifest: any, files: Record<string, Buffer>) => void = () => {}) {
  const files = Object.fromEntries(await readStyleZip(await syntheticStyleArchive()));
  const manifest = JSON.parse(files['manifest.json'].toString());
  manifest.id = 'test-cup'; manifest.name = '测试赛事'; manifest.palette.ink = '#230f45';
  change(manifest, files); files['manifest.json'] = Buffer.from(JSON.stringify(manifest));
  return writeStyleZip(files);
}
async function store(t: any) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'riftcast-styles-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new StylePackStore(dir); await store.initialize(); return store;
}

test('built-in pack covers all 11 scenes and round-trips without replacing the original', async t => {
  const s = await store(t), zip = builtinStyleArchive(), files = await readStyleZip(zip);
  const m = validateStyleManifest(JSON.parse(files.get('manifest.json')!.toString()));
  assert.deepEqual(Object.keys(m.scenes), [...STYLE_SCENES]);
  assert.equal(m.name, '冰川极光'); assert.equal(m.scenes.teamfight.frame, null);
  assert.equal((await s.import(zip)).revision, BUILTIN_STYLE_REF.revision);
  for (const pack of BUILTIN_RUNTIME_STYLES) {
    const ref = await s.import(builtinStyleArchive(pack));
    assert.equal(ref.builtin, true); assert.equal(ref.revision, pack.revision);
  }
  assert.equal(s.list().some(p => p.id === 'jianlou'), false);
  assert.equal(s.list().length, 5); assert.equal((await s.export(BUILTIN_STYLE_REF)).equals(zip), true);
});
test('import, duplicate import, export and restart retain immutable identity and raster assets', async t => {
  const s = await store(t), zip = await fixture(), ref = await s.import(zip);
  assert.equal(ref.name, '测试赛事'); assert.equal(ref.revision.length, 64);
  const runtime = s.get(ref); assert.equal(runtime.palette.ink, '#230f45');
  assert.match(runtime.assets.ink, /^\/api\/style-packs\/test-cup\/[a-f0-9]{64}\/assets\/ink$/);
  assert.equal((await s.import(zip)).revision, ref.revision); assert.equal(s.list().length, 6);
  const exported = await s.export(ref); assert.equal((await s.import(exported)).revision, ref.revision);
  const restarted = new StylePackStore(s.directory); await restarted.initialize();
  assert.equal(restarted.list().length, 6); assert.deepEqual(restarted.get(ref), runtime);
  assert.equal((await sharp(await restarted.asset(ref, 'ink')).metadata()).format, 'png');
});
test('new revision with the same id and version cannot overwrite the on-air old revision', async t => {
  const s = await store(t), a = await s.import(await fixture()), b = await s.import(await fixture(m => { m.palette.ink = '#dddddd'; }));
  assert.notEqual(a.revision, b.revision); assert.equal(s.get(a).palette.ink, '#230f45'); assert.equal(s.get(b).palette.ink, '#dddddd');
});
test('staging respects TAKE and undo snapshots; data and custom scenes are unaffected', async t => {
  const s = await store(t), ref = await s.import(await fixture());
  const seed = createSeed(), next = applyAction(seed, { type: 'set-style-pack', id: ref.id, revision: ref.revision }, ref);
  assert.equal(programState(next).overlay.stylePack?.id, 'glacier-aurora'); assert.equal(next.overlay.stylePack?.id, ref.id);
  assert.deepEqual(next.players, seed.players); assert.deepEqual(next.draft, seed.draft); assert.deepEqual(next.match, seed.match); assert.deepEqual(next.customScenes, seed.customScenes);
  assert.equal(next.production!.configVersion, seed.production!.configVersion + 1);
  takeProgram(next); assert.equal(programState(next).overlay.stylePack?.revision, ref.revision);
  assert.equal(next.production!.previousProgram!.content.overlay.stylePack?.id, 'glacier-aurora');
  const reload = normalizeSavedState(JSON.parse(JSON.stringify(next))); assert.equal(reload.overlay.stylePack?.revision, ref.revision);
});
test('legacy and malformed references fall back without trusting executable configuration', () => {
  const seed = createSeed(); delete seed.overlay.stylePack;
  assert.equal(normalizeSavedState(seed).overlay.stylePack?.id, 'glacier-aurora');
  assert.equal(validStyleRef({ id: '../x', revision: 'a'.repeat(64), name: 'x' }), false);
  assert.throws(() => applyAction(seed, { type: 'set-style-pack', id: 'missing', revision: 'a'.repeat(64) }), /导入/);
});
test('only the current director may stage styles or import through engine-authorized routes', () => {
  const seats = new ControlSeats(), main = seats.issue({ role: 'director' }, true), other = seats.issue({ role: 'director', fresh: true }, true);
  assert.equal(seats.authorize(main.token, 'set-style-pack').role, 'director');
  assert.throws(() => seats.authorize(other.token, 'set-style-pack'));
  for (const role of ['data', 'subtitle', 'readonly', 'replay']) { const seat = seats.issue({ role, fresh: true }, true); assert.throws(() => seats.authorize(seat.token, 'set-style-pack')); assert.throws(() => seats.authorize(seat.token, 'engine')); }
});
test('reject manifest schema errors, unsafe colors, unknown slots, external URLs and native HUD coverage', async t => {
  const s = await store(t);
  for (const change of [
    (m: any) => { m.schemaVersion = 2; }, (m: any) => { delete m.scenes.live; },
    (m: any) => { m.palette.ink = 'url(https://example.com/x)'; },
    (m: any) => { m.css = 'body{display:none}'; }, (m: any) => { m.fonts.body = 'https://example.com/font'; },
    (m: any) => { m.assets.ink = '../escape.png'; }, (m: any) => { m.scenes.live.background = 'ink'; },
    (m: any) => { m.scenes.teamfight.frame = 'ink'; }, (m: any) => { m.scenes.standby.frame = 'absent'; },
    (m: any) => { m.textures.mystery = 'ink'; }, (m: any) => { m.id = 'jianlou'; },
  ]) await assert.rejects(s.import(await fixture(change)));
  assert.equal(s.list().length, 5); assert.deepEqual(await readdir(s.directory), []);
});
test('reject ZIP traversal, duplicate paths, CRC damage, undeclared files and missing assets', async t => {
  const s = await store(t);
  await assert.rejects(s.import(writeStyleZip({ '../evil.png': Buffer.from('x') })), /路径/);
  await assert.rejects(s.import(writeStyleZip({ 'manifest.json': Buffer.from('{}'), 'MANIFEST.JSON': Buffer.from('{}') })), /重复/);
  const bad = await fixture(); bad[30 + bad.readUInt16LE(26) + bad.readUInt16LE(28)] ^= 1; await assert.rejects(s.import(bad));
  await assert.rejects(s.import(await fixture((_, files) => { delete files['assets.ink']; delete files['assets/ink.png']; })), /缺少/);
  await assert.rejects(s.import(await fixture((_, files) => { files['assets/extra.png'] = files['assets/ink.png']; })), /未声明/);
});
test('reject fake raster/SVG and extreme dimensions without installing anything', async t => {
  const s = await store(t);
  await assert.rejects(s.import(await fixture((_, files) => { files['assets/ink.png'] = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'); })), /格式/);
  const giant = await sharp({ create: { width: 4097, height: 1, channels: 4, background: '#0000' } }).png().toBuffer();
  await assert.rejects(s.import(await fixture((_, files) => { files['assets/ink.png'] = giant; })), /尺寸/);
  assert.equal(s.list().length, 5);
});
test('a damaged installed pack is not restored and its verified original can repair it', async t => {
  const s = await store(t), zip = await fixture(), ref = await s.import(zip);
  await writeFile(path.join(s.directory, `${ref.id}--${ref.revision}`, 'assets/ink.png'), 'corrupt');
  await assert.rejects(s.asset(ref, 'ink'), /损坏/);
  const restarted = new StylePackStore(s.directory); await restarted.initialize();
  assert.equal(restarted.list().length, 5); assert.equal(restarted.warnings.length, 1);
  await assert.rejects(restarted.export(ref));
  assert.equal((await restarted.import(zip)).revision, ref.revision); assert.equal(restarted.get(ref).id, ref.id);
});


test('1.0.0 migrates retired style on both buses and undo without changing match data', () => {
  const seed = createSeed();
  const old = { id: 'jianlou', revision: 'builtin-v1', name: '简陋包' };
  seed.overlay.stylePack = { ...old }; takeProgram(seed);
  seed.overlay.stylePack = { ...old }; takeProgram(seed);
  const before = JSON.parse(JSON.stringify(seed));
  const result = normalizeSavedState(before);
  assert.deepEqual(result.overlay.stylePack, BUILTIN_STYLE_REF);
  assert.deepEqual(result.production!.program!.overlay.stylePack, BUILTIN_STYLE_REF);
  assert.deepEqual(result.production!.previousProgram!.content.overlay.stylePack, BUILTIN_STYLE_REF);
  assert.deepEqual(result.players, seed.players); assert.deepEqual(result.draft, seed.draft);
  assert.deepEqual(result.match, seed.match); assert.deepEqual(result.gameResults, seed.gameResults);
  assert.equal(before.overlay.stylePack.id, 'jianlou');
});
test('1.0.0 preserves custom revisions and canonicalizes built-in names independently', async t => {
  const s = await store(t), custom = await s.import(await fixture());
  const seed = createSeed(); seed.overlay.stylePack = custom; takeProgram(seed);
  seed.overlay.stylePack = { ...BUILTIN_STYLE_REF, name: 'stale name' };
  const result = normalizeSavedState(JSON.parse(JSON.stringify(seed)));
  assert.equal(result.overlay.stylePack?.name, '冰川极光');
  assert.equal(result.production!.program!.overlay.stylePack?.id, custom.id);
  assert.equal(result.production!.previousProgram!.content.overlay.stylePack?.id, BUILTIN_STYLE_REF.id);
});
test('edited artwork with a shipped id becomes a separate immutable revision', async t => {
  const s = await store(t), files = Object.fromEntries(await readStyleZip(builtinStyleArchive()));
  const manifest = JSON.parse(files['manifest.json'].toString()); manifest.name = '冰川派生';
  files['manifest.json'] = Buffer.from(JSON.stringify(manifest));
  const ref = await s.import(writeStyleZip(files));
  assert.equal(ref.builtin, false); assert.notEqual(ref.revision, BUILTIN_STYLE_REF.revision);
  assert.equal(s.get(BUILTIN_STYLE_REF).name, '冰川极光'); assert.equal(s.list().length, 6);
});
