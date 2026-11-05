import test from "node:test";
import assert from "node:assert/strict";
import { privateSharing, relativeWeights } from "../src/duo-model";
import { initialState } from "../src/domain";
import { exportJSON, importJSON } from "../src/transfer";

test("Duo fictif : activation explicite et compatibilité des sauvegardes", () => {
  const state = initialState();
  assert.equal(importJSON(exportJSON(state)).settings.duoDemo, undefined);
  state.settings.duoDemo = true;
  assert.equal(importJSON(exportJSON(state)).settings.duoDemo, true);
  const invalid = JSON.parse(exportJSON(state));
  invalid.state.settings.duoDemo = "true";
  assert.throws(() => importJSON(JSON.stringify(invalid)), /démonstration Duo/);
});

test("Duo : cinq catégories privées par défaut, autorisations indépendantes", () => {
  const a = privateSharing(),
    b = privateSharing();
  assert.equal(Object.keys(a).length, 5);
  assert.ok(Object.values(a).every((v) => v === false));
  a.weight = true;
  assert.equal(b.weight, false);
  assert.equal(a.measurements, false);
});
test("Duo : variations relatives depuis la première pesée réelle, sans interpolation", () => {
  assert.deepEqual(relativeWeights({}), []);
  const result = relativeWeights({
    "2026-10-10": { weightKg: 110 },
    "2026-10-01": { weightKg: 100 },
    "2026-10-02": {},
    "2026-09-01": { weightKg: 0 },
    "2026-08-01": { weightKg: NaN },
    "2026-10-20": { weightKg: 90 },
  });
  assert.deepEqual(
    result.map((r) => r.date),
    ["2026-10-01", "2026-10-10", "2026-10-20"],
  );
  assert.equal(result[0].percent, 0);
  assert.ok(Math.abs(result[1].percent - 10) < 1e-10);
  assert.ok(Math.abs(result[2].percent + 10) < 1e-10);
});
