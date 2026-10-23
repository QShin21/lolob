const { app, globalShortcut } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGlobalShortcuts } = require('../electron/global-shortcuts.cjs');
// A windowless probe: registers and removes accelerators without sending keyboard input or production actions.
const dir = path.resolve(__dirname, '..', 'verification-output', `release-${require('../package.json').version}`, 'global-shortcuts');
app.setPath('userData', path.join(dir, 'electron-test-profile'));
app.whenReady().then(async () => {
  const bindings = { take: 'Control+Enter', live: 'Control+Shift+L', analysis: 'Control+Shift+A', feeds: 'Control+Shift+F', emergency: 'Control+Shift+P', undo: 'Control+Shift+Z' };
  const manager = createGlobalShortcuts({ registry: globalShortcut, authorize: async () => ({ role: 'director', owner: true }), dispatch: () => {}, heartbeatMs: 10_000 });
  const checks = []; let external = false;
  try {
    assert.equal(manager.status().enabled, false);
    const enabled = await manager.configure({ action: 'enable', seatToken: 'isolated_native_probe', bindings });
    assert.equal(enabled.enabled, true, enabled.message + ' ' + JSON.stringify(enabled.failures));
    assert.ok(Object.values(bindings).every(key => globalShortcut.isRegistered(key)));
    checks.push('Electron registered all six accelerators with Windows');
    manager.disable(); assert.ok(Object.values(bindings).every(key => !globalShortcut.isRegistered(key)));
    checks.push('Disabling removed all owned Windows registrations');
    const multiple = {...bindings,take:[bindings.take,'Alt+Shift+T','Alt+Shift+Y'],'button-review':['Alt+Shift+D','Alt+Shift+E']};
    const expanded = await manager.configure({action:'enable',seatToken:'isolated_native_probe',bindings:multiple});
    assert.equal(expanded.enabled,true,JSON.stringify(expanded.failures));assert.equal(expanded.registered.length,10);
    assert.ok(expanded.registered.every(item=>globalShortcut.isRegistered(item.accelerator)));
    manager.disable();assert.ok(expanded.registered.every(item=>!globalShortcut.isRegistered(item.accelerator)));
    checks.push('Windows registered and removed ten primary, alias and custom-button combinations; no keys were sent');
    external = globalShortcut.register(bindings.take, () => {}); assert.equal(external, true);
    const failed = await manager.configure({ action: 'enable', seatToken: 'isolated_native_probe', bindings });
    assert.equal(failed.enabled, false); assert.equal(failed.failures[0].accelerator, bindings.take);
    assert.ok(globalShortcut.isRegistered(bindings.take));
    checks.push('An occupied accelerator produced a failure receipt and retained the existing registration');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'native-report.json'), JSON.stringify({ status: 'passed', electron: process.versions.electron, checks, keyboardInjection: false, productionActions: false }, null, 2));
    process.stdout.write(JSON.stringify({ status: 'passed', checks, evidence: dir }) + '\n');
  } catch (error) {
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'native-report.json'), JSON.stringify({ status: 'failed', error: error.message }, null, 2));
    process.stderr.write(error.stack + '\n'); process.exitCode = 1;
  } finally { manager.disable(); if (external) globalShortcut.unregister(bindings.take); app.exit(process.exitCode || 0); }
}).catch(error => { process.stderr.write(error.stack + '\n'); app.exit(1); });
