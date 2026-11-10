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
      {
        id: "part",
        foodId: food.id,
        quantity: 400,
        isVariable: false,
        weightBasis: "raw",
      },
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
  assert.match(first.note!, /\(cru\/sec\)/);
  state.entries.push(first);
  assert.equal(remainingMealPortions(meal, state.entries), 3);
  state.entries.push(mealEntry(meal, state.foods, "2026-11-11", {}, 0.5));
  assert.equal(remainingMealPortions(meal, state.entries), 2.5);
  for (const restored of [
    importJSON(exportJSON(state)),
    importCSV(exportCSV(state)).state,
  ]) {
    assert.equal(restored.meals[0].ingredients[0].weightBasis, "raw");
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

test("cooked serving weight scales raw nutrition without a cooking multiplier", () => {
  const state = initialState();
  const food = {
    ...state.foods[0],
    id: "dry-pasta",
    name: "Pâtes sèches",
    referenceUnit: "g",
    kcalPer100: 350,
  };
  const meal: Meal = {
    id: "pasta",
    name: "Pâtes",
    portions: 1,
    cookedWeightGrams: 600,
    ingredients: [
      {
        id: "p",
        foodId: food.id,
        quantity: 200,
        isVariable: false,
        weightBasis: "raw",
      },
    ],
    cachedCalories: 700,
    cachedProtein: 0,
    cachedCarbs: 0,
    cachedFat: 0,
    isFavorite: false,
    usageCount: 0,
    createdAt: 1,
  };
  const serving = mealEntry(
    meal,
    [food],
    "2026-11-10",
    {},
    150 / meal.cookedWeightGrams!,
  );
  assert.equal(serving.calories, 175);
  assert.match(serving.note!, /50 g \(cru\/sec\)/);
  assert.equal(
    remainingMealPortions(meal, [serving]) * meal.cookedWeightGrams!,
    450,
  );
});
