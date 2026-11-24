// Check the offline HTML at screen and print widths before rendering the PDF.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserExecutable } from './browser-executable.mjs';

const version = '2.0.0';
const root = path.resolve('docs', `user-manual-${version}`);
const evidence = path.resolve('verification-output', `user-manual-${version}`);
const name = `RiftCast-${version}-用户使用手册`;
const modulePath = process.env.RIFTCAST_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
await mkdir(evidence, { recursive: true });

const browser = await chromium.launch({ headless: true, ...browserExecutable({ channel: 'msedge' }) });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(path.join(root, name + '.html')).href);
  await page.locator('figure a').first().click();
  await page.locator('#image-viewer[open] img').evaluate(img => img.decode());
  await page.getByRole('button', { name: '关闭原图', exact: true }).click();

  const directory = page.locator('#p2 table a');
  assert.equal(await directory.count(), 8);
  const links = await directory.evaluateAll(items => items.map(a => a.getAttribute('href')));
  for (const [index, link] of links.entries()) {
    assert.equal(await page.locator(link).count(), 1, link);
    await directory.nth(index).click();
    assert.equal(new URL(page.url()).hash, link);
  }
  await page.getByRole('navigation').getByRole('link', { name: '目录' }).click();
  assert.equal(new URL(page.url()).hash, '#p2');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(mobile.scrollWidth <= mobile.width + 2, `Mobile overflow: ${JSON.stringify(mobile)}`);
  await page.setViewportSize({ width: 1200, height: 1500 });
  await page.emulateMedia({ media: 'print' });
  const brokenImages = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.querySelectorAll('.sheet img')].filter(img => !img.complete || !img.naturalWidth).map(img => img.alt);
  });
  assert.deepEqual(brokenImages, []);
  const pages = await page.locator('.sheet').evaluateAll(sheets => sheets.map(sheet => {
    const top = sheet.getBoundingClientRect().top;
    const contentBottom = sheet.querySelector('.content').getBoundingClientRect().bottom - top;
    const availableBottom = sheet.querySelector('.footer').getBoundingClientRect().top - top;
    return {
      page: Number(sheet.dataset.page),
      title: sheet.querySelector('h2').textContent,
      pageNumber: sheet.querySelector('.footer span:last-child').textContent,
      contentBottom,
      availableBottom,
      overlap: contentBottom > availableBottom - 8,
      horizontalOverflow: sheet.scrollWidth > sheet.clientWidth + 1,
    };
  }));
  const unresolvedLinks = await page.locator('.sheet a[href^="#"]:not(figure a)').evaluateAll(anchors =>
    anchors.filter(link => !document.getElementById(link.hash.slice(1))).map(link => link.hash));
  await writeFile(path.join(evidence, 'layout.json'), JSON.stringify({ pages, links, unresolvedLinks, mobile }, null, 2) + '\n');
  assert.deepEqual(unresolvedLinks, []);
  assert.equal(pages.length, 47);
  assert.deepEqual(pages.filter(item => item.overlap || item.horizontalOverflow), []);
  for (const [i, item] of pages.entries()) {
    assert.equal(item.pageNumber, `${String(i + 1).padStart(2, '0')} / ${pages.length}`);
  }

  // The image viewer is part of the HTML. Keep the PDF links for the chapters and release.
  await page.locator('figure a').evaluateAll(anchors => anchors.forEach(anchor => anchor.replaceWith(...anchor.childNodes)));
  await page.pdf({
    path: path.join(root, name + '.pdf'),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    tagged: true,
    outline: true,
  });
  console.log(`Rendered ${pages.length} pages with linked contents and no overlap`);
} finally {
  await browser.close();
}
