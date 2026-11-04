import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Repository } from "../src/persistence";
import { initialState } from "../src/domain";
import { exportJSON, importJSON } from "../src/transfer";

test("Deux profils conservent leurs réglages et historiques après changement de compte", async () => {
  const repo = new Repository(null);
  await repo.load("profile-first");
  await repo.update((s) => {
    s.settings.displayName = "Premier";
    s.settings.profileCompleted = true;
    s.days["2026-11-04"] = { weightKg: 80 };
  });
  await repo.load("profile-second");
  assert.equal(repo.state.settings.displayName, undefined);
  assert.deepEqual(repo.state.days, {});
  await repo.update((s) => {
    s.settings.displayName = "Deuxième";
    s.settings.profileCompleted = true;
    s.settings.sex = "female";
    s.days["2026-11-04"] = { weightKg: 60 };
  });
  const restarted = new Repository(null);
  await restarted.load("profile-first");
  assert.equal(restarted.state.settings.displayName, "Premier");
  assert.equal(restarted.state.days["2026-11-04"].weightKg, 80);
  await restarted.load("profile-second");
  assert.equal(restarted.state.settings.sex, "female");
  assert.equal(restarted.state.days["2026-11-04"].weightKg, 60);
});

test("Sauvegardes : profil conservé, anciens fichiers acceptés, métadonnées invalides rejetées", () => {
  const state = initialState();
  assert.equal(importJSON(exportJSON(state)).settings.displayName, undefined);
  state.settings.displayName = "Camille";
  state.settings.profileCompleted = true;
  assert.deepEqual(importJSON(exportJSON(state)), state);
  assert.throws(
    () =>
      importJSON(
        exportJSON({
          ...state,
          settings: { ...state.settings, displayName: "x".repeat(61) },
        }),
      ),
    /prénom/,
  );
});
