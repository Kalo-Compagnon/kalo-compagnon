import test from "node:test";
import assert from "node:assert/strict";
import demo from "../src/duo-demo.json";
import { validateState } from "../src/transfer";

test("Démonstration publique : profils anonymes et aucune identité personnelle", () => {
  assert.equal(demo.fictional, true);
  assert.deepEqual(
    demo.profiles.map((profile) => profile.settings.displayName),
    ["Profil A", "Profil B"],
  );
  for (const profile of demo.profiles) {
    const state = validateState(profile);
    assert.equal(state.settings.birthDate, undefined);
    assert.equal(state.settings.age, 0);
    assert.equal(state.settings.height, 0);
    assert.equal(state.settings.weight, 0);
  }
});
