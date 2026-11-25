// Design-time renderer for the raster brand masters in brand/ (installer artwork, README banner).
// Needs Playwright + Chromium and the bundled Noto Serif SC / IBM Plex fonts; run on a design workstation,
// then commit the PNGs. Release builds only read the committed PNGs (scripts/build-brand-assets.mjs).
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'brand');
const font = file => pathToFileURL(path.join(root, 'node_modules', file)).href;
const icon = (await readFile(path.join(brand, 'guanlan-icon.svg'), 'utf8')).replace(/<\?xml[^>]*>/, '').replace(/<!--[^]*?-->/g, '');
// Mark without the tile: drop the tile and its rim; the cut behind the lamp stays in the art's ink.
const mark = icon.replace(/<rect [^>]*\/>\s*/g, '');
// The wave motif (澜): a few hairline swells, the nearest one brightest.
const waves = (w, h, y, amp, n = 4) => `<svg style="position:absolute;left:0;top:0" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${Array.from({ length: n }, (_, i) => { const yy = y + i * amp * .9, q = w / 4; return `<path fill="none" stroke="#eeeff1" stroke-width="${i ? 1 : 1.5}" stroke-opacity="${[.5, .26, .15, .08, .05][i]}" d="M${-q * .5} ${yy} C${-q * .25} ${yy - amp} ${q * .25} ${yy - amp} ${q * .5} ${yy} S${q * 1.25} ${yy + amp} ${q * 1.5} ${yy} S${q * 2.25} ${yy - amp} ${q * 2.5} ${yy} S${q * 3.25} ${yy + amp} ${q * 3.5} ${yy} S${q * 4.25} ${yy - amp} ${q * 4.5} ${yy}"/>`; }).join('')}</svg>`;
const css = `
*{box-sizing:border-box;margin:0}html,body{background:#0e0f11}
.art{position:relative;overflow:hidden;background:#0e0f11;color:#eeeff1;font-family:'IBM Plex Sans','Noto Sans SC Variable',sans-serif}
.han{font-family:'Noto Serif SC Variable',serif;font-weight:900;line-height:1;letter-spacing:.14em;color:#eeeff1}
.word{font-family:'IBM Plex Sans Condensed',sans-serif;font-weight:500;line-height:1;letter-spacing:.42em;color:#b6b9bf}
.sub{font-family:'Noto Sans SC Variable',sans-serif;font-weight:400;color:#969aa4}
.lamp{display:inline-block;border-radius:50%;background:#e5381f}
svg.mark{display:block}
`;
const sized = (svg, px) => svg.replace('<svg ', '<svg class="mark" ').replace('width="512" height="512"', `width="${px}" height="${px}"`);
const pages = {
  'installer-sidebar': { width: 164, height: 314, scale: 4, html: `
    <div class="art" style="width:164px;height:314px">
      ${waves(164, 314, 238, 9)}
      <div style="position:absolute;left:0;right:0;top:46px;display:grid;justify-items:center">
        <div style="width:72px;height:72px">${sized(mark, 72)}</div>
        <div class="han" style="font-size:31px;text-indent:.14em;margin-top:14px">观澜</div>
        <div class="word" style="font-size:9px;text-indent:.42em;margin-top:11px">GUANLAN</div>
        <div class="sub" style="font-size:8px;letter-spacing:.2em;text-indent:.2em;margin-top:18px">英雄联盟赛事导播</div>
      </div>
      <div style="position:absolute;left:0;right:0;bottom:20px;display:flex;justify-content:center;align-items:center;gap:6px"><i class="lamp" style="width:5px;height:5px"></i><span class="word" style="font-size:8px;letter-spacing:.3em;color:#969aa4">ON AIR READY</span></div>
    </div>` },
  'installer-header': { width: 150, height: 57, scale: 4, html: `
    <div class="art" style="width:150px;height:57px">
      ${waves(150, 57, 50, 3, 3)}
      <div style="position:absolute;left:10px;top:10px;display:flex;align-items:center;gap:8px">
        <div style="width:36px;height:36px">${sized(mark, 36)}</div>
        <div><div class="han" style="font-size:19px">观澜</div><div class="word" style="font-size:6.5px;margin-top:5px;letter-spacing:.36em">GUANLAN</div></div>
      </div>
    </div>` },
  'guanlan-banner': { width: 1280, height: 360, scale: 2, html: `
    <div class="art" style="width:1280px;height:360px">
      ${waves(1280, 360, 292, 20, 5)}
      <div style="position:absolute;left:96px;top:0;bottom:36px;display:flex;align-items:center;gap:44px">
        <div style="width:150px;height:150px">${sized(icon, 150)}</div>
        <div>
          <div style="display:flex;align-items:baseline;gap:30px"><div class="han" style="font-size:98px">观澜</div><div class="word" style="font-size:30px">GUANLAN</div></div>
          <div class="sub" style="font-size:22px;margin-top:26px;letter-spacing:.24em;color:#b6b9bf">英雄联盟赛事导播工作台</div>
        </div>
      </div>
      <div style="position:absolute;right:96px;top:150px;display:flex;align-items:center;gap:12px"><i class="lamp" style="width:12px;height:12px"></i><span class="word" style="font-size:17px;letter-spacing:.3em">PGM · PVW · TAKE</span></div>
    </div>` },
};
const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.RIFTCAST_CHROMIUM_PATH ? { executablePath: process.env.RIFTCAST_CHROMIUM_PATH } : {}) });
const work = await mkdtemp(path.join(tmpdir(), 'guanlan-brand-'));
try {
  for (const [name, spec] of Object.entries(pages)) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: spec.scale });
    const page = await context.newPage();
    const file = path.join(work, `${name}.html`);
    await writeFile(file, `<!doctype html><meta charset="utf-8">${['@fontsource-variable/noto-serif-sc/wght.css', '@fontsource-variable/noto-sans-sc/wght.css', '@fontsource/ibm-plex-sans-condensed/latin-500.css', '@fontsource/ibm-plex-sans/latin-400.css'].map(href => `<link rel="stylesheet" href="${font(href)}">`).join('')}<style>${css}</style>${spec.html}`);
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); await page.evaluate(() => document.fonts.ready);
    await writeFile(path.join(brand, `${name}.png`), await page.screenshot({ type: 'png' }));
    await context.close();
    console.log(`brand/${name}.png ${spec.width * spec.scale}x${spec.height * spec.scale}`);
  }
} finally { await browser.close(); await rm(work, { recursive: true, force: true }); }
