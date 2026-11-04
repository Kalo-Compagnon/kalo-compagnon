const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (foreground: string, background: string, amount: number) => {
  const back = channels(background);
  return (
    "#" +
    channels(foreground)
      .map((v, i) =>
        Math.round(v * amount + back[i] * (1 - amount))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
};
const luminance = (hex: string) =>
  channels(hex)
    .map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function accentPalette(color: string, dark: boolean) {
  const brand = /^#[0-9a-f]{6}$/i.test(color) ? color : "#a89ae5";
  const card = dark ? "#23242e" : "#ffffff";
  const bg = dark ? "#17181e" : "#f6f5f0";
  const soft = mix(brand, card, dark ? 0.22 : 0.14);
  const softAlt = mix(brand, card, dark ? 0.14 : 0.09);
  const softThird = mix(brand, card, dark ? 0.28 : 0.19);
  const edge = dark ? "#ffffff" : "#000000";
  let accent = brand;
  for (
    let i = 1;
    i <= 100 &&
    [card, bg, soft, softAlt, softThird].some((b) => contrast(accent, b) < 4.5);
    i++
  )
    accent = mix(edge, brand, i / 100);
  const onBrand =
    contrast("#ffffff", brand) >= contrast("#000000", brand)
      ? "#ffffff"
      : "#000000";
  return {
    "--brand": brand,
    "--on-brand": onBrand,
    "--brand-hover": mix(
      onBrand === "#ffffff" ? "#000000" : "#ffffff",
      brand,
      0.12,
    ),
    "--accent": accent,
    "--pink": dark ? "#f2a09a" : "#b23b3b",
    "--green": dark ? "#a8d596" : "#397239",
    "--intake-soft": dark ? "#3d292d" : "#f9e9e6",
    "--expense-soft": dark ? "#29372b" : "#eaf2e5",
    "--summary-surface": mix(brand, card, dark ? 0.12 : 0.09),
    "--pastel-purple": soft,
    "--pastel-green": softAlt,
    "--pastel-peach": softThird,
    "--chart-intake": dark ? "#f0837b" : "#d65353",
    "--chart-expense": dark ? "#a0c87c" : "#729951",
    "--canvas-label": soft,
  };
}
