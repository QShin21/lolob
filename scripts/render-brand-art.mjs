// Design-time renderer for the raster brand masters in brand/ (installer artwork, README banner).
// Needs Playwright + Chromium and the bundled Barlow Condensed font; run on a design workstation,
// then commit the PNGs. Release builds only read the committed PNGs (scripts/build-brand-assets.mjs).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'brand');
const woff = async weight => (await readFile(path.join(root, `node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-${weight}-normal.woff2`))).toString('base64');
const icon = (await readFile(path.join(brand, 'guanlan-icon.svg'), 'utf8')).replace(/<\?xml[^>]*>/, '');
// Mark without the tile: drop the tile, its bloom, the rim and the dark cut behind the wave.
const mark = icon.replace(/<rect x="(?:16|21)"[^>]*(?:fill="url\(#(?:tile|bloom)\)"|stroke="url\(#rim\)")[^>]*\/>\s*/g, '').replace(/<path fill="#0a111e"[^>]*\/>\s*/, '');
// The wave motif (澜) for backgrounds: layered sine strokes, brightest in the middle.
const waves = (w, h, y, amp, n = 5) => `<svg style="position:absolute;left:0;top:0" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="wv" x1="0" x2="1"><stop offset="0" stop-color="#2a8fe0" stop-opacity="0"/><stop offset=".45" stop-color="#5cd6f3"/><stop offset=".62" stop-color="#e6fbff"/><stop offset="1" stop-color="#2a8fe0" stop-opacity="0"/></linearGradient></defs>${Array.from({ length: n }, (_, i) => { const yy = y + i * amp * .62, a = amp * (1 - i * .13), q = w / 4; return `<path fill="none" stroke="url(#wv)" stroke-width="${i ? 1.2 : Math.max(2, amp / 9)}" stroke-opacity="${i ? .5 - i * .08 : 1}" d="M0 ${yy} C${q * .5} ${yy - a} ${q * .5} ${yy - a} ${q} ${yy} S${q * 1.5} ${yy + a} ${q * 2} ${yy} S${q * 2.5} ${yy - a} ${q * 3} ${yy} S${q * 3.5} ${yy + a} ${w} ${yy}"/>`; }).join('')}</svg>`;
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
.han{font-family:'Noto Serif CJK SC','Source Han Serif SC','Songti SC','SimSun',serif;font-weight:700;line-height:1;color:#f3ead2;letter-spacing:.18em}
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
      ${waves(164, 314, 226, 16)}
      <div class="grain"></div>
      <div style="position:absolute;left:0;right:0;top:40px;display:grid;justify-items:center;gap:13px">
        <div style="width:76px;height:76px">${mark.replace('<svg ', '<svg class="mark" ').replace('width="512" height="512"', 'width="76" height="76"')}</div>
        <div class="han" style="font-size:30px;text-indent:.18em">观澜</div>
        <div class="word" style="font-size:12px;text-indent:.34em;letter-spacing:.34em;font-weight:500;color:#d4b676">GUANLAN</div>
        <div class="sub" style="font-size:7.5px;text-indent:.46em;color:#9fb0c6">赛事导播工作台</div>
      </div>
      <div class="rule" style="left:26px;right:26px;bottom:38px"></div>
      <div style="position:absolute;left:0;right:0;bottom:18px;text-align:center;font-weight:500;font-size:10px;letter-spacing:.34em;text-indent:.34em;color:#9fb0c6">VERSION 2</div>
    </div>` },
  'installer-header': { width: 150, height: 57, scale: 4, html: `
    <div class="art" style="width:150px;height:57px">
      <div class="facet" style="left:98px;top:-20px;width:60px;height:120px;transform:rotate(24deg)"></div>
      <div class="bloom" style="left:70px;top:-10px;width:120px;height:90px"></div>
      ${waves(150, 57, 49, 4, 3)}
      <div class="grain"></div>
      <div style="position:absolute;left:11px;top:11px;display:flex;align-items:center;gap:8px">
        <div style="width:35px;height:35px">${mark.replace('<svg ', '<svg class="mark" ').replace('width="512" height="512"', 'width="35" height="35"')}</div>
        <div><div class="han" style="font-size:19px">观澜</div><div class="word" style="font-size:7px;margin-top:4px;letter-spacing:.3em;font-weight:500;color:#d4b676">GUANLAN</div></div>
      </div>
    </div>` },
  'guanlan-banner': { width: 1280, height: 360, scale: 2, html: `
    <div class="art" style="width:1280px;height:360px">
      <div class="facet" style="left:760px;top:-80px;width:420px;height:700px;transform:rotate(24deg)"></div>
      <div class="facet" style="left:560px;top:-80px;width:150px;height:700px;transform:rotate(24deg);opacity:.6"></div>
      <div class="facet" style="left:1040px;top:-80px;width:260px;height:700px;transform:rotate(24deg);opacity:.5"></div>
      <div class="bloom" style="left:680px;top:-60px;width:620px;height:480px"></div>
      ${waves(1280, 360, 300, 26, 5)}
      <div class="grain"></div>
      <div style="position:absolute;left:84px;top:0;bottom:0;display:flex;align-items:center;gap:40px">
        <div style="width:168px;height:168px">${icon.replace('<svg ', '<svg class="mark" ').replace('width="512" height="512"', 'width="168" height="168"')}</div>
        <div>
          <div style="display:flex;align-items:baseline;gap:26px"><div class="han" style="font-size:96px">观澜</div><div class="word" style="font-size:40px;font-weight:500;color:#d4b676;letter-spacing:.3em">GUANLAN</div></div>
          <div class="sub" style="font-size:21px;margin-top:22px;letter-spacing:.5em">英雄联盟赛事导播工作台</div>
          <div style="margin-top:14px;font-weight:500;font-size:19px;letter-spacing:.3em;color:#9fb0c6">TOURNAMENT PRODUCTION · OBSERVER · BROADCAST GRAPHICS</div>
        </div>
      </div>
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
