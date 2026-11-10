import type { Meal } from "./domain";

// Preparing a tracked dish is a fresh meal, not another serving from its batch.
// Keep the existing batch and its historical servings intact.
export function mealRecipeDraft(meal: Meal): Meal {
  if (!meal.portionTracking) return meal;
  return {
    ...meal,
    id: crypto.randomUUID(),
    portions: 1,
    portionTracking: undefined,
    cookedWeightGrams: undefined,
    usageCount: 0,
    lastUsedAt: undefined,
    createdAt: Date.now(),
  };
}
