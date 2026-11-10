import test from "node:test";
import assert from "node:assert/strict";
import { initialState, mealEntry, type Meal } from "../src/domain";
import {
  fmtCalories,
  historicalCalorieDetails,
  recipeCalorieDetails,
} from "../src/meal-calorie-details";

test("calorie details: two-decimal display, serving snapshot and old recipes", () => {
  assert.equal(fmtCalories(697.573584174368), "697,57");
  assert.equal(fmtCalories(1.999), "2");
  assert.equal(fmtCalories(1258.1), "1258,1");
  const state = initialState();
  const food = {
    ...state.foods[0],
    id: "pasta",
    referenceUnit: "g",
    kcalPer100: 350,
  };
  const meal: Meal = {
    id: "meal",
    name: "Pâtes",
    portions: 4,
    ingredients: [
      { id: "p", foodId: food.id, quantity: 200, isVariable: false },
    ],
    cachedCalories: 700,
    cachedProtein: 0,
    cachedCarbs: 0,
    cachedFat: 0,
    isFavorite: false,
    usageCount: 0,
    createdAt: 1,
  };
  const entry = mealEntry(meal, [food], "2026-11-10");
  assert.equal(entry.calorieDetails?.[0].calories, 175);
  assert.equal(entry.calorieDetails?.[0].quantity, 50);
  const changed = { ...food, kcalPer100: 999 };
  assert.equal(
    historicalCalorieDetails(entry, [meal], [changed]).parts[0].calories,
    175,
  );
  meal.calorieDetails = recipeCalorieDetails(meal, [food]);
  assert.equal(recipeCalorieDetails(meal, [changed])?.[0].calories, 700);
  const legacy = { ...entry, calorieDetails: undefined };
  assert.equal(
    historicalCalorieDetails(legacy, [meal], [food]).reconstructed,
    true,
  );
  assert.equal(
    historicalCalorieDetails(legacy, [meal], [food]).parts[0].calories,
    175,
  );
  assert.deepEqual(historicalCalorieDetails(legacy, [], []).parts, []);
});
