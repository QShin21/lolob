import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { normalizedSkinId, skinCatalog, resolveSkin } from '../shared/champion-skins';
import { normalizeLive } from './adapters';
import { finalizeGame } from './game-results';
import { normalizeSavedState, publicState, resetRuntimeState } from './state';
import { emptyFixture } from './test-support/fixture';
import { ResourceCache, resourceUrl } from './resource-cache';

const data = (skinID?: unknown) => ({ gameData: { gameTime: 900, gameId: 321 }, allPlayers: [{ team: 'ORDER', riotId: 'SkinPlayer', rawChampionName: 'game_character_displayname_Ahri', skinID, level: 10, totalGold: 5000, scores: { kills: 2, deaths: 1, assists: 3, creepScore: 100 } }], events: { Events: [] } });
const catalog = skinCatalog({ data: { Ahri: { id: 'Ahri', skins: [{ num: 0, name: 'default' }, { num: 2, name: '测试皮肤' }, { num: 7, name: '测试炫彩', parentSkin: 2 }] } } }, 'Ahri');
test('Live Client skin IDs preserve zero and explicit nonzero IDs, rejecting absent or malformed inputs', () => {
  for (const id of [0, 2, 1000]) assert.equal(normalizeLive(data(id), []).players[0].skinId, id);
  for (const id of [undefined, null, -1, 1.5, '2', NaN, 100001]) { assert.equal(normalizedSkinId(id), undefined); assert.equal(normalizeLive(data(id), []).players[0].skinId, undefined); }
});
test('skin IDs survive accepted archive, recording, saved state and frozen postgame reload', () => {
  let state = emptyFixture(); Object.assign(state, normalizeLive(data(7), []), { phase: 'live', activeSourceGameId: '321' });
  const result = finalizeGame(state, { source: 'live', sourceGameId: '321' })!; assert(result); assert.equal(result.snapshot.players[0].skinId, 7); assert.equal(state.recordings[0].players[0].skinId, 7);
  state = normalizeSavedState(JSON.parse(JSON.stringify(publicState(state)))); resetRuntimeState(state); assert.equal(state.players[0].skinId, 7); assert.equal(state.gameResults![0].snapshot.players[0].skinId, 7);
});
test('catalog mapping is exact and follows explicit chroma parents without guessing default skins', () => {
  assert.equal(resolveSkin(catalog, 'Ahri', '阿狸', 0)?.name, '阿狸 · 原生皮肤');
  const chroma = resolveSkin(catalog, 'Ahri', '阿狸', 7)!; assert.equal(chroma.name, '测试炫彩'); assert.equal(chroma.artNum, 2); assert.equal(chroma.chroma, true); assert.match(decodeURIComponent(chroma.image), /Ahri_2\.jpg$/);
  assert.equal(resolveSkin(catalog, 'Ahri', '阿狸', 1), undefined); assert.equal(resolveSkin(catalog, 'Ahri', '阿狸', undefined), undefined);
  assert.equal(resolveSkin([{ num: 1, name: 'a', parentSkin: 2 }, { num: 2, name: 'b', parentSkin: 1 }], 'Ahri', '阿狸', 1), undefined);
  assert.equal(resolveSkin([{ num: 1, name: 'a', parentSkin: 9 }], 'Ahri', '阿狸', 1), undefined);
  assert.deepEqual(skinCatalog({ data: { Ahri: { id: 'Vi', skins: [{ num: 0, name: 'default' }] } } }, 'Ahri'), []);
  assert.deepEqual(skinCatalog({ data: { Ahri: { id: 'Ahri', skins: [{ num: 0, name: 'default' }, { num: 0, name: 'duplicate' }] } } }, 'Ahri'), []);
});
test('skin resource paths accept only exact Riot splash URLs and reject unrelated endpoints or credentials', () => {
  assert.equal(resourceUrl('https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_2.jpg').pathname, '/cdn/img/champion/splash/Ahri_2.jpg');
  for (const url of ['https://example.com/cdn/img/champion/splash/Ahri_2.jpg', 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/../../secret.jpg', 'https://ddragon.leagueoflegends.com/cdn/img/champion/loading/Ahri_2.jpg', 'https://user:secret@ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_2.jpg', 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_2.jpg?url=x']) assert.throws(() => resourceUrl(url));
});
test('valid JPEG skins cache for offline reuse while malformed and PNG-disguised JPEG responses stay uncached', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'rift-skins-')), url = 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_2.jpg';
  let calls = 0; const jpg = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#dcaa77' } }).jpeg().toBuffer();
  const cache = new ResourceCache(dir, { fetch: (async () => { calls++; return new Response(new Uint8Array(jpg)); }) as typeof fetch });
  try { const result = await cache.read(url); assert.equal(result.type, 'image/jpeg'); assert.deepEqual((await cache.read(url, true)).bytes, jpg); assert.equal(calls, 1);
    for (const [id, bytes] of [[3, Buffer.from('not-an-image')], [4, await sharp(jpg).png().toBuffer()]] as const) {
      const bad = new ResourceCache(dir, { fetch: (async () => new Response(new Uint8Array(bytes))) as typeof fetch }); await assert.rejects(bad.read(url.replace('_2.jpg', `_${id}.jpg`)));
    }
    assert.equal((await readdir(dir)).filter(f => !f.endsWith('.meta.json')).length, 1);
    assert.equal((await cache.cleanup([], true)).files, 0, 'shared unversioned splash assets are retained');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
