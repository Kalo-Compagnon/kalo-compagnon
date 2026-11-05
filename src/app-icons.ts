import { iconDirectory, iconAccent } from "./app-icon-model";
export function applicationBaseUrl() {
  return new URL(import.meta.env.BASE_URL, document.baseURI);
}
export function updateApplicationIcons(accent?: string) {
  const base = applicationBaseUrl();
  const directory = new URL(iconDirectory(accent), base);
  const set = (rel: string, file: string, type: string, sizes?: string) => {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      document.head.append(link);
    }
    const url = new URL(file, directory).href;
    if (link.href !== url) link.href = url;
    link.type = type;
    if (sizes) link.setAttribute("sizes", sizes);
    link.dataset.accent = iconAccent(accent);
  };
  set("icon", "icon-32.png", "image/png", "32x32");
  set("apple-touch-icon", "icon-180.png", "image/png", "180x180");
  set("manifest", "manifest.webmanifest", "application/manifest+json");
}
export function installationPage(accent?: string) {
  return new URL(
    `install/${iconAccent(accent).slice(1)}/index.html`,
    applicationBaseUrl(),
  ).href;
}
