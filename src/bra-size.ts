// French size grid: https://chantelle.com/fr/guide-des-tailles
// Round measurements to whole centimetres to use the published integer ranges.
export function frenchBraSize(bust: number, underbust: number): string | null {
  if (
    !Number.isFinite(bust) ||
    !Number.isFinite(underbust) ||
    bust <= underbust ||
    underbust <= 0
  )
    return null;
  const chest = Math.round(bust),
    bandMeasure = Math.round(underbust);
  if (bandMeasure < 63 || bandMeasure > 122) return null;
  const bandIndex = Math.floor((bandMeasure - 63) / 5);
  const cupIndex = Math.floor((chest - (76 + bandIndex * 5)) / 3);
  if (cupIndex < 0 || cupIndex > 9) return null;
  return `${80 + bandIndex * 5}${"ABCDEFGHIJ"[cupIndex]}`;
}
