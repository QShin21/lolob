import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ControlSeats } from './control-seats';

test('read-only seat verification preserves all five roles and actual ownership', () => {
  const seats = new ControlSeats();
  const owner = seats.issue({ role: 'director', name: '原主导播' }, true);
  for (const role of ['readonly', 'data', 'subtitle', 'replay', 'director']) {
    const invited = seats.issue({ role, name: role }, true);
    assert.deepEqual(seats.verify(invited.token), { id: invited.id, role, name: role, owner: false });
  }
  assert.equal(seats.verify(owner.token).owner, true);
  const replacement = seats.issue({ role: 'director' }, true);
  seats.claim(replacement.token, '明确交接');
  assert.equal(seats.verify(owner.token).owner, false);
  assert.equal(seats.verify(replacement.token).owner, true);
});

test('an expired seat cannot silently enroll, change role or regain control after restart', () => {
  const old = new ControlSeats();
  for (const role of ['readonly', 'data', 'subtitle', 'replay', 'director']) {
    const issued = old.issue({ role }, true), restarted = new ControlSeats();
    assert.throws(() => restarted.verify(issued.token), /席位已失效/);
    assert.throws(() => restarted.issue({ role: 'director' }, true, issued.token), /席位已失效/);
    assert.throws(() => restarted.issue({}, false, issued.token), /席位已失效/);
    assert.throws(() => restarted.authorize(issued.token, 'set-overlay'), /重新连接/);
    assert.equal(restarted.established(), false);
    assert.equal(restarted.ownerInfo(), undefined);
  }
});

test('explicit new local enrollment and a newly issued invitation are separate recovery paths', () => {
  const seats = new ControlSeats();
  const host = seats.issue({ role: 'director', fresh: true }, true, 'expired-token');
  assert.equal(seats.verify(host.token).owner, true);
  const sub = seats.issue({ role: 'subtitle', fresh: true }, true);
  assert.equal(seats.verify(sub.token).role, 'subtitle');
  assert.throws(() => seats.authorize(sub.token, 'take'), /主导播/);
  const nonLocal = seats.issue({ role: 'director', fresh: true }, false);
  assert.equal(nonLocal.role, 'data', 'explicit remote enrollment still cannot self-grant director');
  assert.equal(seats.ownerInfo()!.id, host.id);
});
