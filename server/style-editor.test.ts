import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { StylePackStore } from './style-packs';
import { syntheticStyleArchive } from './style-pack-fixture';
import { BUILTIN_STYLE_REF } from '../shared/style-packs';
import { APPEARANCE_TARGETS, TEXT_APPEARANCE_TARGETS, commitEditorHistory, stepEditorHistory, snapAppearanceRect, resolveStyleText, validateStyleText, type EditorHistory } from '../shared/style-appearance';
import Ajv2020 from 'ajv/dist/2020.js';
import { readStyleZip } from './style-pack-zip';
import { createFixture } from './test-support/fixture';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StyleText, StyleTextProvider } from '../src/components/StyleText';

async function store(t: any) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'riftcast-style-editor-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new StylePackStore(dir); await store.initialize(); return store;
}
test('visual editing retains the original version and persists appearance and position in a new fingerprint', async t => {
  const s = await store(t), original = await s.import(await syntheticStyleArchive()), before = structuredClone(s.get(original));
  const next = await s.derive(original, { name: '编辑后的赛事', appearance: { liveName: { color: '#112233', x: 40, y: -25, scale: 1.2, opacity: .8 } } });
  assert.equal(next.id, original.id); assert.notEqual(next.revision, original.revision);
  assert.deepEqual(s.get(original), before);
  assert.deepEqual(s.get(next).appearance?.liveName, { color: '#112233', x: 40, y: -25, scale: 1.2, opacity: .8 });
  const restarted = new StylePackStore(s.directory); await restarted.initialize();
  assert.deepEqual(restarted.get(next), s.get(next));
  assert.deepEqual(await s.asset(next, 'ink'), await s.asset(original, 'ink'));
});
test('editing a builtin creates a custom pack and leaves its original fingerprint intact', async t => {
  const s = await store(t), before = structuredClone(s.get(BUILTIN_STYLE_REF));
  const next = await s.derive(BUILTIN_STYLE_REF, { name: '内置风格的编辑副本', appearance: { lineupName: { x: 12 } } });
  assert.equal(next.builtin, false); assert.notEqual(next.id, BUILTIN_STYLE_REF.id);
  assert.deepEqual(s.get(BUILTIN_STYLE_REF), before);
});
test('style editor rejects arbitrary asset paths, script properties and invalid geometry', async t => {
  const s = await store(t), ref = await s.import(await syntheticStyleArchive());
  for (const change of [{ assets: { ink: '/etc/passwd' } }, { appearance: { liveName: { html: '<script>x</script>' } } }, { appearance: { liveName: { x: 1921 } } }, { appearance: { liveName: { scale: 0 } } }, { appearance: { liveName: { opacity: 2 } } }, { appearance: { liveName: { color: 'url(https://example.com)' } } }]) await assert.rejects(s.derive(ref, change));
  assert.equal(s.get(ref).revision, ref.revision);
});

test('continuous edit history groups a drag, supports multi-step redo and discards a branched future', () => {
  let h: EditorHistory<{ x: number; color: string }> = { past: [], present: { x: 0, color: 'red' }, future: [] };
  for (const x of [5, 10, 25]) h = commitEditorHistory(h, { ...h.present, x }, 'drag:one');
  h = commitEditorHistory(h, { ...h.present, color: 'blue' }, 'field:two');
  assert.equal(h.past.length, 2);
  h = stepEditorHistory(h, 'undo'); assert.deepEqual(h.present, { x: 25, color: 'red' });
  h = stepEditorHistory(h, 'undo'); assert.deepEqual(h.present, { x: 0, color: 'red' });
  h = stepEditorHistory(stepEditorHistory(h, 'redo'), 'redo'); assert.deepEqual(h.present, { x: 25, color: 'blue' });
  h = stepEditorHistory(h, 'undo'); h = commitEditorHistory(h, { x: 40, color: 'red' });
  assert.equal(h.future.length, 0); assert.equal(stepEditorHistory(h, 'redo'), h);
  for (let x = 100; x < 250; x++) h = commitEditorHistory(h, { ...h.present, x });
  assert.equal(h.past.length, 100);
});

test('dragging snaps to nearest peer edges and canvas centre within screen-adjusted tolerance', () => {
  const rect = { left: 100, top: 100, width: 100, height: 40 };
  const snapped = snapAppearanceRect(rect, 4, 5, [{ left: 207, top: 153, width: 100, height: 50 }], 8);
  assert.equal(snapped.dx, 7); assert.equal(snapped.dy, 13); assert.deepEqual(snapped.guides, { x: 207, y: 153 });
  const centre = snapAppearanceRect({ left: 900, top: 500, width: 100, height: 60 }, 8, 9, [], 4);
  assert.equal(centre.dx, 10); assert.equal(centre.dy, 10); assert.deepEqual(centre.guides, { x: 960, y: 540 });
  const free = snapAppearanceRect(rect, 30, 30, [], 6); assert.equal(free.dx, 30); assert.equal(free.dy, 30); assert.deepEqual(free.guides, { x: undefined, y: undefined });
});

test('safe dynamic text resolves per-player team context and retains literal HTML as text', () => {
  const state = createFixture(); state.selectedPlayerId = state.players[1].id;
  const template = '{{matchTitle}} · {{teamName}} {{playerName}} · G{{game}}';
  assert.equal(resolveStyleText(template, state, { player: state.players[0] }), `${state.match.title} · 苍穹竞技 山岚 · G2`);
  assert.equal(resolveStyleText('{{playerName}}', state), state.players[1].name);
  assert.equal(resolveStyleText('{{playerName}}', state, { player: undefined }), '');
  state.players[0].name = '<img src=x onerror=alert(1)>';
  const html = renderToStaticMarkup(createElement(StyleTextProvider, { value: { state, appearance: { liveName: { text: '{{playerName}}' } } } }, createElement(StyleText, { target: 'liveName', context: { player: state.players[0] }, children: 'fallback' })));
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img/);
  for (const unsafe of ['{{settings.obsPassword}}', '{{constructor}}', '{{playerName.toUpperCase()}}', '{{playerName}', 'x'.repeat(241)]) assert.throws(() => validateStyleText(unsafe));
});

test('dynamic text persists in a new style revision and rejects unimplemented text targets', async t => {
  const s = await store(t), ref = await s.import(await syntheticStyleArchive());
  const next = await s.derive(ref, { appearance: { liveName: { text: '{{teamTag}} · {{playerName}}' } } });
  assert.equal(s.get(next).appearance?.liveName?.text, '{{teamTag}} · {{playerName}}');
  const restarted = new StylePackStore(s.directory); await restarted.initialize(); assert.equal(restarted.get(next).appearance?.liveName?.text, '{{teamTag}} · {{playerName}}');
  for (const appearance of [{ liveName: { text: '{{process.env}}' } }, { analysisPanel: { text: 'unimplemented' } }]) await assert.rejects(s.derive(ref, { appearance }));
});

test('published JSON schema accepts editor exports and rejects unsafe text targets and out-of-range geometry', async t => {
  const schema = JSON.parse(await readFile(new URL('../docs/style-pack-v1.schema.json', import.meta.url), 'utf8'));
  const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
  const s = await store(t), ref = await s.import(await syntheticStyleArchive());
  const appearance = Object.fromEntries(Object.keys(APPEARANCE_TARGETS).map(target => [target, { x: 24, y: -12, scale: 1.25, opacity: .7, ...((TEXT_APPEARANCE_TARGETS as readonly string[]).includes(target) ? { text: '{{matchTitle}} · {{teamName}} {{playerName}}' } : {}) }]));
  const scenes = structuredClone(s.get(ref).scenes);
  scenes.lineup.appearance = { lineupCaption: { text: '第 {{ game }} 局\n首发' }, lineupName: null };
  const next = await s.derive(ref, { appearance, scenes });
  const files = await readStyleZip(await s.export(next));
  const manifest = JSON.parse(files.get('manifest.json')!.toString('utf8'));
  assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
  for (const appearance of [{ liveName: { x: 1921 } }, { liveName: { y: -1081 } }, { liveName: { opacity: 2 } }, { liveName: { scale: .2 } }, { analysisPanel: { text: 'not supported' } }, { liveName: { text: '{{settings.obsPassword}}' } }, { liveName: { text: '{{{playerName}}}' } }, { liveName: { text: 'control\u0001' } }]) {
    assert.equal(validate({ ...manifest, appearance }), false, JSON.stringify(appearance));
    await assert.rejects(s.derive(ref, { appearance }));
  }
});

test('dynamic schedule and event context never borrows the active match or selected player identity',()=>{
 const state=createFixture(),scheduled=state.schedule[1];state.selectedPlayerId=state.players[0].id;
 const text=resolveStyleText('{{matchTitle}}|{{blueScore}}|{{matchStatus}}|{{playerName}}|{{game}}',state,{match:scheduled,player:undefined});
 assert.equal(text,`${scheduled.title}|0|待开赛||`);
 assert.equal(resolveStyleText('{{lane}} {{timer}} {{value}} {{label}}',state,{lane:'中路',timer:'03:20',value:'640',label:'伤害'}),'中路 03:20 640 伤害');
 assert.match(resolveStyleText('{{scheduledAt}}',state,{match:scheduled}),/2026/);
});
