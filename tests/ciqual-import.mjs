import test from "node:test";
import assert from "node:assert/strict";
import { prepareCiqual, ciqualValue } from "../scripts/prepare-ciqual.mjs";
test("Ciqual: export officiel CSV, décimales, guillemets, absence et doublons", () => {
  const csv =
    'alim_code;alim_nom_fr;Energie, Règlement UE (kcal/100 g);Protéines (g/100 g)\r\n42;"Aliment; test";12,5;traces\r\n';
  const rows = prepareCiqual(csv, "2025");
  assert.equal(rows[0].name, "Aliment; test");
  assert.equal(rows[0].kcalPer100, 12.5);
  assert.equal(rows[0].proteinPer100, null);
  assert.equal(rows[0].source, "ciqual");
  assert.equal(rows[0].sourceVersion, "2025");
  assert.throws(() => prepareCiqual(csv + "42;Doublon;1;0", "2025"));
  for (const v of ["", "-", "< 0,1", "traces", "-2"])
    assert.equal(ciqualValue(v), null);
  assert.equal(ciqualValue("0"), 0);
  assert.throws(() => prepareCiqual("nom;kcal\nTest;1", "2025"));
});
