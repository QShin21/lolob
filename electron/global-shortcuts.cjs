// Native system registrations are owned by this manager only. A failed set is rolled back as a whole.
const actions = ['take', 'live', 'analysis', 'feeds', 'emergency', 'undo'];
function createGlobalShortcuts({ registry, authorize, dispatch, changed, now = Date.now, heartbeatMs = 1500 }) {
  let epoch = 0, token = '', timer, checking = false, inFlight = false, lastFire = -Infinity;
  let status = { enabled: false, registered: [], failures: [], message: '后台快捷键已关闭' };
  const snapshot = () => JSON.parse(JSON.stringify(status));
  const publish = () => { const value = snapshot(); changed?.(value); return value; };
  function disable(message = '后台快捷键已关闭', failures = []) {
    epoch += 1;
    clearInterval(timer); timer = undefined;
    for (const item of status.registered) { try { registry.unregister(item.accelerator); } catch {} }
    token = ''; checking = false; inFlight = false; lastFire = -Infinity;
    status = { enabled: false, registered: [], failures, message };
    return publish();
  }
  async function verify(value) {
    const seat = await authorize(value);
    if (seat?.role !== 'director' || seat.owner !== true) throw new Error('当前席位未持有主导播控制权，后台快捷键已关闭');
  }
  async function fire(action, accelerator, generation) {
    if (!status.enabled || generation !== epoch || inFlight || now() - lastFire < 300) return;
    lastFire = now(); inFlight = true;
    try {
      await verify(token);
      if (generation === epoch && status.enabled) dispatch({ action, accelerator });
    } catch (error) {
      if (generation === epoch) disable(error.message || '席位验证失败，后台快捷键已关闭');
    } finally { if (generation === epoch) inFlight = false; }
  }
  async function configure(request) {
    if (request?.action === 'status') return snapshot();
    if (request?.action === 'disable') return disable();
    if (request?.action !== 'enable') throw new Error('后台快捷键请求无效');
    disable();
    const generation = epoch;
    if (typeof request.seatToken !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(request.seatToken)) throw new Error('请重新连接主导播席位');
    const bindings = request.bindings;
    if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings) || Object.keys(bindings).length > 30 || !actions.every(action => Object.hasOwn(bindings, action))) throw new Error('后台快捷键配置无效');
    const entries = Object.entries(bindings).flatMap(([action, value]) => {
      if (!actions.includes(action) && !/^button-[a-z][a-z0-9-]{0,47}$/.test(action)) throw new Error('后台快捷键动作无效');
      const keys = typeof value === 'string' ? [value] : value;
      if (!Array.isArray(keys) || keys.length < 1 || keys.length > (actions.includes(action) ? 4 : 3) || keys.some(key => typeof key !== 'string' || !/^(Control\+Shift\+[A-Z]|Control\+Enter|Alt\+Shift\+[A-Z])$/.test(key))) throw new Error('快捷键须为明确组合键，每项最多四组');
      return keys.map(accelerator => ({ action, accelerator }));
    });
    if (new Set(entries.map(e => e.accelerator)).size !== entries.length) throw new Error('快捷键不能重复');
    try { await verify(request.seatToken); }
    catch (error) { if (generation === epoch) return disable(error.message || '席位验证失败，后台快捷键已关闭'); return snapshot(); }
    if (generation !== epoch) return snapshot();
    token = request.seatToken;
    const registrations = [];
    for (const { action, accelerator } of entries) {
      let ok = false;
      try { ok = registry.register(accelerator, () => { void fire(action, accelerator, generation); }); } catch {}
      if (!ok) {
        for (const item of registrations) { try { registry.unregister(item.accelerator); } catch {} }
        return disable('快捷键被系统或其他应用占用，请修改后重新启用', [{ action, accelerator, reason: '系统注册失败或已被占用' }]);
      }
      registrations.push({ action, accelerator });
    }
    status = { enabled: true, registered: registrations, failures: [], message: `已注册 ${registrations.length} 个后台快捷键，本次运行有效` };
    timer = setInterval(async () => {
      if (checking || generation !== epoch || !status.enabled) return;
      checking = true;
      try { await verify(token); }
      catch (error) { if (generation === epoch) disable(error.message || '席位连接中断，后台快捷键已关闭'); }
      finally { if (generation === epoch) checking = false; }
    }, heartbeatMs);
    timer.unref?.();
    return publish();
  }
  return { configure, disable, status: snapshot };
}
module.exports = { createGlobalShortcuts };
