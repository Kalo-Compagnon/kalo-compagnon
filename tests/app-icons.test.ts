import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  accentPresets,
  defaultHaloColor,
  isPresetAccent,
} from "../src/appearance-presets";
import {
  iconAccent,
  iconDirectory,
  iconManifest,
  iconSvg,
  iconBackground,
  iconSizes,
} from "../src/app-icon-model";

const source = readFileSync(
  new URL("../public/assets/icon.svg", import.meta.url),
  "utf8",
);
test("Icônes : cinq accents uniquement, casse et anciennes couleurs gérées", () => {
  assert.equal(accentPresets.length, 5);
  for (const [, color] of accentPresets)
    assert.equal(iconAccent(color.toUpperCase()), color);
  assert.equal(isPresetAccent("#128abc"), false);
  assert.equal(iconAccent("#128abc"), defaultHaloColor);
  assert.equal(iconAccent("invalid"), defaultHaloColor);
  assert.equal(iconAccent(), defaultHaloColor);
});
test("Icônes : géométrie originale intacte, fond sombre et deux nuances d’accent", () => {
  const geometry = (svg: string) =>
    svg.replace(/(fill|stroke)="#[^"]+"/g, '$1="COLOR"');
  for (const [, color] of accentPresets) {
    const svg = iconSvg(source, color);
    assert.equal(geometry(svg), geometry(source));
    assert.ok(svg.includes(`fill="${iconBackground}"`));
    assert.ok(svg.includes(`stroke="${color}"`));
    assert.ok(svg.includes('opacity=".95"'));
    assert.ok(!svg.includes('stroke="#fff"'));
  }
  assert.throws(() => iconSvg("<svg/>", defaultHaloColor), /logo source/);
  assert.ok(source.includes('fill="#f6f5f0"'), "source originale conservée");
});
test("Icônes : PNG disponibles et identité PWA stable sous GitHub Pages", () => {
  const root = "https://example.test/kalo-compagnon/";
  for (const [, color] of accentPresets) {
    const directory = iconDirectory(color);
    const url = new URL(directory + "manifest.webmanifest", root);
    const manifest = iconManifest("../../../../", "./");
    for (const key of ["id", "start_url", "scope"] as const)
      assert.equal(new URL(manifest[key], url).href, root);
    for (const icon of manifest.icons) {
      assert.ok(new URL(icon.src, url).href.startsWith(root + directory));
      assert.equal(icon.type, "image/png");
    }
    for (const size of iconSizes) {
      const png = readFileSync(
        new URL("../public/" + directory + `icon-${size}.png`, import.meta.url),
      );
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png.readUInt32BE(20), size);
    }
  }
});
