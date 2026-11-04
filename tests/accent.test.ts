import { test } from "node:test";
import assert from "node:assert/strict";
import { accentPalette, contrast } from "../src/accent";

test("Accent global : couleur choisie exacte et contrastes lisibles en clair et sombre", () => {
  for (const color of [
    "#000000",
    "#ffffff",
    "#ffff00",
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#128abc",
    "#a89ae5",
    "#dc92b7",
  ]) {
    for (const dark of [false, true]) {
      const p = accentPalette(color, dark);
      assert.equal(
        p["--chart-intake"],
        accentPalette("#128abc", dark)["--chart-intake"],
      );
      assert.equal(
        p["--chart-expense"],
        accentPalette("#128abc", dark)["--chart-expense"],
      );
      assert.ok(contrast(p["--pink"], p["--intake-soft"]) >= 4.5);
      assert.ok(contrast(p["--green"], p["--expense-soft"]) >= 4.5);
      assert.ok(contrast(p["--pink"], p["--summary-surface"]) >= 4.5);
      assert.ok(contrast(p["--green"], p["--summary-surface"]) >= 4.5);
      assert.equal(p["--brand"], color);
      assert.ok(contrast(p["--on-brand"], color) >= 4.5);
      assert.ok(contrast(p["--on-brand"], p["--brand-hover"]) >= 4.5);
      for (const background of [
        dark ? "#23242e" : "#ffffff",
        dark ? "#17181e" : "#f6f5f0",
        p["--pastel-purple"],
        p["--pastel-green"],
        p["--pastel-peach"],
      ]) {
        assert.ok(
          contrast(p["--accent"], background) >= 4.5,
          `${color}, ${dark}, ${background}`,
        );
      }
    }
  }
});
