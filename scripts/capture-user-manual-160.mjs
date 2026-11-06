const { createFixture: createSeed } = await tsImport('../server/test-support/fixture.ts', import.meta.url);
// Capture the 1.6.0 web UI using isolated fixture data, with native writes blocked.
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { isolatedNativeEnvironment } from './verify-native-safety.mjs';

const modulePath = process.env.RIFTCAST_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const { reportFixture } = await import('./report-093-fixture.mjs');
const out = path.resolve('docs/user-manual-1.6.0/images');
const evidence = path.resolve('verification-output/user-manual-1.6.0');
await mkdir(out, { recursive: true }); await mkdir(evidence, { recursive: true });
const sandbox = await mkdtemp(path.join(os.tmpdir(), 'riftcast-manual-'));
const listener = createServer();
await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const base = `http://127.0.0.1:${port}`;
let child, browser;
const errors = [], captures = [];
async function launch(seed) {
  await writeFile(path.join(sandbox, 'state.json'), JSON.stringify(seed));
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    windowsHide: true,
    env: { ...await isolatedNativeEnvironment(sandbox), PORT: String(port), RIFTCAST_DATA_DIR: sandbox, RIFTCAST_OBS_AUTOSTART: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; child.stdout.on('data', b => log += b); child.stderr.on('data', b => log += b);
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
    if (child.exitCode !== null) throw new Error(log);
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Manual capture service failed: ' + log);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}
try {
  const seed = createSeed(); seed.paused = true;
  await launch(seed);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN', deviceScaleFactor: 1 });
  await context.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (!['GET', 'HEAD'].includes(req.method()) && /^\/api\/(obs|economy|replay|connect)/.test(url.pathname)) return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'截图环境未启动真实设备'})});
    await route.continue();
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.waitForFunction(() => !!sessionStorage.getItem('riftcast-seat-token'));
  async function shot(name) { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500); await page.screenshot({path:path.join(out,`${name}.png`),animations:'disabled'}); await writeFile(path.join(evidence,`${name}.txt`),await page.locator('body').innerText()); captures.push(name); console.log('Captured',name); }
  async function nav(name) { await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name,exact:true}).click(); await page.waitForTimeout(300); }
  await shot('studio');
  for (const [name,id] of [['赛事与素材','manage'],['BP 与阵容','draft'],['实时数据','data'],['连接与输出','settings'],['赛后收尾','wrap'],['使用指南','help']]) { await nav(name); await shot(id); console.log(id,'tabs',JSON.stringify(await page.getByRole('tab').allTextContents())); }
  for (const [section,tabs] of [
    ['赛事与素材',[['战队与选手','teams'],['图片素材','assets'],['比赛记录','records'],['赛事中心','tournament']]],
    ['实时数据',[['来源与校准','data-health']]],
    ['连接与输出',[['数据连接','connections'],['画面','video'],['声音','audio'],['输出','output'],['节目包装','graphics'],['协作','collaboration'],['诊断','diagnostics'],['工作台外观','appearance'],['镜头制作','camera'],['数据集成','integration']]],
  ]) { await nav(section); for (const [label,id] of tabs) { await page.getByRole('tab',{name:new RegExp('^'+label+'(?: ·|$)')}).click(); await shot(id); } }
  await writeFile(path.join(evidence,'capture.json'),JSON.stringify({version:JSON.parse(await readFile('package.json')).version,captures,errors,source:'Isolated UI, no native output'},null,2));
  if(errors.length) throw new Error(errors.join('\n'));
} finally { await browser?.close(); await stop(); }
