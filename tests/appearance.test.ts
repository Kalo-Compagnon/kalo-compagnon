import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../src/domain";
import { exportJSON, importJSON } from "../src/transfer";
import { Repository } from "../src/persistence";

test("Apparence : anciens exports acceptés et nouvelles préférences validées", () => {
  const s = initialState();
  assert.equal(importJSON(exportJSON(s)).settings.theme, undefined);
  s.settings.theme = "dark";
  s.settings.haloColor = "#12AbEf";
  assert.deepEqual(importJSON(exportJSON(s)), s);
  assert.throws(
    () =>
      importJSON(
        exportJSON({
          ...s,
          settings: { ...s.settings, haloColor: "red; background: black" },
        }),
      ),
    /couleur du halo/,
  );
  assert.throws(
    () =>
      importJSON(
        JSON.stringify({
          format: "logger-web",
          version: 2,
          state: { ...s, settings: { ...s.settings, theme: "invalid" } },
        }),
      ),
    /thème/,
  );
});

test("Apparence : couleur conservée lors du changement de thème et isolée par compte", async () => {
  const r = new Repository(null);
  await r.load("appearance-a");
  await r.update((s) => {
    s.settings.haloColor = "#128abc";
    s.settings.theme = "light";
  });
  await r.update((s) => {
    s.settings.theme = "dark";
  });
  assert.equal(r.state.settings.haloColor, "#128abc");
  await r.load("appearance-b");
  assert.equal(r.state.settings.haloColor, undefined);
  await r.load("appearance-a");
  assert.equal(r.state.settings.theme, "dark");
  assert.equal(r.state.settings.haloColor, "#128abc");
});
