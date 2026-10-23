export interface ResourceProgress { phase: 'idle' | 'catalog' | 'champions' | 'assets' | 'complete' | 'error'; version?: string; completed: number; total: number; failed: number; detail: string; updatedAt?: string }
export interface ResourceCleanup { files: number; bytes: number; protectedVersions: string[]; threshold: string; removed: boolean }
export interface ResourceVersions { versions: string[]; gameVersion: string; realm?: string; realmVersion?: string; recommended?: string; detail: string }
export const resourceRealms = ['br','eune','euw','jp','kr','lan','las','na','oce','ru','tr','pbe'] as const;
export function resourceVersionMatch(gameVersion: string, versions: string[]) {
  const match = /^(\d+)\.(\d+)(?:\.|$)/.exec(gameVersion.trim()); if (!match) return undefined;
  const prefix = `${Number(match[1])}.${Number(match[2])}.`;
  return versions.filter(v => /^\d+\.\d+\.\d+$/.test(v) && v.startsWith(prefix)).sort((a,b)=>Number(b.split('.')[2])-Number(a.split('.')[2]))[0];
}
