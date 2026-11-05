import {
  copyFile,
  cp,
  writeFile,
  readFile,
  mkdir,
  readdir,
  unlink,
} from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
// Keep app.html as the development entry. index.html is ready for any static host.
await copyFile("dist/app.html", "dist/index.html");
await copyFile("dist/index.html", "index.html");
const html = await readFile("dist/index.html", "utf8");
const catalog = JSON.parse(
  await readFile("dist/assets/app-icons/v1/catalog.json", "utf8"),
);
for (const variant of catalog) {
  // Safari can read this chosen PNG from real HTML, before JavaScript runs.
  const page = html
    .replace("<head>", '<head><base href="../../">')
    .replace(
      'href="./assets/app-icons/v1/a89ae5/icon-32.png"',
      `href="./${variant.directory}icon-32.png"`,
    )
    .replace(
      'href="./assets/app-icons/v1/a89ae5/icon-180.png"',
      `href="./${variant.directory}icon-180.png"`,
    )
    .replace(
      'href="./manifest.webmanifest"',
      `href="./${variant.directory}manifest.webmanifest"`,
    );
  const directory = `dist/install/${variant.accent.slice(1)}`;
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/index.html`, page);
}
await cp("dist/install", "install", { recursive: true });
await cp("dist/assets", "assets", { recursive: true });
// Do not publish obsolete bundles, which may still embed removed demo content.
const activeAssets = new Set(await readdir("dist/assets"));
const assetsDirectory = resolve("assets");
for (const name of await readdir(assetsDirectory)) {
  if (!/^app-[A-Za-z0-9_-]{8}\.(js|css)$/.test(name) || activeAssets.has(name))
    continue;
  const target = join(assetsDirectory, name);
  if (dirname(target) !== assetsDirectory)
    throw new Error("Invalid generated asset path");
  await unlink(target);
}
await copyFile("dist/manifest.webmanifest", "manifest.webmanifest");
await copyFile("dist/apple-touch-icon.png", "apple-touch-icon.png");
await writeFile(".nojekyll", "");
console.log("Site statique prêt à publier depuis main / (root).");
