import type { Food, Meal } from "./domain";
import { sharedFood } from "./shared-food";

export interface SharedMeal {
  id: string;
  name: string;
  ingredients: Meal["ingredients"];
  ingredientFoods: Partial<Food>[];
  cachedCalories: number;
  cachedProtein: number;
  cachedCarbs: number;
  cachedFat: number;
}

export function sharedMeal(meal: Meal, foods: Food[]): SharedMeal | null {
  if (!meal.ingredients.length) return null;
  const ingredientFoods: Partial<Food>[] = [];
  for (const part of meal.ingredients) {
    const food = foods.find((f) => f.id === part.foodId);
    if (!food) return null;
    if (ingredientFoods.some((f) => f.id === food.id)) continue;
    const clean = sharedFood({ ...food, isCustom: true, source: undefined })!;
    delete clean.isDeleted;
    ingredientFoods.push({
      ...clean,
      isCustom: food.isCustom,
      ...(food.source ? { source: food.source } : {}),
    });
  }
  return {
    id: meal.id,
    name: meal.name,
    ingredients: meal.ingredients.map((p) => ({
      id: p.id,
      foodId: p.foodId,
      quantity: p.quantity,
      isVariable: p.isVariable,
      ...(p.weightBasis ? { weightBasis: p.weightBasis } : {}),
    })),
    ingredientFoods,
    cachedCalories: meal.cachedCalories,
    cachedProtein: meal.cachedProtein,
    cachedCarbs: meal.cachedCarbs,
    cachedFat: meal.cachedFat,
  };
}
