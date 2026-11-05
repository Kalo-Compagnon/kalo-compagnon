import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { accentPresets, defaultHaloColor } from "../src/appearance-presets";
import {
  iconDirectory,
  iconManifest,
  iconSizes,
  iconSvg,
} from "../src/app-icon-model";
const source = await readFile("public/assets/icon.svg", "utf8");
for (const [, color] of accentPresets) {
  const directory = `public/${iconDirectory(color)}`;
  assert.equal(
    await readFile(`${directory}logo.svg`, "utf8"),
    iconSvg(source, color),
    "Régénérer les icônes : npm run generate:icons",
  );
  for (const size of iconSizes) {
    const png = await readFile(`${directory}icon-${size}.png`);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  assert.deepEqual(
    JSON.parse(await readFile(`${directory}manifest.webmanifest`, "utf8")),
    iconManifest("../../../../", "./"),
  );
}
assert.deepEqual(
  JSON.parse(await readFile("public/manifest.webmanifest", "utf8")),
  iconManifest("./", iconDirectory(defaultHaloColor)),
);
console.log("Icônes et manifestes des cinq accents vérifiés.");
