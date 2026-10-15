'use strict';
// Sol is the sole operator. This ignored wrapper is not production application code.
// Requires explicit authorized endpoint id/name and the clean RC3 source SHA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');

const CLONE = 'E:\\codexdata\\lolob-release-20261014';
const PRIMARY = 'E:\\codexdata\\lol导播软件';
const VERSION = '0.8.0-rc.3';
const helper = path.join(__dirname, 'capture-only.exe');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function options(argv) {
  const result = {}, required = ['--expected-source', '--executable', '--playwright', '--target-capture-id', '--target-capture-name'];
  assert.equal(argv.length, required.length * 2, 'Supply exactly the five documented named options');
  for (let i = 0; i < argv.length; i += 2) {
    assert.ok(required.includes(argv[i]) && !(argv[i] in result) && argv[i + 1], 'Unexpected/duplicate/missing option');
    result[argv[i]] = argv[i + 1];
  }
  assert.match(result['--expected-source'], /^[0-9a-f]{40}$/);
  assert.ok(!result['--target-capture-id'].includes('\0') && !result['--target-capture-name'].includes('\0'));
  assert.match(result['--target-capture-name'], /EMEET/i, 'Authorization is restricted to the existing EMEET capture');
  return result;
}
function git(args) { return cp.execFileSync('git', ['--no-optional-locks', ...args], { cwd: CLONE, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function invoke(args) {
  return new Promise((resolve, reject) => cp.execFile(helper, args, { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024, shell: false }, (error, stdout) => {
    if (error) return reject(new Error(`Capture helper failed (${error.code || 'execution'}); inspect saved defaults before further action`));
    try {
      const value = JSON.parse(stdout);
      assert.ok(Array.isArray(value.defaults) && value.defaults.length === 6 && value.defaults.every(id => typeof id === 'string' && id.length > 0));
      assert.ok(Array.isArray(value.endpoints)); resolve(value);
    } catch { reject(new Error('Invalid capture helper readback')); }
  }));
}
function assertRender(snapshot, before) { assert.deepEqual(snapshot.defaults.slice(0, 3), before.defaults.slice(0, 3), 'The three default render roles must remain unchanged'); }
function assertTarget(snapshot, id, name) {
  const endpoint = snapshot.endpoints.find(item => item.id === id);
  assert.ok(endpoint && endpoint.capture === true && endpoint.cable === false && endpoint.name === name && /EMEET/i.test(endpoint.name + ' ' + endpoint.interfaceName), 'The exact authorized EMEET id/name must be an active capture endpoint');
}
async function main(argv) {
  const opt = options(argv), expectedSource = opt['--expected-source'];
  const executable = fs.realpathSync(opt['--executable']), playwright = fs.realpathSync(opt['--playwright']);
  const target = opt['--target-capture-id'], targetName = opt['--target-capture-name'];
  assert.equal(process.platform, 'win32');
  assert.equal(path.basename(executable).toLowerCase(), 'riftcast.exe');
  for (const directory of [CLONE, PRIMARY]) assert.ok(!executable.toLowerCase().startsWith(path.resolve(directory).toLowerCase() + path.sep), 'Packaged EXE must be outside source trees');
  assert.equal(git(['rev-parse', 'HEAD']), expectedSource);
  assert.equal(git(['status', '--porcelain', '--untracked-files=all']), '', 'RC3 source must be clean');
  assert.equal(JSON.parse(fs.readFileSync(path.join(CLONE, 'package.json'), 'utf8')).version, VERSION);
  const packaged = JSON.parse(fs.readFileSync(path.join(path.dirname(executable), 'resources/app/package.json'), 'utf8'));
  assert.equal(packaged.version, VERSION);
  assert.equal(packaged.riftcastRelease?.sourceRevision, expectedSource, 'Packaged binary metadata must match the exact accepted source');
  assert.equal(packaged.riftcastRelease?.workingTreeDirty, false);
  const embeddedManifest = JSON.parse(fs.readFileSync(path.join(path.dirname(executable), 'resources/release-manifest.json'), 'utf8'));
  assert.equal(embeddedManifest.version, VERSION);
  assert.equal(embeddedManifest.sourceRevision, expectedSource);
  assert.equal(embeddedManifest.workingTreeDirty, false);
  assert.equal(embeddedManifest.sourceDigest, packaged.riftcastRelease.sourceDigest);
  const buildProof = JSON.parse(fs.readFileSync(path.join(__dirname, 'helper-build.json'), 'utf8'));
  assert.equal(sha(helper), buildProof.executableSha256);
  assert.equal(sha(path.join(__dirname, 'capture-only.cpp')), buildProof.sourceSha256);
  assert.equal(sha(path.join(PRIMARY, 'scripts/native/audio-endpoints.hpp')), buildProof.headerSha256);
  const evidenceRoot = path.join(CLONE, 'verification-output', `release-${VERSION}`);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const evidence = fs.mkdtempSync(path.join(evidenceRoot, 'capture-defaults-'));
  const auditPath = path.join(evidence, 'capture-defaults-audit.json');
  const audit = { version: VERSION, sourceRevision: expectedSource, startedAt: new Date().toISOString(), target: { id: target, name: targetName }, helperSha256: sha(helper), wrapperSha256: sha(__filename), mutationAttempted: false, status: 'preflight', events: [], restoration: { verified: false, errors: [] } };
  const save = () => fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n');
  // A diagnostic write failure must never prevent attempts to restore all roles.
  const saveDuringCleanup = () => { try { save(); } catch (error) { (audit.evidenceErrors ??= []).push(error.message); } };
  const event = (phase, state) => { audit.events.push({ at: new Date().toISOString(), phase, defaults: [...state.defaults] }); save(); };
  save();
  let original, child, monitorStop = false, monitor, childResult, failure, interrupted = false;
  const onSignal = signal => {
    interrupted = true; audit.interrupted = signal; saveDuringCleanup();
    if (child && child.exitCode === null) child.kill();
  };
  const onInt = () => onSignal('SIGINT'), onTerm = () => onSignal('SIGTERM');
  process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
  try {
    original = await invoke(['list']);
    assertTarget(original, target, targetName);
    for (const id of original.defaults.slice(3)) {
      const endpoint = original.endpoints.find(item => item.id === id);
      assert.ok(endpoint?.capture && endpoint.cable, 'All three original capture roles must refer to the authorized existing base CABLE');
    }
    audit.before = original;
    fs.writeFileSync(path.join(evidence, 'defaults-before.json'), JSON.stringify(original, null, 2) + '\n', { flag: 'wx' });
    save(); // Persist the six-role restoration record before the first write.
    for (let role = 0; role < 3; role++) {
      assert.ok(!interrupted, 'Interrupted before switching');
      const current = await invoke(['list']); assertRender(current, original); assertTarget(current, target, targetName);
      assert.equal(current.defaults[role + 3], original.defaults[role + 3], 'Capture changed before this role was authorized to switch');
      audit.mutationAttempted = true; audit.status = 'switching-capture'; save();
      await invoke(['set-capture-role', String(role), current.defaults[role + 3], target]);
      const after = await invoke(['list']); assertRender(after, original); assert.equal(after.defaults[role + 3], target); event(`switched-role-${role}`, after);
    }
    const ready = await invoke(['list']); assertRender(ready, original); assert.deepEqual(ready.defaults.slice(3), [target, target, target]);
    audit.during = ready; audit.status = 'running-acceptance'; save();
    fs.writeFileSync(path.join(evidence, 'defaults-during.json'), JSON.stringify(ready, null, 2) + '\n');
    assert.ok(!interrupted, 'Interrupted before acceptance launch');
    const log = fs.openSync(path.join(evidence, 'verify-release-output.txt'), 'wx');
    child = cp.spawn(process.execPath, [path.join(CLONE, 'scripts/verify-release.mjs'), '--reuse-drivers-only', '--executable', executable, '--playwright', playwright], { cwd: CLONE, windowsHide: true, shell: false, env: { ...process.env, ENABLE_LAN: '0' }, stdio: ['ignore', log, log] });
    fs.closeSync(log);
    const ended = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
    monitor = (async () => {
      try {
        while (!monitorStop) {
          const state = await invoke(['list']); assertRender(state, original); assert.deepEqual(state.defaults.slice(3), [target, target, target], 'Capture changed during the authorized acceptance interval');
          event('during-acceptance', state); await sleep(1000);
        }
      } catch (error) { failure = error; audit.monitorError = error.message; saveDuringCleanup(); if (child.exitCode === null) child.kill(); }
    })();
    childResult = await ended;
    assert.ok(!interrupted, 'Acceptance interrupted');
    if (failure) throw failure;
    assert.equal(childResult.code, 0, 'Formal release acceptance failed; preserve its output and restore defaults');
  } catch (error) { failure = error; audit.failure = error.message; }
  finally {
    monitorStop = true;
    if (monitor) await monitor;
    audit.childResult = childResult || null;
    // Never invoke the product restore-defaults command: it cannot restore CABLE.
    // Attempt every originally authorized role even if one restoration fails.
    if (original && audit.mutationAttempted) {
      audit.status = 'restoring-capture'; saveDuringCleanup();
      for (let role = 0; role < 3; role++) {
        try {
          const current = await invoke(['list']);
          if (current.defaults.slice(0, 3).some((id, i) => id !== original.defaults[i])) audit.restoration.errors.push('Render changed outside capture-only helper; no render write was made');
          const present = current.defaults[role + 3], previous = original.defaults[role + 3];
          assert.ok(present === target || present === previous, 'Capture changed to an unrelated endpoint; do not overwrite it');
          if (present !== previous) await invoke(['set-capture-role', String(role), present, previous]);
          event(`restored-role-${role}`, await invoke(['list']));
        } catch (error) { audit.restoration.errors.push(`role ${role}: ${error.message}`); saveDuringCleanup(); }
      }
      try {
        const after = await invoke(['list']); audit.after = after;
        fs.writeFileSync(path.join(evidence, 'defaults-after.json'), JSON.stringify(after, null, 2) + '\n');
        assert.deepEqual(after.defaults, original.defaults, 'Final six-role defaults must exactly match the saved original values');
        assert.equal(audit.restoration.errors.length, 0);
        audit.restoration.verified = true;
      } catch (error) { audit.restoration.errors.push(error.message); }
    }
    audit.finishedAt = new Date().toISOString();
    audit.status = failure || audit.evidenceErrors?.length || audit.mutationAttempted && !audit.restoration.verified ? 'failed' : 'passed'; saveDuringCleanup();
    if (audit.evidenceErrors?.length) audit.status = 'failed';
    process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
  }
  console.log(JSON.stringify({ status: audit.status, mutationAttempted: audit.mutationAttempted, restorationVerified: audit.restoration.verified, evidence }, null, 2));
  if (audit.status !== 'passed') process.exitCode = 1;
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { options, assertRender, assertTarget };
