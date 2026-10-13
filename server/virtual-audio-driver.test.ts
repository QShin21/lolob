import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { VirtualAudioDriver } from './virtual-audio-driver';

const endpoints = [
  { id: 'render', name: 'CABLE Input (VB-Audio Virtual Cable)', interfaceName: 'VB-Audio Virtual Cable', capture: false, cable: true },
  { id: 'render-16', name: 'CABLE In 16ch (VB-Audio Virtual Cable)', interfaceName: 'VB-Audio Virtual Cable', capture: false, cable: true },
  { id: 'capture', name: 'CABLE Output (VB-Audio Virtual Cable)', interfaceName: 'VB-Audio Virtual Cable', capture: true, cable: true },
];
const inventory = (installed = true, present = installed) => ({ cablePresent: present, defaultRender: 'speaker', defaultCapture: 'mic', defaults: ['speaker', 'speaker', 'speaker', 'mic', 'mic', 'mic'], endpoints: installed ? endpoints : [] });
async function fixture(t: import('node:test').TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), 'riftcast-audio-driver-'));
  await mkdir(path.join(root, 'runtime/vbcable'), { recursive: true });
  t.after(async () => { assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(root).startsWith('riftcast-audio-driver-')); await rm(root, { recursive: true, force: true }); });
  return root;
}
test('Pack45 stereo device is selected automatically and an existing valid cable never requests elevation', async t => {
  const root = await fixture(t), calls: string[][] = [];
  const driver = new VirtualAudioDriver(root, path.join(root, 'data'), async (_file, args) => { calls.push(args); return { stdout: JSON.stringify(inventory()) }; });
  const result = await driver.install(); assert.equal(result.installed, true); assert.equal(result.render?.id, 'render'); assert.equal(result.capture?.id, 'capture'); assert.deepEqual(calls, [['list']]);
});
test('inactive installed driver reports restart or session isolation and is never installed repeatedly', async t => {
  const root = await fixture(t); let calls = 0;
  const driver = new VirtualAudioDriver(root, path.join(root, 'data'), async () => { calls++; return { stdout: JSON.stringify(inventory(false, true)) }; });
  const status = await driver.install(); assert.equal(status.needsRestart, true); assert.equal(status.installed, false); assert.equal(calls, 1);
});
test('modified installer archive is rejected before extraction or any elevated action', async t => {
  const root = await fixture(t); await writeFile(path.join(root, 'runtime/vbcable/VBCABLE_Driver_Pack45.zip'), 'modified');
  let calls = 0; const driver = new VirtualAudioDriver(root, path.join(root, 'data'), async () => { calls++; return { stdout: JSON.stringify(inventory(false, false)) }; });
  await assert.rejects(driver.install(), /校验失败/); assert.equal(calls, 1);
});
test('official archive verifies signature, runs encoded fixed installer and restores only original defaults', async t => {
  const root = await fixture(t); await copyFile(path.resolve('runtime/vbcable/VBCABLE_Driver_Pack45.zip'), path.join(root, 'runtime/vbcable/VBCABLE_Driver_Pack45.zip'));
  const scripts: string[] = []; let installed = false; let defaults: string[] | undefined;
  const driver = new VirtualAudioDriver(root, path.join(root, 'data'), async (file, args) => {
    if (args[0] === 'list') return { stdout: JSON.stringify(inventory(installed, installed)) };
    if (args[0] === 'restore-defaults') { defaults = args.slice(1); return { stdout: '{"restoredDefaults":2}' }; }
    assert.equal(file, 'powershell.exe'); const script = Buffer.from(args.at(-1)!, 'base64').toString('utf16le'); scripts.push(script);
    if (script.includes('Start-Process')) installed = true;
    return { stdout: '' };
  });
  const result = await driver.install(); assert.equal(result.installed, true); assert.equal(scripts.length, 2);
  assert.match(scripts[0], /Get-AuthenticodeSignature/); assert.match(scripts[0], /BUREL VINCENT/); assert.match(scripts[0], /Microsoft.PowerShell.Security.psd1/);
  assert.match(scripts[1], /-Verb RunAs -WindowStyle Hidden -Wait -PassThru/); assert.match(scripts[1], /'-i','-h'/);
  assert.deepEqual(defaults, inventory().defaults);
});
test('bad device response and publisher validation failures never trigger installation', async t => {
  const root = await fixture(t);
  const bad = new VirtualAudioDriver(root, path.join(root, 'data'), async () => ({ stdout: 'invalid' }));
  await assert.rejects(bad.install(), /设备读取失败/);
  await copyFile(path.resolve('runtime/vbcable/VBCABLE_Driver_Pack45.zip'), path.join(root, 'runtime/vbcable/VBCABLE_Driver_Pack45.zip'));
  let calls = 0; const signature = new VirtualAudioDriver(root, path.join(root, 'data'), async (_file, args) => { calls++; if (args[0] !== 'list') throw new Error('Signature rejected'); return { stdout: JSON.stringify(inventory(false, false)) }; });
  await assert.rejects(signature.install(), /数字签名校验失败/); assert.equal(calls, 2);
});
