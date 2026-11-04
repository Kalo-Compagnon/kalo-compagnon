import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, activity, expense, steps, dayKey } from "../src/domain";
import { Repository } from "../src/persistence";
import { exportJSON, importJSON, exportCSV, importCSV } from "../src/transfer";

test("Kcal manuelles : ajout à la dépense, indépendant des pas et des FIT", () => {
  const state = initialState();
  state.settings.basal = 1700;
  const day = {
    steps: 1000,
    fitSteps: 2000,
    fitCoveredSteps: 2000,
    fitCalories: 400,
    manualActivityCalories: 125.5,
  };
  state.days[dayKey()] = day;
  assert.equal(steps(day), 3300);
  assert.equal(activity(day), 584);
  assert.equal(expense(state, dayKey()), 2284);
  day.manualActivityCalories = 0;
  assert.equal(activity(day), 458.5);
});

test("Kcal manuelles : sauvegarde JSON/CSV exacte et valeurs invalides refusées", () => {
  const state = initialState();
  state.days[dayKey()] = { manualActivityCalories: 150.5 };
  assert.deepEqual(importJSON(exportJSON(state)), state);
  assert.deepEqual(importCSV(exportCSV(state)).state, state);
  assert.match(exportCSV(state), /manual_activity_kcal/);
  state.days[dayKey()].manualActivityCalories = -1;
  assert.throws(() => importJSON(exportJSON(state)), /manualActivityCalories/);
});

test("Kcal manuelles : remplacement, rechargement et isolation par compte", async () => {
  const repo = new Repository(null),
    day = dayKey();
  await repo.load("manual-activity-a");
  await repo.update((s) => {
    s.days[day] = { manualActivityCalories: 100 };
  });
  await repo.update((s) => {
    s.days[day].manualActivityCalories = 200;
  });
  const restarted = new Repository(null);
  await restarted.load("manual-activity-a");
  assert.equal(restarted.state.days[day].manualActivityCalories, 200);
  await restarted.load("manual-activity-b");
  assert.equal(restarted.state.days[day], undefined);
});
