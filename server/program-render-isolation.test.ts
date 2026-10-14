import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { applyAction, createSeed, fallbackChampions, scenes } from './state';
import { captureProgram, programState } from '../shared/production';
import { frozenGameState } from '../shared/game-results';
import type { BroadcastState, Scene } from '../shared/types';

test('all programme renderers consume held identities, including focus-player reports with a newer archive', async () => {
  // SSR executes the actual scene components; effects cannot fetch assets, open
  // devices or start a service. This protects content, not browser geometry/OBS.
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { BroadcastCanvas } = await vite.ssrLoadModule('/src/components/BroadcastCanvas.tsx');
    const champions = fallbackChampions();
    const render = (state: BroadcastState, scene: Scene, bus: 'program' | 'preview' = 'program') =>
      renderToStaticMarkup(createElement(BroadcastCanvas, { state, scene, champions, output: true, bus }));
    let s = createSeed();
    s.phase = 'draft'; s.paused = true; s.overlay.nativeHud = 'off'; s.production!.rules.mode = 'standard';
    s.programScene = s.previewScene = 'lineup'; s.production!.program = captureProgram(s);
    s.draft.bluePicks[0] = 'Gwen'; Object.assign(s.players[0], { championId: 'Gwen', championName: '灵罗娃娃' });
    const visible = structuredClone(programState(s));
    s = applyAction(s, { type: 'set-draft', patch: { bluePicks: ['Akali', ...s.draft.bluePicks.slice(1)] } });
    const client = structuredClone(s.production!.program!.telemetry.players);
    Object.assign(client[0], { name: '尚未切入的替换选手', role: '辅助', team: 'red', championId: 'Aatrox', championName: '暗裔剑魔' });
    s.production!.clientDraft = { draft: structuredClone(s.production!.program!.draft), players: client, at: new Date().toISOString() };
    s = applyAction(s, { type: 'production', command: { op: 'draft-mode', mode: 'auto', resolution: 'client' } });
    for (const scene of scenes) {
      assert.equal(render(programState(s), scene), render(visible, scene), `${scene}: no staged hero/name/side/lane may enter the programme renderer`);
    }
    assert.match(render(programState(s), 'lineup'), /灵罗娃娃/);
    assert.doesNotMatch(render(programState(s), 'lineup'), /尚未切入的替换选手/);

    // The final archive can arrive while an editorial source change awaits TAKE.
    // Programme focus must not bypass programState by independently re-freezing it.
    s.selectedPlayerId = s.players[0].id;
    s.production!.program!.selectedPlayerId = s.selectedPlayerId;
    s = applyAction(s, { type: 'finalize-game', winner: 'blue' });
    const view = programState(s);
    assert.equal(view.players[0].championId, 'Gwen');
    assert.equal(frozenGameState(s).players[0].championId, 'Aatrox');
    const programme = render(view, 'ranking');
    assert.match(programme, /灵罗娃娃/);
    assert.doesNotMatch(programme, /尚未切入的替换选手|暗裔剑魔/);
    assert.match(render(s, 'ranking', 'preview'), /尚未切入的替换选手/, 'preview and archive consumers still see their selected final record');
  } finally { await vite.close(); }
});
