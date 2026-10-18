// Print the self-contained manual and check each page before producing the PDF.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.RIFTCAST_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.RIFTCAST_PLAYWRIGHT_MODULE).href : 'playwright');
const root = path.resolve('docs/user-manual-1.0.2');
const evidence = path.resolve('verification-output/user-manual-1.0.2');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(path.join(root, 'RiftCast-1.0.2-用户使用手册.html')).href);
  await page.locator('figure a').first().click();
  await page.locator('#image-viewer[open]').waitFor();
  await page.locator('#image-viewer img').evaluate(i => i.decode());
  await page.getByRole('button', { name: '关闭原图', exact: true }).click();
  await page.locator('#p2 a[href="#p37"]').click();
  if (await page.evaluate(() => location.hash) !== '#p37') throw new Error('Directory navigation failed');
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (mobile.scrollWidth > mobile.width + 2) throw new Error('Mobile horizontal overflow: ' + JSON.stringify(mobile));
  await page.setViewportSize({ width: 1200, height: 1500 });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll('figure img')].map(i => i.decode())); });
  const pages = await page.locator('.sheet').evaluateAll(sheets => sheets.map(s => {
    const content = s.querySelector('.content').getBoundingClientRect(), footer = s.querySelector('.footer').getBoundingClientRect();
    return { page: Number(s.dataset.page), title: s.querySelector('h2').textContent, contentBottom: content.bottom - s.getBoundingClientRect().top, availableBottom: footer.top - s.getBoundingClientRect().top, overlap: content.bottom > footer.top - 8 };
  }));
  const brokenImages = await page.locator('figure img').evaluateAll(images => images.filter(i => !i.complete || !i.naturalWidth).length);
  const failures = pages.filter(p => p.overlap);
  await writeFile(path.join(evidence, 'layout.json'), JSON.stringify({ pages, brokenImages, offline: true, imageViewer: true, directoryNavigation: true, mobile }, null, 2));
  if (failures.length || brokenImages) throw new Error(JSON.stringify({ failures, brokenImages }));
  await page.pdf({ path: path.join(root, 'RiftCast-1.0.2-用户使用手册.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, tagged: true, outline: true });
  console.log(JSON.stringify({ pages: pages.length, brokenImages, overlap: failures.length }));
} finally { await browser.close(); }
