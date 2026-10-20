import { APPEARANCE_TARGETS, APPEARANCE_PROPERTIES, type StyleAppearance } from '../shared/style-appearance';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { BUILTIN_STYLE_RECORDS, BUILTIN_RUNTIME_STYLES, BUILTIN_STYLE_REF, builtinStyle, BUILTIN_STYLE_PACK, FULL_STYLE_SCENES, STYLE_SCENES, STYLE_SURFACES, styleSummary, validStyleRef } from '../shared/style-packs';
import type { RuntimeStylePack, StylePack, StylePackRef, StylePackSummary, StyleSurface } from '../shared/style-packs';
import { readStyleZip, writeStyleZip } from './style-pack-zip';
import { writeDurableState } from './durable-state';

const identifier = /^[a-z][a-z0-9-]{0,47}$/;
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('风格包字段需要是对象'); return v as Record<string, unknown>; };
const keys = (v: Record<string, unknown>, allowed: readonly string[]) => { if (Object.keys(v).some(k => !allowed.includes(k))) throw new Error('风格包包含未知字段或不支持的样式'); };
const text = (v: unknown, max: number, empty = false) => { if (typeof v !== 'string' || v.length > max || !empty && !v.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new Error('风格包文本字段无效'); return v; };
const digest = (v: Buffer | string) => createHash('sha256').update(v).digest('hex');

function validateAppearance(value: unknown): StyleAppearance {
  const input = object(value); keys(input, Object.keys(APPEARANCE_TARGETS));
  for (const entry of Object.values(input)) {
    if (entry === null) continue;
    const props = object(entry); keys(props, APPEARANCE_PROPERTIES);
    for (const [key, value] of Object.entries(props)) {
      if (['color', 'backgroundColor', 'borderColor'].includes(key)) {
        if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) throw new Error('元素颜色需使用十六进制颜色');
      } else if (key === 'font') {
        if (typeof value !== 'string' || !['default', 'modern', 'serif'].includes(value)) throw new Error('元素字体类别无效');
      } else {
        const range = key === 'fontSize' ? [.5, 8] : key === 'fontWeight' ? [100, 900] : [-.05, .3];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1] || key === 'fontWeight' && value % 100 !== 0) throw new Error('元素字号、字重或字距超出范围');
      }
    }
  }
  return input as StyleAppearance;
}

/** Whitelist data only. No CSS, JavaScript, HTML, URLs, fonts or filesystem paths from a pack are executed. */
export function validateStyleManifest(input: unknown): StylePack {
  const m = object(input);
  keys(m, ['format', 'schemaVersion', 'id', 'name', 'version', 'author', 'description', 'canvas', 'palette', 'fonts', 'textures', 'scenes', 'assets', 'appearance']);
  if (m.format !== 'riftcast-style-pack' || m.schemaVersion !== 1) throw new Error('仅支持 riftcast-style-pack 格式第 1 版');
  if (typeof m.id !== 'string' || !identifier.test(m.id)) throw new Error('风格包 id 需为小写英文、数字或连字符，以字母开头，最多 48 字符');
  const version = text(m.version, 40); if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('风格包版本需为 x.y.z');
  const canvas = object(m.canvas); keys(canvas, ['width', 'height']);
  if (canvas.width !== 1920 || canvas.height !== 1080) throw new Error('风格包画布须为 1920 × 1080');
  const p = object(m.palette), palette = { ...BUILTIN_STYLE_PACK.palette }; keys(p, Object.keys(palette));
  for (const [key, value] of Object.entries(p)) { if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) throw new Error(`配色 ${key} 需使用十六进制颜色`); palette[key] = value.toLowerCase(); }
  const fonts = object(m.fonts); keys(fonts, ['body', 'display']);
  for (const key of ['body', 'display']) if (!['default', 'modern', 'serif'].includes(String(fonts[key]))) throw new Error('字体仅支持 default、modern、serif');
  const assetsInput = object(m.assets), assets: Record<string, string> = {};
  if (Object.keys(assetsInput).length > 64) throw new Error('风格包最多 64 张贴图');
  const paths = new Set<string>();
  for (const id of Object.keys(assetsInput).sort()) {
    const value = assetsInput[id];
    if (!identifier.test(id) || typeof value !== 'string' || !/^assets\/[a-z][a-z0-9-]{0,47}\.(png|jpe?g|webp)$/.test(value) || paths.has(value)) throw new Error('贴图需为 assets 目录内唯一的 PNG、JPEG 或 WebP 文件');
    paths.add(value); assets[id] = value;
  }
  const texture = (value: unknown): string | null => {
    if (value === null) return null;
    if (typeof value !== 'string' || !Object.hasOwn(assets, value)) throw new Error('贴图槽引用了未声明的图片');
    return value;
  };
  const surfaces = (value: unknown, complete: boolean) => {
    const input = object(value); keys(input, STYLE_SURFACES);
    return Object.fromEntries((complete ? STYLE_SURFACES : STYLE_SURFACES.filter(k => Object.hasOwn(input, k))).map(k => [k, texture(input[k] ?? null)])) as Record<StyleSurface, string | null>;
  };
  const scenes = object(m.scenes); keys(scenes, STYLE_SCENES);
  const result = {} as StylePack['scenes'];
  for (const scene of STYLE_SCENES) {
    const value = object(scenes[scene]); keys(value, ['background', 'frame', 'textures', 'appearance']);
    const background = texture(value.background), frame = texture(value.frame), textures = surfaces(value.textures ?? {}, false);
    if (!FULL_STYLE_SCENES.includes(scene) && background !== null) throw new Error(`场景 ${scene} 需要保留游戏或摄像头透明背景`);
    if (scene === 'teamfight' && (frame !== null || Object.values(textures).some(v => v !== null))) throw new Error('原生团战视角必须保持全透明');
    result[scene] = { background, frame, textures, ...(Object.hasOwn(value, 'appearance') ? {appearance: validateAppearance(value.appearance)} : {}) };
  }
  return { format: 'riftcast-style-pack', schemaVersion: 1, id: m.id, name: text(m.name, 80), version, author: text(m.author, 80, true), description: text(m.description, 500, true), canvas: { width: 1920, height: 1080 }, palette, fonts: fonts as StylePack['fonts'], textures: surfaces(m.textures, true), scenes: result, assets, ...(Object.hasOwn(m, 'appearance') ? {appearance: validateAppearance(m.appearance)} : {}) };
}

const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function builtinRecord(ref: Pick<StylePackRef, 'id' | 'revision'>) {
  return BUILTIN_STYLE_RECORDS.find(entry => entry.manifest.id === ref.id && entry.revision === ref.revision);
}
function builtinAsset(ref: StylePackRef, id: string): Buffer {
  const entry = builtinRecord(ref), file = entry?.manifest.assets[id];
  if (!entry || !file || !identifier.test(id)) throw new Error('内置贴图不存在');
  const relative = path.join('style-packs', ref.id, ref.revision, file);
  // Vite copies the original PNG files into dist; packaged service lives in server/.
  const candidate = ['dist', 'public'].map(dir => path.join(applicationRoot, dir, relative)).find(existsSync);
  if (!candidate) throw new Error(`内置风格包资源缺失：${entry.manifest.name}/${id}，请修复应用安装`);
  const bytes = readFileSync(candidate);
  if (digest(bytes) !== entry.hashes[file]) throw new Error(`内置风格包资源损坏：${entry.manifest.name}/${id}，请修复应用安装`);
  return bytes;
}
export function builtinStyleArchive(ref: StylePackRef = BUILTIN_STYLE_REF): Buffer {
  const entry = builtinRecord(ref);
  if (!entry) throw new Error('内置风格包不存在');
  const manifest = entry.manifest;
  const files: Record<string, Buffer> = { 'manifest.json': Buffer.from(JSON.stringify(manifest, null, 2) + '\n') };
  for (const [id, file] of Object.entries(manifest.assets)) files[file] = builtinAsset(ref, id);
  files['README.md'] = Buffer.from(`${manifest.name} / RiftCast 1.1.1\n\nBP 卡片支持当前选人放大浮动，锁定后收回小框。cardBlue/cardRed 底纹逐卡片铺设，高亮使用该侧配色。英雄小框和放大框素材由应用独立图库提供，升级应用后即可使用；包内无需重复放入英雄图片。\n\n内置风格包，可独立导入或用于制作派生美术。派生包请修改 manifest.json 的 id、name 和 version。图片、配色与固定版式共同形成节目外观，赛事数据继续动态绘制。先准备到预监，检查后 TAKE。\n`);
  return writeStyleZip(files);
}

interface StoredPack { manifest: StylePack; hashes: Record<string, string>; revision: string }
function revisionFor(manifest: StylePack, hashes: Record<string, string>) { return digest(JSON.stringify({ manifest, hashes })); }

export class StylePackStore {
  private installed = new Map<string, StoredPack>();
  private importing = false;
  private removedBuiltins = new Set<string>();
  readonly warnings: string[] = [];
  constructor(readonly directory: string) {}
  private key(ref: Pick<StylePackRef, 'id' | 'revision'>) { return `${ref.id}--${ref.revision}`; }
  async initialize(): Promise<void> {
    // Fail before startup on an incomplete application package; do not silently lose shipped art.
    for (const pack of BUILTIN_RUNTIME_STYLES) for (const id of Object.keys(pack.assets)) builtinAsset(pack, id);
    await mkdir(this.directory, { recursive: true });
    try {
      const removed: unknown = JSON.parse(await readFile(path.join(this.directory, 'removed-builtins.json'), 'utf8'));
      // Keep historical revision tombstones readable when a later release changes its built-in catalog.
      if (!Array.isArray(removed) || removed.length > 512 || removed.some(key => typeof key !== 'string' || !/^[a-z][a-z0-9-]{0,47}--[a-f0-9]{64}$/.test(key) || key === this.key(BUILTIN_STYLE_REF))) throw new Error('删除记录无效');
      this.removedBuiltins = new Set(removed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('内置风格删除记录无法读取，请检查数据目录');
    }
    for (const entry of (await readdir(this.directory, { withFileTypes: true })).filter(e => e.isDirectory() && /^[a-z][a-z0-9-]{0,47}--[a-f0-9]{64}$/.test(e.name)).slice(0, 50)) {
      if (entry.name.startsWith('jianlou--')) continue; // Retired package is not installed or advertised.
      try {
        const dir = path.join(this.directory, entry.name), bytes = await readFile(path.join(dir, 'record.json'));
        if (bytes.length > 256 * 1024) throw new Error('记录过大');
        const stored = JSON.parse(bytes.toString()) as StoredPack, manifest = validateStyleManifest(stored.manifest), hashes: Record<string, string> = {};
        for (const file of Object.values(manifest.assets)) { const bytes = await readFile(path.join(dir, file)); if (bytes.length > 8 * 1024 * 1024) throw new Error('图片过大'); hashes[file] = digest(bytes); }
        const revision = revisionFor(manifest, hashes);
        if (manifest.id === 'jianlou' || revision !== stored.revision || this.key({ id: manifest.id, revision }) !== entry.name) throw new Error('文件校验失败');
        if (!builtinStyle({ id: manifest.id, revision })) this.installed.set(entry.name, { manifest, hashes, revision });
      } catch { this.warnings.push(`风格包 ${entry.name.slice(0, 48)} 已损坏，暂不可用；请重新导入原包`); }
    }
  }
  list(): StylePackSummary[] { return [...BUILTIN_RUNTIME_STYLES.filter(p => !this.removedBuiltins.has(this.key(p))).map(styleSummary), ...[...this.installed.values()].map(s => styleSummary(this.runtime(s)))]; }
  get(ref: StylePackRef): RuntimeStylePack {
    if (!validStyleRef(ref)) throw new Error('风格包引用无效');
    const builtin = builtinStyle(ref); if (builtin && !this.removedBuiltins.has(this.key(ref))) return builtin;
    const pack = this.installed.get(this.key(ref)); if (!pack) throw new Error('风格包不存在或已损坏，请重新导入');
    return this.runtime(pack);
  }
  private runtime(stored: StoredPack): RuntimeStylePack {
    const manifest = stored.manifest;
    return { ...manifest, revision: stored.revision, builtin: false, assets: Object.fromEntries(Object.keys(manifest.assets).map(id => [id, `/api/style-packs/${manifest.id}/${stored.revision}/assets/${id}`])) };
  }
  async asset(ref: StylePackRef, id: string): Promise<Buffer> {
    this.get(ref); if (builtinStyle(ref)) return builtinAsset(ref, id);
    const stored = this.installed.get(this.key(ref)), file = stored?.manifest.assets[id];
    if (!file || !identifier.test(id)) throw new Error('贴图不存在');
    const bytes = await readFile(path.join(this.directory, this.key(ref), file));
    if (digest(bytes) !== stored!.hashes[file]) throw new Error('贴图已损坏，请重新导入风格包');
    return bytes;
  }
  async export(ref: StylePackRef): Promise<Buffer> {
    this.get(ref); if (builtinStyle(ref)) return builtinStyleArchive(ref);
    const stored = this.installed.get(this.key(ref))!, files: Record<string, Buffer> = { 'manifest.json': Buffer.from(JSON.stringify(stored.manifest, null, 2) + '\n') };
    for (const [id, file] of Object.entries(stored.manifest.assets)) files[file] = await this.asset(ref, id);
    return writeStyleZip(files);
  }
  async import(input: Buffer): Promise<StylePackSummary> {
    if (this.importing) throw new Error('已有风格包正在处理，请完成后重试');
    this.importing = true;
    try { return await this.importArchive(input); } finally { this.importing = false; }
  }
  async remove(ref: StylePackRef): Promise<void> {
    if (this.importing) throw new Error('已有风格包正在处理，请完成后重试');
    const pack = this.get(ref), key = this.key(ref);
    if (pack.id === BUILTIN_STYLE_REF.id && pack.revision === BUILTIN_STYLE_REF.revision) throw new Error('默认风格用于安全回退，需保留');
    this.importing = true;
    try {
      if (pack.builtin) {
        const removed = new Set([...this.removedBuiltins, key]);
        await writeDurableState(path.join(this.directory, 'removed-builtins.json'), [...removed]);
        this.removedBuiltins = removed;
      } else {
        // The validated reference and registered key restrict deletion to this one installed revision.
        await rm(path.join(this.directory, key), { recursive: true, force: true });
        this.installed.delete(key);
      }
    } finally { this.importing = false; }
  }
  private async importArchive(input: Buffer): Promise<StylePackSummary> {
    const entries = await readStyleZip(input), raw = entries.get('manifest.json')!;
    const manifest = validateStyleManifest(JSON.parse(raw.toString('utf8')));
    const claimed = new Set(['manifest.json', 'README.md', ...Object.values(manifest.assets)]);
    for (const filename of entries.keys()) if (!claimed.has(filename)) throw new Error(`存在未声明的素材：${filename}`);
    if (manifest.id === 'jianlou') throw new Error('简陋包已退役，请使用冰川极光或其他风格包');
    const files: Record<string, Buffer> = {}, hashes: Record<string, string> = {}; let pixels = 0, bytes = 0;
    for (const [id, file] of Object.entries(manifest.assets)) {
      const input = entries.get(file); if (!input) throw new Error(`缺少贴图：${file}`);
      const extension = path.extname(file).slice(1).replace('jpg', 'jpeg');
      const kind = input.length >= 12 && input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png' : input.length >= 3 && input[0] === 255 && input[1] === 216 ? 'jpeg' : input.length >= 12 && input.toString('ascii',0,4) === 'RIFF' && input.toString('ascii',8,12) === 'WEBP' ? 'webp' : undefined;
      if (kind !== extension) throw new Error(`贴图格式与文件扩展名不符：${file}`);
      const image = sharp(input, { failOn: 'warning', limitInputPixels: 4096 * 4096 });
      const meta = await image.metadata();
      if (!['png', 'jpeg', 'webp'].includes(meta.format ?? '') || extension !== meta.format || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height || meta.width > 4096 || meta.height > 4096) throw new Error(`贴图格式、尺寸或帧数无效：${file}`);
      pixels += meta.width * meta.height; if (pixels > 64 * 1024 * 1024) throw new Error('贴图总像素数超过 64M');
      // Decode and re-encode all inputs; metadata and trailing payloads never reach a browser.
      const png = await image.rotate().png().toBuffer(); bytes += png.length;
      if (png.length > 8 * 1024 * 1024 || bytes > 40 * 1024 * 1024) throw new Error('规范化贴图超出容量限制');
      const filename = `assets/${id}.png`; manifest.assets[id] = filename; files[filename] = png; hashes[filename] = digest(png);
    }
    const revision = revisionFor(manifest, hashes), stored = { manifest, hashes, revision }, key = this.key({ id: manifest.id, revision });
    const builtin = builtinStyle({ id: manifest.id, revision });
    if (builtin) {
      if (this.removedBuiltins.has(key)) {
        const removed = new Set(this.removedBuiltins); removed.delete(key);
        await writeDurableState(path.join(this.directory, 'removed-builtins.json'), [...removed]);
        this.removedBuiltins = removed;
      }
      return styleSummary(builtin);
    }
    if (this.installed.has(key)) return styleSummary(this.runtime(this.installed.get(key)!));
    if (this.installed.size >= 50) throw new Error('已安装 50 个风格版本，请先在风格包管理中删除闲置版本');
    const temporary = path.join(this.directory, `.import-${randomUUID()}`), destination = path.join(this.directory, key);
    try {
      await mkdir(path.join(temporary, 'assets'), { recursive: true });
      for (const [file, data] of Object.entries(files)) await writeFile(path.join(temporary, file), data, { flag: 'wx' });
      await writeFile(path.join(temporary, 'record.json'), JSON.stringify(stored) + '\n', { flag: 'wx' });
      // A previously corrupt copy is replaced only by a fully validated copy of the same content hash.
      await rm(destination, { recursive: true, force: true });
      await rename(temporary, destination);
      this.installed.set(key, stored);
    } catch (error) { await rm(temporary, { recursive: true, force: true }).catch(() => {}); throw error; }
    return styleSummary(this.runtime(stored));
  }
}
