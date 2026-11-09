import test from "node:test";
import assert from "node:assert/strict";
import { initialState, removeDay } from "../src/domain";
test("Supprimer une journée conserve les autres journées et les recettes", () => {
  const state = initialState(),
    day = "2026-11-08",
    other = "2026-11-07";
  state.days[day] = {
    basal: 1500,
    steps: 1000,
    weightKg: 80,
    measurements: { Poitrine: 95 },
  };
  state.days[other] = { basal: 1600, steps: 2000, weightKg: 79 };
  state.entries = [day, other].map((date, i) => ({
    id: date,
    timestamp: new Date(`${date}T12:00:00Z`).getTime(),
    type: "food",
    foodName: "Repas",
    calories: 100 + i,
  }));
  state.physical = state.entries.map((e) => ({
    id: e.id,
    timestamp: e.timestamp,
    waistCm: 80,
  }));
  const foods = structuredClone(state.foods);
  removeDay(state, day);
  assert.deepEqual(state.days[day], { isDeleted: true });
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].id, other);
  assert.equal(state.physical.length, 1);
  assert.equal(state.physical[0].id, other);
  assert.equal(state.days[other].steps, 2000);
  assert.deepEqual(state.foods, foods);
});
