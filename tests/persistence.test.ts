import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Repository } from "../src/persistence";
test("Transfert local confirmé : conserve les données du compte et évite les doublons", async () => {
  const local = new Repository(null);
  await local.load('guest');
  await local.update(s => {
    s.settings.basal=1850;
    s.entries.push({id:'import-local',timestamp:1,type:'food',foodName:'Local',calories:100});
  });
  const account=new Repository(null);
  await account.load('migration-account');
  await account.update(s => {
    s.settings.basal=0;
    s.entries.push({id:'existing-cloud',timestamp:2,type:'food',foodName:'Compte',calories:200});
  });
  await account.mergeGuest();
  await account.mergeGuest();
  assert.equal(account.state.settings.basal,1850);
  assert.equal(account.state.entries.length,2);
  await local.load('guest');
  assert.equal(local.state.entries.length,1);
});
test("Un aliment de base personnalisé par import conserve ses taux après redémarrage", async () => {
  const r = new Repository();
  await r.load("custom-seed-import");
  const id = r.state.foods[0].id;
  await r.update((s) => {
    const food = s.foods.find((f) => f.id === id)!;
    food.isCustom = true;
    food.kcalPer100 = 123.5;
    food.usageCount = 0;
    food.isFavorite = false;
  });
  const restarted = new Repository();
  await restarted.load("custom-seed-import");
  assert.equal(
    restarted.state.foods.find((f) => f.id === id)!.kcalPer100,
    123.5,
  );
});
test("Modifier un enregistrement synchronisé crée bien une écriture en attente", async () => {
  const r = new Repository();
  await r.load("edit-synced");
  await r.update((s) => {
    s.days["2026-10-01"] = { steps: 1000 };
  });
  r.docs.forEach((d) => {
    d.pending = false;
    d.revision = 1;
  });
  await r.update((s) => {
    s.days["2026-10-01"].steps = 2000;
  });
  assert.equal(r.docs.find((d) => d.key === "day/2026-10-01")!.pending, true);
  const snapshot = r.state;
  snapshot.days["2026-10-01"].steps = 9000;
  assert.equal(r.state.days["2026-10-01"].steps, 2000);
});
test("IndexedDB : redémarrage, isolation des comptes, suppression persistante", async () => {
  const r = new Repository();
  await r.load("test-a");
  await r.update((s) => {
    s.settings.deficitGoal = 650;
    s.entries.push({
      id: "1",
      timestamp: Date.now(),
      type: "extra",
      foodName: "Extra",
      calories: null,
    });
  });
  const restarted = new Repository();
  await restarted.load("test-a");
  assert.equal(restarted.state.settings.deficitGoal, 650);
  assert.equal(restarted.state.entries.length, 1);
  await restarted.load("test-b");
  assert.equal(restarted.state.entries.length, 0);
  await restarted.load("test-a");
  await restarted.update((s) => {
    s.entries = [];
  });
  await r.load("test-a");
  assert.equal(r.state.entries.length, 0);
  assert.equal(r.docs.find((d) => d.key === "entry/1")!.value, null);
});
test("Écritures rapprochées sérialisées sans perdre une entrée", async () => {
  const r = new Repository();
  await r.load("test-queue");
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      r.update((s) => {
        s.entries.push({
          id: String(i),
          timestamp: Date.now(),
          type: "extra",
          foodName: "Extra",
          calories: i,
        });
      }),
    ),
  );
  assert.equal(r.state.entries.length, 10);
});
