// Test-only adapter injection. The generated preload and fixtures live under an isolated OS temp directory.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const syntheticBoundary = 'Actual isolated HTTP service with a labelled synthetic Adapters transport and explicit fixture data. OBS acknowledgements are synthetic; real OBS, Riot game, devices, streaming and operator data are outside this check.';

function isolatedPath(value) {
  const absolute = path.resolve(value), relative = path.relative(path.resolve(tmpdir()), absolute);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && relative.split(path.sep)[0].startsWith('riftcast-'),
    'Synthetic adapters require a riftcast-* directory inside the OS temp directory');
  return absolute;
}

export async function createSyntheticAdaptersHook({ root, work, dataDir = work, fixture, initialObsConnected = false }) {
  work = isolatedPath(work); dataDir = isolatedPath(dataDir);
  const nonce = randomUUID(), hook = path.join(work, 'synthetic-adapters-' + nonce + '.mjs');
  const auditFile = path.join(work, 'synthetic-adapters-' + nonce + '.jsonl');
  const fixtureFile = fixture ? path.join(work, 'synthetic-input-' + nonce + '.json') : undefined;
  if (fixtureFile) await writeFile(fixtureFile, JSON.stringify(fixture));
  const source = `import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { Adapters } from ${JSON.stringify(pathToFileURL(path.join(root, 'server/adapters.ts')).href)};
import { validateTransition } from ${JSON.stringify(pathToFileURL(path.join(root, 'shared/broadcast-transitions.ts')).href)};
assert.equal(process.env.RIFTCAST_SYNTHETIC_ADAPTERS, ${JSON.stringify(nonce)});
assert.equal(path.resolve(process.env.RIFTCAST_DATA_DIR || ''), ${JSON.stringify(dataDir)});
for (const [key, value] of Object.entries({RIFTCAST_OFFLINE:'1', RIFTCAST_AUTO_CONNECT:'0', RIFTCAST_OBS_AUTOSTART:'0', ENABLE_LAN:'0'})) assert.equal(process.env[key], value, key);
const fixtureFile = ${JSON.stringify(fixtureFile ?? null)};
const fixture = fixtureFile ? JSON.parse(await readFile(fixtureFile, 'utf8')) : undefined;
const label = 'SYNTHETIC TEST ONLY / 合成 OBS 回执 · 无真实设备';
const audit = event => appendFile(${JSON.stringify(auditFile)}, JSON.stringify({...event, at:new Date().toISOString()}) + '\\n');
const connected = self => self.get().connections.obs.status === 'connected';
const forbid = async method => { await audit({kind:'blocked-device-call', method}); throw Error(label + ': blocked ' + method); };
Adapters.prototype.initializeObsEngine = async function() {
  // Explicit runtime fixture restoration follows normal saved-state loading; saved programme/configuration remain intact.
  this.request = () => Promise.reject(Error(label + ': local game transport blocked'));
  this.commit(s => {
    if (fixture) {
      for (const key of ['players','stats','events','economy','draft','gameTime','phase','mode','selectedPlayerId'])
        if (fixture[key] !== undefined) s[key] = structuredClone(fixture[key]);
      for (const target of ['live','lcu','replay'])
        if (fixture.connections?.[target]) s.connections[target] = {...structuredClone(fixture.connections[target]), detail:label + ' / fixture ' + target};
    }
    s.paused = true;
    s.overlay.nativeHud = 'off';
    if (s.production?.program) s.production.program.overlay.nativeHud = 'off';
    s.connections.obs = {status:${JSON.stringify(initialObsConnected ? 'connected' : 'disconnected')}, detail:label};
  });
  await audit({kind:'initialize', connected:connected(this), runtimeFixture:!!fixture});
};
Adapters.prototype.connect = async function(target) {
  if (target !== 'obs') return forbid('connect:' + target);
  this.commit(s => { s.connections.obs = {status:'connected', detail:label, updatedAt:new Date().toISOString()}; });
  await audit({kind:'connect', target:'obs', synthetic:true});
};
Adapters.prototype.productionApply = async function() {
  assert.ok(connected(this), 'Synthetic OBS must be explicitly connected');
  await audit({kind:'apply', synthetic:true});
};
Adapters.prototype.productionTransition = async function(config, candidate, publish) {
  validateTransition(config);
  assert.ok(connected(this), 'Synthetic OBS must be explicitly connected');
  assert.ok(!candidate.production?.playingClipId, 'Finish replay clip before TAKE');
  const startedAt = new Date().toISOString();
  await publish();
  const receipt = {id:randomUUID(), kind:config.kind, status:'applied', published:true, startedAt,
    endedAt:new Date().toISOString(), targetScene:candidate.programScene, detail:label};
  await audit({kind:'transition', receipt});
  return receipt;
};
Adapters.prototype.poll = async function() {};
Adapters.prototype.productionTick = async function() {};
Adapters.prototype.syncPlayerFeeds = async function() { return {applied:false, detail:label}; };
Adapters.prototype.obsEngineStatus = async function() {
  return {mode:'external', available:false, running:false, connected:connected(this), version:'SYNTHETIC', error:label,
    streamActive:false, recordActive:false, virtualCamActive:false, destination:'generic', inputs:[],
    selection:{gameWindow:'', desktopDevice:'', micDevice:'', micEnabled:false},
    capabilities:{gameWindows:[], audioOutputs:[], audioInputs:[]}};
};
Adapters.prototype.productionStatus = async function() { return {audio:[], disk:{detail:label}, bufferActive:false, music:{available:false}, audioManaged:false}; };
Adapters.prototype.obsCameraDevices = async function() { return {devices:[], detail:label}; };
Adapters.prototype.obsScenes = async function() { return {scenes:[], currentProgramSceneName:'SYNTHETIC'}; };
Adapters.prototype.customSourceChoices = async function() { return {windows:[], displays:[], devices:[], detail:label}; };
for (const method of ['spectatorFrame','replayDirector','controlReplayDirector','replayDiagnostics','replay',
  'obsScene','obsStreamStatus','obsStreamSettings','obsHud','obsEngineStart','obsEngineMode','obsEngineDestination',
  'obsEngineInstallVirtualCamera','obsEngineSetup','obsEnginePrepareCompanion','obsMusicImport','obsMusicControl',
  'obsEnginePreview','obsEngineMonitor','obsEngineLiveFrame','obsEngineOutput','productionControl'])
  Adapters.prototype[method] = async function() { return forbid(method); };
`;
  await writeFile(hook, source);
  return { hook, importArgs: ['--import', pathToFileURL(hook).href], env: { RIFTCAST_SYNTHETIC_ADAPTERS: nonce },
    auditFile, boundary: syntheticBoundary };
}
