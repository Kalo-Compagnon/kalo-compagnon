import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  mealEntry,
  remainingMealPortions,
  type Meal,
} from "../src/domain";
import { exportJSON, importJSON, exportCSV, importCSV } from "../src/transfer";

test("portions: consumption across days, leftovers, deletion and backup", () => {
  const state = initialState();
  const food = state.foods[0];
  const meal: Meal = {
    id: "batch",
    name: "Plat",
    portions: 4,
    ingredients: [
      { id: "part", foodId: food.id, quantity: 400, isVariable: false },
    ],
    cachedCalories: 800,
    cachedProtein: 40,
    cachedCarbs: 80,
    cachedFat: 20,
    isFavorite: false,
    usageCount: 0,
    createdAt: 1,
  };
  state.meals.push(meal);
  const whole = mealEntry(meal, state.foods, "2026-11-10", {}, 4);
  const first = mealEntry(meal, state.foods, "2026-11-10");
  assert.equal(first.calories, whole.calories! / 4);
  assert.equal(first.proteinGrams, whole.proteinGrams! / 4);
  assert.equal(first.quantityUnit, "portion(s)");
  state.entries.push(first);
  assert.equal(remainingMealPortions(meal, state.entries), 3);
  state.entries.push(mealEntry(meal, state.foods, "2026-11-11", {}, 0.5));
  assert.equal(remainingMealPortions(meal, state.entries), 2.5);
  for (const restored of [
    importJSON(exportJSON(state)),
    importCSV(exportCSV(state)).state,
  ]) {
    assert.equal(
      remainingMealPortions(restored.meals[0], restored.entries),
      2.5,
    );
  }
  state.entries = state.entries.filter((e) => e.id !== first.id);
  assert.equal(remainingMealPortions(meal, state.entries), 3.5);
  assert.equal(
    remainingMealPortions({ ...meal, id: "new-batch" }, state.entries),
    4,
  );
  for (const n of [0, -1, NaN, Infinity, 5])
    assert.throws(() => mealEntry(meal, state.foods, "2026-11-10", {}, n));
  assert.equal(
    mealEntry({ ...meal, ingredients: [] }, [], "2026-11-10").calories,
    200,
  );
  assert.equal(
    mealEntry({ ...meal, portions: undefined }, state.foods, "2026-11-10")
      .calories,
    whole.calories,
  );
});
