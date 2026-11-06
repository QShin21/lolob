// Coordinates a single user-requested check, download and installation handoff.
function createUpdateCoordinator(service, install) {
  let flow;
  function start() {
    if (flow) throw new Error('已有更新操作正在进行');
    const initial = service.status();
    if (['checking','downloading','verifying'].includes(initial.phase)) throw new Error('已有更新操作正在进行');
    if (initial.phase !== 'ready') service.check();
    flow = (async () => {
      let state = initial.phase === 'ready' ? initial : await service.settled();
      if (state.phase === 'available') { service.download(); state = await service.settled(); }
      if (state.phase === 'ready') await install(await service.verifiedReady());
    })().catch(error => service.reportError(error instanceof Error ? error.message : '更新未完成')).finally(() => { flow = undefined; });
    return service.status();
  }
  return { start, busy: () => !!flow, async settled() { await flow; return service.status(); } };
}

function assertUpdateCanInstall(status, ownsService, programOpen) {
  if (!ownsService || !status || !['embedded', 'external'].includes(status.mode) || typeof status.running !== 'boolean' || typeof status.connected !== 'boolean' || typeof status.streamActive !== 'boolean' || typeof status.recordActive !== 'boolean') throw new Error('无法确认导播服务状态，请重新打开桌面客户端后重试');
  if (programOpen || status.streamActive || status.recordActive || status.virtualCamActive === true || status.companionAudio?.active || status.companionAudio?.managing)
    throw new Error('请先停止推流、录制和节目输出，再点击更新');
  if (status.running && (!status.connected || (status.mode === 'embedded' && status.virtualCamActive !== false))) throw new Error('输出引擎状态暂时无法确认，请检查连接后重试');
}
module.exports = { createUpdateCoordinator, assertUpdateCanInstall };
