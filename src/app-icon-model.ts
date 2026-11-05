import { defaultHaloColor, isPresetAccent } from "./appearance-presets";
export const iconBackground = "#17181e";
export const iconVersion = "v1";
export const iconSizes = [32, 180, 192, 512] as const;
export function iconAccent(value?: string) {
  return value && isPresetAccent(value)
    ? value.toLowerCase()
    : defaultHaloColor;
}
export function iconDirectory(value?: string) {
  return `assets/app-icons/${iconVersion}/${iconAccent(value).slice(1)}/`;
}
export function iconSvg(source: string, accent: string) {
  const color = iconAccent(accent);
  const dark =
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(parseInt(color.slice(i, i + 2), 16) * 0.45)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  if (
    !source.includes('fill="#f6f5f0"') ||
    !source.includes('fill="#6255bd"') ||
    !source.includes('stroke="#fff"')
  )
    throw new Error(
      "Le logo source a changé : vérifier les zones de couleur avant de régénérer les icônes.",
    );
  return source
    .replace('fill="#f6f5f0"', `fill="${iconBackground}"`)
    .replace('fill="#6255bd"', `fill="${dark}"`)
    .replace('stroke="#fff"', `stroke="${color}"`);
}
export function iconManifest(appBase: string, iconsBase: string) {
  return {
    id: appBase,
    name: "Kalo",
    short_name: "Kalo",
    lang: "fr",
    start_url: appBase,
    scope: appBase,
    display: "standalone",
    background_color: "#f6f5f0",
    theme_color: "#f6f5f0",
    icons: [192, 512].map((size) => ({
      src: `${iconsBase}icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any",
    })),
  };
}
