import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { VirtualCameraDriver } from './virtual-camera-driver';

test('existing OBS registration is reused without requesting elevation or changing its path', async () => {
  const calls: string[] = [];
  const driver = new VirtualCameraDriver(() => 'Z:\\missing-test-runtime', async script => { calls.push(script); return { stdout: '{"installed":true}' }; });
  assert.equal((await driver.install()).installed, process.platform === 'win32');
  assert.ok(calls.every(script => !script.includes('RunAs') && !script.includes('regsvr32')), 'valid system registration stays untouched');
});

test('driver installation uses fixed encoded modules, keeps valid registrations and confirms readback', async t => {
  if (process.platform !== 'win32') { t.skip('Windows registration wrapper'); return; }
  const dir = await mkdtemp(path.join(tmpdir(), "riftcast-camera's-"));
  const modules = path.join(dir, 'data/obs-plugins/win-dshow');
  await mkdir(modules, { recursive: true });
  await Promise.all([32, 64].map(bits => writeFile(path.join(modules, 'obs-virtualcam-module' + bits + '.dll'), 'fixture')));
  let installed = false;
  const calls: string[] = [];
  const driver = new VirtualCameraDriver(() => dir, async script => {
    calls.push(script);
    if (script.includes('Start-Process')) { installed = true; return { stdout: '' }; }
    return { stdout: JSON.stringify({ installed }) };
  });
  try {
    assert.equal((await driver.install()).installed, true);
    const wrapper = calls.find(script => script.includes('Start-Process'))!;
    assert.match(wrapper, /-Verb RunAs -WindowStyle Hidden -Wait -PassThru/);
    const encoded = wrapper.match(/'-EncodedCommand','([A-Za-z0-9+/=]+)'/)![1];
    const elevated = Buffer.from(encoded, 'base64').toString('utf16le');
    assert.ok(elevated.includes(dir.replaceAll("'", "''")), 'apostrophes in runtime paths remain literal');
    assert.ok(elevated.includes('SysWOW64\\regsvr32.exe') && elevated.includes('System32\\regsvr32.exe'));
    assert.match(elevated, /Test-Path -LiteralPath \$old -PathType Leaf/);
    assert.ok(calls.length >= 3, 'installation success depends on registry readback');
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(dir, { recursive: true, force: true });
  }
});

test('registration probe failure never triggers an install or requests elevation', async t => {
  if (process.platform !== 'win32') { t.skip('Windows registration wrapper'); return; }
  let calls = 0;
  const driver = new VirtualCameraDriver(() => '.', async () => { calls++; throw new Error('fixture probe failure'); });
  await assert.rejects(driver.install(), /状态读取失败/);
  assert.equal(calls, 1, 'probe failure does not proceed to elevation');
});
