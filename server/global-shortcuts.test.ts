import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createGlobalShortcuts } = createRequire(import.meta.url)('../electron/global-shortcuts.cjs');
const bindings = { take: 'Control+Enter', live: 'Control+Shift+L', analysis: 'Control+Shift+A', feeds: 'Control+Shift+F', emergency: 'Control+Shift+E', undo: 'Control+Shift+Z' };
const request = { action: 'enable', seatToken: 'test_token_12345678', bindings };
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(authorize: (token: string) => Promise<unknown> = async () => ({ role: 'director', owner: true })) {
  const callbacks = new Map<string, () => void>(), external = new Set<string>(), dispatched: unknown[] = [], changes: unknown[] = [];
  let clock = 1000;
  const manager = createGlobalShortcuts({
    registry: { register: (key: string, callback: () => void) => { if (external.has(key) || callbacks.has(key)) return false; callbacks.set(key, callback); return true; }, unregister: (key: string) => { callbacks.delete(key); } },
    authorize, dispatch: (event: unknown) => dispatched.push(event), changed: (status: unknown) => changes.push(status), now: () => clock, heartbeatMs: 10_000,
  });
  return { manager, callbacks, external, dispatched, changes, advance: () => { clock += 500; } };
}
test('native shortcuts start off, explicitly enable six keys and unregister only owned keys', async () => {
  const f = fixture();
  assert.equal(f.manager.status().enabled, false);
  f.external.add('Alt+Shift+Q');
  try {
    const result = await f.manager.configure(request);
    assert.equal(result.enabled, true); assert.equal(result.registered.length, 6);
    assert.equal(JSON.stringify(result).includes(request.seatToken), false);
    await f.manager.configure({ action: 'disable' });
    assert.equal(f.callbacks.size, 0); assert.equal(f.external.has('Alt+Shift+Q'), true);
  } finally { f.manager.disable(); }
});
test('occupied system accelerator returns receipt and rolls back earlier registrations', async () => {
  const f = fixture(); f.external.add(bindings.feeds);
  const result = await f.manager.configure(request);
  assert.equal(result.enabled, false); assert.equal(result.failures[0].accelerator, bindings.feeds);
  assert.equal(f.callbacks.size, 0); assert.equal(f.external.has(bindings.feeds), true);
});
test('readonly and nonowner directors cannot register native shortcuts', async () => {
  for (const seat of [{ role: 'readonly', owner: true }, { role: 'director', owner: false }]) {
    const f = fixture(async () => seat);
    assert.equal((await f.manager.configure(request)).enabled, false);
    assert.equal(f.callbacks.size, 0);
  }
});
test('each native press rechecks ownership, debounces repeat and revokes on lost control', async () => {
  let owner = true, checks = 0;
  const f = fixture(async () => { checks += 1; return { role: 'director', owner }; });
  try {
    await f.manager.configure(request);
    f.callbacks.get(bindings.take)!(); f.callbacks.get(bindings.take)!(); await settle();
    assert.deepEqual(f.dispatched, [{ action: 'take', accelerator: bindings.take }]); assert.equal(checks, 2);
    owner = false; f.advance(); f.callbacks.get(bindings.emergency)!(); await settle();
    assert.equal(f.dispatched.length, 1); assert.equal(f.manager.status().enabled, false); assert.equal(f.callbacks.size, 0);
  } finally { f.manager.disable(); }
});
test('disabling during pending authorization cannot resurrect registrations', async () => {
  let finish!: (value: unknown) => void;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.manager.configure(request);
  f.manager.disable(); finish({ role: 'director', owner: true }); await pending;
  assert.equal(f.manager.status().enabled, false); assert.equal(f.callbacks.size, 0);
});
test('inflight native action is discarded after disable or renderer navigation', async () => {
  let finish!: (value: unknown) => void, pendingCheck = false;
  const f = fixture(async () => pendingCheck ? new Promise(resolve => { finish = resolve; }) : ({ role: 'director', owner: true }));
  await f.manager.configure(request); pendingCheck = true;
  f.callbacks.get(bindings.take)!(); f.manager.disable(); finish({ role: 'director', owner: true }); await settle();
  assert.equal(f.dispatched.length, 0); assert.equal(f.callbacks.size, 0);
});
test('invalid, duplicated or additional actions cannot register', async () => {
  const f = fixture();
  for (const value of [{ ...bindings, live: bindings.take }, { ...bindings, take: 'A' }, { ...bindings, take: 'Alt+F4' }, { ...bindings, arbitrary: 'Control+Shift+X' }]) {
    await assert.rejects(f.manager.configure({ ...request, bindings: value }));
    assert.equal(f.callbacks.size, 0);
  }
  await assert.rejects(f.manager.configure({ ...request, seatToken: '\r\nX-Test: true' }));
});
test('unreachable seat service leaves an explicit disabled status', async () => {
  const f = fixture(async () => { throw new Error('席位连接中断'); });
  const result = await f.manager.configure(request);
  assert.equal(result.enabled, false); assert.match(result.message, /连接中断/); assert.equal(f.callbacks.size, 0);
});

test('native registry supports aliases and configured buttons, rolls back a conflicting alias and revokes all on ownership loss',async()=>{
 let owner=true;const f=fixture(async()=>({role:'director',owner}));
 const expanded={...bindings,take:[bindings.take,'Alt+Shift+T'],'button-review':['Alt+Shift+R','Alt+Shift+D']};
 try{
 const result=await f.manager.configure({...request,bindings:expanded});assert.equal(result.registered.length,9);
 f.callbacks.get('Alt+Shift+T')!();await settle();f.advance();f.callbacks.get('Alt+Shift+D')!();await settle();
 assert.deepEqual(f.dispatched,[{action:'take',accelerator:'Alt+Shift+T'},{action:'button-review',accelerator:'Alt+Shift+D'}]);
 owner=false;f.advance();f.callbacks.get('Alt+Shift+R')!();await settle();assert.equal(f.callbacks.size,0);
 owner=true;f.external.add('Alt+Shift+D');const failed=await f.manager.configure({...request,bindings:expanded});assert.equal(failed.enabled,false);assert.equal(f.callbacks.size,0);assert.equal(failed.failures[0].accelerator,'Alt+Shift+D');
 }finally{f.manager.disable();}
});
