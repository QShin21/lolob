import type { BroadcastState, CustomScene, CustomSceneSource, Scene } from '../shared/types';
import { record, str, ValidationError, scenes } from './state';

export function validateSceneId(value: unknown, state: BroadcastState): Scene {
  if (typeof value !== 'string' || !(scenes.includes(value as typeof scenes[number]) || state.customScenes?.some(s => s.id === value))) throw new ValidationError('场景不存在，请刷新场景库');
  return value as Scene;
}

export function validateCustomScene(value: unknown, state: BroadcastState): CustomScene {
  const v = record(value), id = str(v.id, 90), name = str(v.name, 60).trim();
  if (!/^custom:[a-zA-Z0-9-]{1,70}$/.test(id)) throw new ValidationError('自定义场景 ID 无效');
  if (!name) throw new ValidationError('请填写场景名称');
  if (state.customScenes?.some(s => s.id !== id && s.name === name)) throw new ValidationError('场景名称已存在');
  if (typeof v.background !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v.background)) throw new ValidationError('背景颜色无效');
  if (!Array.isArray(v.sources) || v.sources.length > 24) throw new ValidationError('每个场景最多添加 24 个素材');
  const ids = new Set<string>();
  const sources = v.sources.map(raw => {
    const s = record(raw), sourceId = str(s.id, 80), label = str(s.name, 100).trim();
    if (!sourceId || ids.has(sourceId) || !label) throw new ValidationError('素材名称或 ID 无效');
    ids.add(sourceId);
    const number = (key: string, min: number, max: number) => { const n = s[key]; if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new ValidationError('素材位置或尺寸超出范围'); return n; };
    if (!['contain', 'cover', 'stretch'].includes(String(s.fit)) || typeof s.visible !== 'boolean') throw new ValidationError('素材显示选项无效');
    const result: CustomSceneSource = { id: sourceId, name: label, kind: s.kind as CustomSceneSource['kind'], x: number('x', -1920, 1920), y: number('y', -1080, 1080), width: number('width', 1, 3840), height: number('height', 1, 2160), fit: s.fit as CustomSceneSource['fit'], visible: s.visible };
    if (s.kind === 'image') {
      const asset = state.assets.find(a => a.id === s.assetId);
      if (!asset || !/^\/uploads\/[a-z0-9-]+\.(png|jpg|webp|gif)$/.test(asset.url)) throw new ValidationError('图片素材不存在，请重新上传或选择');
      result.assetId = asset.id;
    } else if (s.kind === 'window') {
      result.window = str(s.window, 2048);
      if (!result.window.trim() || /[\u0000-\u001f]/.test(result.window)) throw new ValidationError('请选择应用窗口');
    } else if (s.kind === 'obs') {
      result.inputName = str(s.inputName, 200);
      if (!result.inputName.trim() || result.inputName.startsWith('RiftCast 自定义')) throw new ValidationError('请选择可用的 OBS 来源');
    } else if (s.kind === 'browser') {
      result.url = validateBrowserSourceUrl(s.url);
    } else throw new ValidationError('不支持的素材类型');
    return result;
  });
  return { id: id as CustomScene['id'], name, background: v.background, sources };
}

export function validateBrowserSourceUrl(value: unknown): string {
  const url = str(value, 4096).trim();
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || /[\u0000-\u0020]/.test(url)) throw new Error();
    return parsed.href;
  } catch { throw new ValidationError('浏览器来源需要完整的 HTTP / HTTPS 地址，凭据请通过服务自身的登录或访问参数配置'); }
}
