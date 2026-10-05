import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'public/champion-art');
const cache = path.join(root, 'data/champion-art-source');
const variants = { draft: [400, 625], lineup: [400, 864] };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const verify = process.argv.includes('--verify');
const offline = process.argv.includes('--offline');
const refresh = process.argv.includes('--refresh');
const manifestFile = path.join(root, 'shared/champion-art-manifest.json');
const catalogFile = path.join(root, 'shared/champion-art-catalog.json');

async function download(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) { if (attempt === 2) throw error; }
  }
}
if (verify) {
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
  if (catalog.version !== manifest.version || catalog.champions.length !== manifest.champions.length) throw new Error('Bundled catalog does not match asset manifest');
  let count = 0;
  for (const champion of manifest.champions) {
    const bundled = catalog.champions.find(entry => entry.id === champion.id);
    if (!bundled || Object.entries(champion.assets).some(([name, asset]) => bundled.assets[name]?.url !== asset.url)) throw new Error(`${champion.id}: bundled catalog mismatch`);
    for (const [name, asset] of Object.entries(champion.assets)) {
      const bytes = await readFile(path.join(root, 'public', asset.url));
      const metadata = await sharp(bytes).metadata();
      await sharp(bytes).raw().toBuffer();
      if (sha256(bytes) !== asset.sha256 || metadata.width !== asset.width || metadata.height !== asset.height) throw new Error(`${champion.id} ${name}: asset mismatch`);
      count++;
    }
  }
  console.log(`Verified ${manifest.champions.length} champions / ${count} local assets (${manifest.version}).`);
} else {
  await mkdir(destination, { recursive: true });
  await mkdir(cache, { recursive: true });
  let catalog, version;
  if (offline) ({ version, data: catalog } = JSON.parse(await readFile(path.join(cache, 'catalog.json'), 'utf8')));
  else {
    version = JSON.parse((await download('https://ddragon.leagueoflegends.com/api/versions.json')).toString())[0];
    catalog = JSON.parse((await download(`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/champion.json`)).toString()).data;
    await writeFile(path.join(cache, 'catalog.json'), JSON.stringify({ version, data: catalog }));
  }
  const champions = Object.values(catalog).sort((a, b) => a.id.localeCompare(b.id));
  const entries = new Array(champions.length);
  let cursor = 0, finished = 0;
  async function source(id, kind, url) {
    const file = path.join(cache, `${id}-${kind}.${kind === 'portrait' ? 'jpg' : 'png'}`);
    if (!refresh) { try { return await readFile(file); } catch { /* first import */ } }
    if (offline) throw new Error(`Missing cached source ${id} ${kind}`);
    const bytes = await download(url);
    await sharp(bytes).metadata();
    await writeFile(file, bytes);
    return bytes;
  }
  async function worker() {
    while (cursor < champions.length) {
      const index = cursor++, champion = champions[index];
      // Riot's loading portraits already frame each individual champion from its splash art.
      const portraitSource = `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_0.jpg`;
      const iconSource = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.image.full}`;
      const [portrait, icon] = await Promise.all([source(champion.id, 'portrait', portraitSource), source(champion.id, 'icon', iconSource)]);
      const assets = {};
      async function save(name, bytes, width, height, sourceUrl) {
        const url = `champion-art/${champion.id}-${name}.webp`;
        await writeFile(path.join(root, 'public', url), bytes);
        assets[name] = { url: `/${url}`, width, height, sha256: sha256(bytes), source: sourceUrl };
      }
      for (const [name, [width, height]] of Object.entries(variants)) {
        // Bake the exact card canvas once. Retain the entire curated portrait, filling its
        // margins with blurred artwork so runtime layouts never crop a face or weapon again.
        const background = await sharp(portrait).resize(width, height, { fit: 'cover' }).blur(18).modulate({ brightness: 0.6 }).toBuffer();
        const foreground = await sharp(portrait).resize(width, height, { fit: 'inside' }).toBuffer();
        const size = await sharp(foreground).metadata();
        const bytes = await sharp(background).composite([{ input: foreground, left: Math.floor((width - size.width) / 2), top: 0 }]).webp({ quality: 90 }).toBuffer();
        await save(name, bytes, width, height, portraitSource);
      }
      await save('icon', await sharp(icon).resize(120, 120).webp({ quality: 92 }).toBuffer(), 120, 120, iconSource);
      entries[index] = { id: champion.id, key: Number(champion.key), name: champion.name, title: champion.title, tags: champion.tags, sourceSha256: sha256(portrait), assets };
      if (++finished % 20 === 0 || finished === champions.length) console.log(`Prepared ${finished}/${champions.length} champions`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  await writeFile(manifestFile, JSON.stringify({ version, variants, source: 'Riot Games Data Dragon', champions: entries }, null, 2) + '\n');
  const bundled = entries.map(({ id, key, name, title, tags, assets }) => ({ id, key, name, title, tags, assets: Object.fromEntries(Object.entries(assets).map(([name, asset]) => [name, { url: asset.url }])) }));
  await writeFile(catalogFile, JSON.stringify({ version, champions: bundled }, null, 2) + '\n');
  console.log(`Prepared ${champions.length} champions, two portrait variants and an icon each.`);
}
