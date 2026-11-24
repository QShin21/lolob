// Builds application icons and installer bitmaps from the committed masters in brand/.
// Pure sharp + Buffer: no fonts, browsers or network. Used by scripts/build-release.mjs and
// by `npm run brand` to refresh the committed web icons in public/brand.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'brand');
export const ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const SMALL_MASTER_MAX = 32;

async function renderIcon(size) {
  const master = await readFile(path.join(brand, size <= SMALL_MASTER_MAX ? 'guanlan-icon-small.svg' : 'guanlan-icon.svg'));
  return sharp(master, { density: Math.max(72, 72 * size / 512 * 4) }).resize(size, size, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
}

/** 32-bit BGRA device-independent bitmap entry with an empty AND mask, as classic .ico consumers expect. */
function icoBitmap(rgba, size) {
  const maskRow = Math.ceil(size / 32) * 4, header = Buffer.alloc(40), pixels = Buffer.alloc(size * size * 4), mask = Buffer.alloc(maskRow * size);
  header.writeUInt32LE(40, 0); header.writeInt32LE(size, 4); header.writeInt32LE(size * 2, 8); header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
  header.writeUInt32LE(pixels.length + mask.length, 20);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const from = (y * size + x) * 4, to = ((size - 1 - y) * size + x) * 4;
    pixels[to] = rgba[from + 2]; pixels[to + 1] = rgba[from + 1]; pixels[to + 2] = rgba[from]; pixels[to + 3] = rgba[from + 3];
  }
  return Buffer.concat([header, pixels, mask]);
}

export async function buildIco(sizes = ICON_SIZES) {
  const images = [];
  for (const size of sizes) {
    const rgba = await renderIcon(size);
    // 256 px is stored as PNG (the Vista+ convention); smaller entries as BMP for old shell paths.
    images.push({ size, data: size >= 256 ? await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer() : icoBitmap(rgba, size) });
  }
  const header = Buffer.alloc(6 + 16 * images.length); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const at = 6 + index * 16;
    header[at] = image.size >= 256 ? 0 : image.size; header[at + 1] = image.size >= 256 ? 0 : image.size;
    header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6); header.writeUInt32LE(image.data.length, at + 8); header.writeUInt32LE(offset, at + 12);
    offset += image.data.length;
  });
  return Buffer.concat([header, ...images.map(image => image.data)]);
}

export async function buildPng(size) {
  const rgba = await renderIcon(size);
  return sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

/** 24-bit bottom-up BMP, the format NSIS loads for installer artwork. */
export async function buildBmp(file, width, height) {
  const { data } = await sharp(await readFile(file)).resize(width, height, { fit: 'cover', kernel: 'lanczos3' }).flatten({ background: '#070b12' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const row = Math.ceil(width * 3 / 4) * 4, body = Buffer.alloc(row * height), header = Buffer.alloc(54);
  header.write('BM', 0, 'ascii'); header.writeUInt32LE(54 + body.length, 2); header.writeUInt32LE(54, 10); header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18); header.writeInt32LE(height, 22); header.writeUInt16LE(1, 26); header.writeUInt16LE(24, 28); header.writeUInt32LE(body.length, 34);
  header.writeInt32LE(2835, 38); header.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (y * width + x) * 3, to = (height - 1 - y) * row + x * 3;
    body[to] = data[from + 2]; body[to + 1] = data[from + 1]; body[to + 2] = data[from];
  }
  return Buffer.concat([header, body]);
}

/** Icons and installer art for electron-builder (buildResources directory). */
export async function writeBuildResources(directory) {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'icon.ico'), await buildIco());
  await writeFile(path.join(directory, 'icon.png'), await buildPng(512));
  const sidebar = await buildBmp(path.join(brand, 'installer-sidebar.png'), 164, 314);
  await writeFile(path.join(directory, 'installerSidebar.bmp'), sidebar);
  await writeFile(path.join(directory, 'uninstallerSidebar.bmp'), sidebar);
  await writeFile(path.join(directory, 'installerHeader.bmp'), await buildBmp(path.join(brand, 'installer-header.png'), 150, 57));
}

/** Committed web and window icons served from public/brand. */
export async function writePublicIcons(directory = path.join(root, 'public', 'brand')) {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'favicon.ico'), await buildIco([16, 24, 32, 48]));
  for (const size of [32, 192, 256, 512]) await writeFile(path.join(directory, `icon-${size}.png`), await buildPng(size));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--public')) { await writePublicIcons(); console.log('Wrote public/brand icons.'); }
  const index = process.argv.indexOf('--out');
  if (index > 0) { await writeBuildResources(path.resolve(process.argv[index + 1])); console.log(`Wrote build resources to ${process.argv[index + 1]}.`); }
}
