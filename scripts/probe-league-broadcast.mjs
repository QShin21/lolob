import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import WebSocket from 'ws';

// Read-only local protocol probe. It never enables mocking or changes broadcast settings.
const seconds = Number(process.argv[2] ?? 30);
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 600) throw Error('Duration must be 1–600 seconds');
const destination = path.resolve(process.argv[3] ?? 'verification-output/release-1.1.2/league-broadcast/probe');
await fs.mkdir(destination, { recursive: true });
const records = [];
const report = { startedAt: new Date().toISOString(), endpoint: 'ws://127.0.0.1:58869/ws/in', connected: false,
  messageTypes: {}, snapshots: 0, api: {}, errors: [], samples: [] };
async function readApi(route) {
  try {
    const response = await fetch(`http://127.0.0.1:58869/api/${route}`, { signal: AbortSignal.timeout(3000) });
    return { status: response.status, body: await response.json() };
  } catch (error) { return { error: error.message }; }
}
function readGame() {
  return new Promise(resolve => {
    const req = https.get('https://127.0.0.1:2999/liveclientdata/allgamedata', { rejectUnauthorized: false, timeout: 2000 }, res => {
      let body = '';
      res.on('data', part => { body += part; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve({ gameTime: data.gameData?.gameTime, gameMode: data.gameData?.gameMode,
            spectator: !!data.activePlayer?.error && !data.activePlayer?.riotId && !data.activePlayer?.summonerName,
            players: data.allPlayers?.map(p => ({ champion: p.rawChampionName, team: p.team, level: p.level })) });
        } catch { resolve({ unavailable: true }); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ unavailable: true }));
  });
}
for (const route of ['ingame/status', 'ingame/mock', 'ingame/showing'])
  report.api[route] = await readApi(route);
let latest, status, receivedAt, lastSaved = 0, sampling = false;
const socket = new WebSocket(report.endpoint, { handshakeTimeout: 5000, maxPayload: 8 * 1024 * 1024 });
socket.on('open', () => { report.connected = true; console.log('League Broadcast WebSocket connected'); });
socket.on('error', error => { report.errors.push(error.message); });
socket.on('message', bytes => {
  const raw = bytes.toString();
  if (raw === 'KeepAlive') return;
  try {
    const message = JSON.parse(raw);
    report.messageTypes[message.type] = (report.messageTypes[message.type] ?? 0) + 1;
    if (message.type === 'gameStatus') status = { gameState: message.gameState, isTestingEnvironment: message.isTestingEnvironment };
    if (message.type !== 'ingame-state-update') return;
    latest = message.state;
    receivedAt = new Date().toISOString();
    report.snapshots++;
  } catch { report.errors.push('Invalid JSON message'); }
});
const interval = setInterval(async () => {
  if (sampling || !latest || Date.parse(receivedAt) <= lastSaved) return;
  sampling = true;
  try {
    lastSaved = Date.parse(receivedAt);
    const state = structuredClone(latest);
    const live = await readGame();
    const sample = { receivedAt, status, gameTime: state.gameTime, gameStatus: state.gameStatus,
      isTestingEnvironment: state.isTestingEnvironment, gameVersion: state.gameVersion, playbackSpeed: state.playbackSpeed,
      damageGraph: state.damageGraph, damageComposition: state.damageComposition,
      teamfightDamageOverview: state.teamfightDamageOverview, live };
    records.push(sample);
    report.samples.push({ receivedAt, gameTime: state.gameTime, gameStatus: state.gameStatus,
      isTestingEnvironment: state.isTestingEnvironment ?? status?.isTestingEnvironment,
      damagePlayers: state.damageGraph?.damageDealt?.length ?? 0,
      compositionPlayers: state.damageComposition?.teams?.reduce((n, t) => n + (t.players?.length ?? 0), 0) ?? 0,
      liveGameTime: live.gameTime, livePlayers: live.players?.length ?? 0 });
  } finally { sampling = false; }
}, 1000);
await new Promise(resolve => setTimeout(resolve, seconds * 1000));
clearInterval(interval);
socket.terminate();
while (sampling) await new Promise(resolve => setTimeout(resolve, 25));
report.finishedAt = new Date().toISOString();
report.lastStatus = status;
report.note = 'Protocol observations only. Verify non-mock identity, clock alignment, counter semantics and live damage increments before integration.';
await fs.writeFile(path.join(destination, 'samples.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n');
await fs.writeFile(path.join(destination, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ connected: report.connected, messages: report.messageTypes, samples: report.samples.length,
  first: report.samples[0], last: report.samples.at(-1), errors: report.errors, report: path.join(destination, 'report.json') }, null, 2));
