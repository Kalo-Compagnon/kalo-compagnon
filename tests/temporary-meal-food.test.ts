import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { mealEntry, mealTotals, type Food, type Meal } from "../src/domain";
import { docsToState, Repository } from "../src/persistence";
import { sharedMeal } from "../src/shared-meal";
import { exportCSV, exportJSON, importCSV, importJSON } from "../src/transfer";

test("Temporary ingredient survives saving, shared recipe cache and export without entering food catalog", async () => {
  const food: Food = {
    id: "temporary",
    name: "Dessert",
    category: "Autres",
    referenceUnit: "unité",
    kcalPer100: 245.5,
    proteinPer100: 0,
    carbsPer100: 0,
    fatPer100: 0,
    missingNutrients: ["proteinPer100", "carbsPer100", "fatPer100"],
    isCustom: true,
    isFavorite: false,
    usageCount: 0,
  };
  const meal: Meal = {
    id: "recipe",
    name: "Repas",
    ingredients: [
      {
        id: "part",
        foodId: food.id,
        temporaryFood: food,
        quantity: 2,
        isVariable: false,
      },
    ],
    cachedCalories: 491,
    cachedProtein: 0,
    cachedCarbs: 0,
    cachedFat: 0,
    isFavorite: false,
    usageCount: 0,
    createdAt: 1,
  };
  assert.equal(mealTotals(meal.ingredients, [])[0], 491);
  const entry = mealEntry(meal, [], "2026-11-17");
  assert.equal(entry.calories, 491);
  assert.equal(entry.calorieDetails?.[0].name, "Dessert");
  assert.equal(entry.proteinGrams, undefined);
  assert.equal(sharedMeal(meal, []), null);
  const repo = new Repository();
  await repo.load("temporary-ingredient-test");
  await repo.update((s) => {
    s.meals.push(meal);
    s.entries.push(entry);
  });
  const stored = repo.state;
  assert(!stored.foods.some((f) => f.id === food.id));
  const copy = new Repository();
  await copy.load("temporary-ingredient-test");
  assert.equal(
    mealTotals(copy.state.meals[0].ingredients, copy.state.foods)[0],
    491,
  );
  const staleShared = {
    ...meal,
    name: "Ancienne recette",
    ingredients: [],
    ingredientFoods: [],
  };
  const merged = docsToState([
    { key: "meal/recipe", value: meal },
    { key: "recipe/recipe", value: staleShared },
  ] as Parameters<typeof docsToState>[0]);
  assert.equal(merged.meals[0].name, "Repas");
  assert.equal(merged.meals[0].ingredients.length, 1);
  for (const restored of [
    importJSON(exportJSON(stored)),
    importCSV(exportCSV(stored)).state,
  ]) {
    assert.equal(
      mealTotals(restored.meals[0].ingredients, restored.foods)[0],
      491,
    );
    assert(!restored.foods.some((f) => f.id === food.id));
  }
});
