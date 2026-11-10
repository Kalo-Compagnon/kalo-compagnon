import {
  foodLabel,
  nutrients,
  type CalorieDetail,
  type Entry,
  type Meal,
  type Food,
} from "./domain";

export const fmtCalories = (value: number) =>
  value.toLocaleString("fr-FR", {
    maximumFractionDigits: 2,
    useGrouping: false,
  });

export function recipeCalorieDetails(
  meal: Meal,
  foods: Food[],
): CalorieDetail[] | undefined {
  if (meal.calorieDetails?.length) return meal.calorieDetails;
  if (
    !meal.ingredients.length ||
    meal.ingredients.some((p) => !foods.some((f) => f.id === p.foodId))
  )
    return undefined;
  return meal.ingredients.map((p) => {
    const food = foods.find((f) => f.id === p.foodId)!;
    return {
      name: foodLabel(food),
      quantity: p.quantity,
      unit: food.referenceUnit,
      calories: nutrients(food, p.quantity)[0],
    };
  });
}

export function scaleCalorieDetails(
  parts: CalorieDetail[],
  ratio: number,
): CalorieDetail[] {
  return parts.map((p) => ({
    ...p,
    quantity: p.quantity * ratio,
    calories: p.calories * ratio,
  }));
}

export function historicalCalorieDetails(
  entry: Entry,
  meals: Meal[],
  foods: Food[],
) {
  if (entry.calorieDetails?.length)
    return { parts: entry.calorieDetails, reconstructed: false };
  const meal = meals.find((m) => m.id === entry.mealId);
  const parts = meal && recipeCalorieDetails(meal, foods);
  if (!parts) return { parts: [], reconstructed: false };
  const total = parts.reduce((n, p) => n + p.calories, 0);
  const ratio =
    total > 0 && entry.calories != null
      ? entry.calories / total
      : (entry.mealPortions ?? 1) / (meal.portions ?? 1);
  return { parts: scaleCalorieDetails(parts, ratio), reconstructed: true };
}
