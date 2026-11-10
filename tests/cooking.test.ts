import test from "node:test";
import assert from "node:assert/strict";
import { initialState, type Meal } from "../src/domain";
import {
  addMealServing,
  estimateCookedWeight,
  finishMeal,
  trackingWeight,
  servedWeight,
} from "../src/cooking";
import { exportJSON, importJSON, exportCSV, importCSV } from "../src/transfer";

function fixture() {
  const state = initialState();
  const pasta = {
    ...state.foods[0],
    id: "pasta",
    referenceUnit: "g",
    cookingType: "pasta" as const,
    kcalPer100: 350,
  };
  const cream = {
    ...pasta,
    id: "cream",
    cookingType: undefined,
    referenceUnit: "ml",
  };
  state.foods.push(pasta, cream);
  const meal: Meal = {
    id: "batch",
    name: "Plat",
    portions: 1,
    ingredients: [
      { id: "p", foodId: pasta.id, quantity: 200, isVariable: false },
      { id: "c", foodId: cream.id, quantity: 100, isVariable: false },
    ],
    cachedCalories: 900,
    cachedProtein: 30,
    cachedCarbs: 100,
    cachedFat: 25,
    isFavorite: false,
    usageCount: 0,
    createdAt: 1,
  };
  state.meals.push(meal);
  return { state, meal };
}

test("unweighed meal: estimate, persist across days, finish and recalculate every serving", () => {
  const { state, meal } = fixture();
  assert.equal(estimateCookedWeight(meal, state.foods), 574);
  addMealServing(state, meal, "2026-11-10", 200);
  const provisional = state.entries[0].calories!;
  assert.equal(state.entries[0].mealEstimate, true);
  assert.equal(meal.portionTracking?.finished, undefined);
  for (const restored of [
    importJSON(exportJSON(state)),
    importCSV(exportCSV(state)).state,
  ]) {
    const m = restored.meals[0];
    assert.equal(
      restored.foods.find((f) => f.id === "pasta")?.cookingType,
      "pasta",
    );
    assert.equal(trackingWeight(m, restored.entries), 574);
    addMealServing(restored, m, "2026-11-11", 300, undefined, true);
    assert.equal(m.cookedWeightGrams, 500);
    assert.equal(m.portionTracking?.finished, true);
    assert.ok(Math.abs(restored.entries[0].calories! - 360) < 0.001);
    assert.notEqual(restored.entries[0].calories, provisional);
    assert.equal(restored.entries[0].mealEstimate, false);
    assert.ok(
      Math.abs(restored.entries.reduce((n, e) => n + e.calories!, 0) - 900) <
        0.001,
    );
    assert.ok(
      Math.abs(restored.entries.reduce((n, e) => n + e.proteinGrams!, 0) - 30) <
        0.001,
    );
    assert.equal(servedWeight(m, restored.entries), 500);
    assert.throws(() => addMealServing(restored, m, "2026-11-12", 1));
  }
});

test("estimate exceeded stays provisional until explicitly finished; measured weight is respected", () => {
  const { state, meal } = fixture();
  addMealServing(state, meal, "2026-11-10", 600);
  assert.equal(meal.portionTracking?.finished, undefined);
  assert.equal(state.entries[0].mealEstimate, true);
  addMealServing(state, meal, "2026-11-11", 200);
  assert.equal(trackingWeight(meal, state.entries), 800);
  finishMeal(state, meal);
  assert.equal(meal.cookedWeightGrams, 800);
  const measured = fixture();
  addMealServing(measured.state, measured.meal, "2026-11-10", 200, 1000);
  assert.ok(Math.abs(measured.state.entries[0].calories! - 180) < 0.001);
  assert.equal(measured.state.entries[0].mealEstimate, false);
  assert.throws(() =>
    addMealServing(measured.state, measured.meal, "2026-11-10", 900),
  );
  addMealServing(measured.state, measured.meal, "2026-11-11", 800);
  assert.equal(measured.meal.portionTracking?.finished, true);
});

test("rice, unit weights, unweighable ingredients and invalid servings", () => {
  const { state, meal } = fixture();
  const pasta = state.foods.find((f) => f.id === "pasta")!;
  pasta.cookingType = "rice";
  assert.equal(estimateCookedWeight(meal, state.foods), 654);
  pasta.referenceUnit = "unité";
  assert.equal(estimateCookedWeight(meal, state.foods), null);
  assert.throws(() => addMealServing(state, meal, "2026-11-10", 100));
  for (const grams of [0, -1, NaN, Infinity])
    assert.throws(() => addMealServing(state, meal, "2026-11-10", grams));
  pasta.unitWeightGrams = 2;
  assert.equal(estimateCookedWeight(meal, state.foods), 1208);
});
