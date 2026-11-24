// Design-time renderer for the raster brand masters in brand/ (installer artwork, README banner).
// Needs Playwright + Chromium and the bundled Barlow Condensed font; run on a design workstation,
// then commit the PNGs. Release builds only read the committed PNGs (scripts/build-brand-assets.mjs).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'brand');
const woff = async weight => (await readFile(path.join(root, `node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-${weight}-normal.woff2`))).toString('base64');
const icon = (await readFile(path.join(brand, 'riftcast-icon.svg'), 'utf8')).replace(/<\?xml[^>]*>/, '');
// Mark without the tile: drop the first rect, the clipped facets and the rim.
const mark = icon.replace(/<rect x="16"[^>]*\/>/, '').replace(/<g clip-path[\s\S]*?<\/g>/, '').replace(/<rect x="21"[^>]*\/>/, '');
const css = `
@font-face{font-family:Barlow;font-weight:500;src:url(data:font/woff2;base64,${await woff(500)})}
@font-face{font-family:Barlow;font-weight:700;src:url(data:font/woff2;base64,${await woff(700)})}
*{box-sizing:border-box;margin:0}html,body{background:#05080e}
.art{position:relative;overflow:hidden;color:#eef2f8;font-family:Barlow,'Noto Sans CJK SC','Microsoft YaHei',sans-serif;
  background:radial-gradient(120% 70% at 78% 62%,#12314a 0,transparent 60%),linear-gradient(160deg,#17253d 0,#0a101c 46%,#05080e)}
.facet{position:absolute;background:linear-gradient(180deg,#ffffff0a,#ffffff00);border-left:1px solid #d4b67633;transform-origin:0 0}
.rift{position:absolute;transform-origin:50% 50%;border-radius:50%;
  background:linear-gradient(90deg,transparent,#2a8fe000 18%,#5cd6f3 49%,#fff 50%,#5cd6f3 51%,#2a8fe000 82%,transparent);filter:blur(.6px)}
.bloom{position:absolute;border-radius:50%;background:radial-gradient(closest-side,#3fc8f066,#3fc8f000)}
.word{font-weight:700;letter-spacing:.2em;line-height:1;text-transform:uppercase}
.word i{font-style:normal;font-weight:500;color:#d4b676}
.sub{color:#d4b676;letter-spacing:.46em;font-family:'Noto Sans CJK SC','Microsoft YaHei',sans-serif}
.rule{position:absolute;height:1px;background:linear-gradient(90deg,transparent,#d4b676,transparent)}
.grain{position:absolute;inset:0;opacity:.07;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='7'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")}
svg.mark{display:block;filter:drop-shadow(0 6px 16px #000a)}
`;
const pages = {
  'installer-sidebar': { width: 164, height: 314, scale: 4, html: `
    <div class="art" style="width:164px;height:314px">
      <div class="facet" style="left:96px;top:-20px;width:120px;height:420px;transform:rotate(24deg)"></div>
      <div class="facet" style="left:34px;top:-40px;width:60px;height:460px;transform:rotate(24deg);opacity:.6"></div>
      <div class="bloom" style="left:20px;top:150px;width:240px;height:240px"></div>
      <div class="rift" style="left:-58px;top:232px;width:300px;height:5px;transform:rotate(-58deg)"></div>
      <div class="grain"></div>
      <div style="position:absolute;left:0;right:0;top:40px;display:grid;justify-items:center;gap:13px">
        <div style="width:76px;height:76px">${mark.replace('<svg ', '<svg class="mark" ').replace('width="512" height="512"', 'width="76" height="76"')}</div>
        <div class="word" style="font-size:25px;text-indent:.2em">Rift<i>Cast</i></div>
        <div class="sub" style="font-size:7.5px;text-indent:.46em">裂谷导播工作站</div>
      </div>
      <div class="rule" style="left:26px;right:26px;bottom:38px"></div>
      <div style="position:absolute;left:0;right:0;bottom:18px;text-align:center;font-weight:500;font-size:10px;letter-spacing:.34em;text-indent:.34em;color:#9fb0c6">VERSION 2</div>
    </div>` },
  'installer-header': { width: 150, height: 57, scale: 4, html: `
    <div class="art" style="width:150px;height:57px">
      <div class="facet" style="left:98px;top:-20px;width:60px;height:120px;transform:rotate(24deg)"></div>
      <div class="bloom" style="left:70px;top:-10px;width:120px;height:90px"></div>
      <div class="rift" style="left:62px;top:27px;width:130px;height:3px;transform:rotate(-58deg)"></div>
      <div class="grain"></div>
      <div style="position:absolute;left:11px;top:11px;display:flex;align-items:center;gap:8px">
        <div style="width:35px;height:35px">${mark.replace('<svg ', '<svg class="mark" ').replace('width="512" height="512"', 'width="35" height="35"')}</div>
        <div class="word" style="font-size:17px">Rift<i>Cast</i></div>
      </div>
    </div>` },
  'riftcast-banner': { width: 1280, height: 360, scale: 2, html: `
    <div class="art" style="width:1280px;height:360px">
      <div class="facet" style="left:760px;top:-80px;width:420px;height:700px;transform:rotate(24deg)"></div>
      <div class="facet" style="left:560px;top:-80px;width:150px;height:700px;transform:rotate(24deg);opacity:.6"></div>
      <div class="facet" style="left:1040px;top:-80px;width:260px;height:700px;transform:rotate(24deg);opacity:.5"></div>
      <div class="bloom" style="left:680px;top:-60px;width:620px;height:480px"></div>
      <div class="rift" style="left:640px;top:176px;width:760px;height:8px;transform:rotate(-58deg)"></div>
      <div class="grain"></div>
      <div style="position:absolute;left:84px;top:0;bottom:0;display:flex;align-items:center;gap:40px">
        <div style="width:168px;height:168px">${icon.replace('<svg ', '<svg class="mark" ').replace('width="512" height="512"', 'width="168" height="168"')}</div>
        <div>
          <div class="word" style="font-size:92px">Rift<i>Cast</i></div>
          <div class="sub" style="font-size:21px;margin-top:20px;letter-spacing:.5em">英雄联盟赛事导播工作台</div>
          <div style="margin-top:14px;font-weight:500;font-size:19px;letter-spacing:.3em;color:#9fb0c6">TOURNAMENT PRODUCTION · OBSERVER · BROADCAST GRAPHICS</div>
        </div>
      </div>
      <div class="rule" style="left:84px;width:560px;bottom:44px;background:linear-gradient(90deg,#d4b676,transparent)"></div>
    </div>` },
};
const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.RIFTCAST_CHROMIUM_PATH ? { executablePath: process.env.RIFTCAST_CHROMIUM_PATH } : {}) });
try {
  for (const [name, spec] of Object.entries(pages)) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: spec.scale });
    const page = await context.newPage();
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${css}</style>${spec.html}`);
    await page.evaluate(() => document.fonts.ready);
    await writeFile(path.join(brand, `${name}.png`), await page.screenshot({ type: 'png' }));
    await context.close();
    console.log(`brand/${name}.png ${spec.width * spec.scale}x${spec.height * spec.scale}`);
  }
} finally { await browser.close(); }
