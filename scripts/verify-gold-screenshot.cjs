const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { tsImport } = require('tsx/esm/api');

async function main() {
  const taskInput = process.argv[2];
  if (!taskInput) throw new Error('Provide the spectator screenshot path, followed by an optional portrait manifest.');
  const taskData = process.env.RIFTCAST_DATA_DIR || path.join(__dirname, '../data');
  const taskRoster = JSON.parse(fs.readFileSync(path.join(taskData, 'state.json'), 'utf8')).players;
  const { prepareChampionPortraitManifest } = await tsImport('../server/spectator-portraits.ts', __filename);
  const { parseScoreboardWords, matchPlayerGoldRows } = await tsImport('../server/spectator-scoreboard.ts', __filename);
  const taskManifest = process.argv[3] || await prepareChampionPortraitManifest(taskRoster);
  const taskArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'read-spectator-gold.ps1'),
    '-ReadPlayers', '-SkipTeam', '-ImagePath', path.resolve(taskInput), '-PlayersX', '0', '-PlayersY', '0', '-PlayersWidth', '1', '-PlayersHeight', '1'];
  if (taskManifest) taskArgs.push('-ChampionManifest', path.resolve(taskManifest));
  const taskStarted = Date.now();
  const taskOutput = execFileSync('powershell.exe', taskArgs, { windowsHide: true, timeout: 15000, encoding: 'utf8', maxBuffer: 1000000 });
  const taskReading = JSON.parse(taskOutput.trim().replace(/^\uFEFF/, ''));
  const taskRows = parseScoreboardWords(taskReading.playerWords, taskReading.playerPortraits);
  const taskMatches = matchPlayerGoldRows(taskRows, taskRoster);
  const taskOutputFile = process.argv[4] || path.join(__dirname, '../verification-output/ocr/economy-screenshot-ocr.json');
  fs.mkdirSync(path.dirname(taskOutputFile), { recursive: true });
  fs.writeFileSync(taskOutputFile, JSON.stringify({ ...taskReading, rows: taskRows, matched: taskMatches.size, durationMs: Date.now()-taskStarted })+'\n', 'utf8');
  process.stdout.write(JSON.stringify({ rows: taskRows.length, matched: taskMatches.size, durationMs: Date.now()-taskStarted,
    players: [...taskMatches.values()].map(({team,championId,kills,deaths,assists,cs,currentGold,totalGold,identitySource}) => ({team,championId,kills,deaths,assists,cs,currentGold,totalGold,identitySource})), output: path.resolve(taskOutputFile) })+'\n');
  if (taskReading.playerError || taskRows.length !== 10 || taskMatches.size !== 10) process.exitCode = 1;
}
main().catch(error => { process.stderr.write(error.message+'\n'); process.exitCode=1; });
