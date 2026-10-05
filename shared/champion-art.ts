import manifest from './champion-art-catalog.json';
import type { Champion } from './types';

const artwork = new Map(manifest.champions.map(champion => [champion.id, champion]));
export const bundledChampionVersion = manifest.version;
export function bundledChampions(): Champion[] {
  return manifest.champions.map(champion => ({ id: champion.id, key: champion.key, name: champion.name, title: champion.title, tags: champion.tags,
    image: champion.assets.icon.url, splash: champion.assets.lineup.url }));
}
export function localChampionAssets(champions: Champion[]): Champion[] {
  return champions.map(champion => {
    const local = artwork.get(champion.id);
    return local ? { ...champion, image: local.assets.icon.url, splash: local.assets.lineup.url } : champion;
  });
}
export function championArtwork(champion: Champion, variant: 'draft' | 'lineup'): string {
  return artwork.get(champion.id)?.assets[variant].url || champion.splash;
}
