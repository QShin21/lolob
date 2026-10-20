/** Pairwise shares exclude the fixed visual gap; missing observations have no inferred share. */
export function matchupGoldShares(blue: unknown, red: unknown): [number, number] | null {
  if (typeof blue !== 'number' || typeof red !== 'number' || !Number.isFinite(blue) || !Number.isFinite(red) || blue < 0 || red < 0 || blue + red === 0) return null;
  const total = blue + red;
  if (Number.isFinite(total)) return [blue / total, red / total];
  const scale = Math.max(blue, red), scaledTotal = blue / scale + red / scale;
  return [blue / scale / scaledTotal, red / scale / scaledTotal];
}
