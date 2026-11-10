import { mealEntry, type Food, type Meal, type State } from "./domain";
import {
  recipeCalorieDetails,
  scaleCalorieDetails,
} from "./meal-calorie-details";

// Approximate dry-to-cooked mass yields, not calorie multipliers.
// Pasta: USDA Food Buying Guide, Section 4, Grains (spaghetti).
// https://foodbuyingguide.fns.usda.gov/files/Reports/USDA_FBG_Section4_Grains_YieldTable.pdf
// Rice: UK dietary survey coding instructions, section 7.1 (+177% mass).
// https://doc.ukdataservice.ac.uk/doc/7263/mrdoc/pdf/7263supportingdocs.pdf
export const cookingTypes = {
  pasta: { label: "Pâtes sèches", factor: 2.37 },
  rice: { label: "Riz sec", factor: 2.77 },
} as const;

export function estimateCookedWeight(meal: Meal, foods: Food[]): number | null {
  let total = 0;
  for (const part of meal.ingredients) {
    const food = foods.find((f) => f.id === part.foodId);
    if (!food) return null;
    const grams =
      food.referenceUnit === "unité"
        ? part.quantity * (food.unitWeightGrams ?? 0)
        : part.quantity;
    if (!(grams > 0)) return null;
    // Unclassified ingredients retain their input mass; ml ~= g for this estimate.
    total +=
      grams * (food.cookingType ? cookingTypes[food.cookingType].factor : 1);
  }
  return total > 0 ? total : null;
}

export function servedWeight(meal: Meal, entries: State["entries"]): number {
  return entries
    .filter((e) => e.mealId === meal.id)
    .reduce((n, e) => n + (e.mealServingGrams ?? 0), 0);
}

export function trackingWeight(meal: Meal, entries: State["entries"]): number {
  return (
    meal.cookedWeightGrams ??
    Math.max(
      meal.portionTracking?.estimatedWeightGrams ?? 0,
      servedWeight(meal, entries),
    )
  );
}

export function recalculateMealServings(state: State, meal: Meal) {
  const total = trackingWeight(meal, state.entries);
  if (meal.portionTracking && !meal.portionTracking.calorieDetails)
    meal.portionTracking.calorieDetails = recipeCalorieDetails(
      meal,
      state.foods,
    );
  if (!(total > 0)) throw new Error("Poids total manquant");
  for (const entry of state.entries.filter(
    (e) => e.mealId === meal.id && e.mealServingGrams != null,
  )) {
    const ratio = entry.mealServingGrams! / total;
    if (ratio > 1)
      throw new Error("Poids total inférieur à une assiette déjà enregistrée");
    // Use the recipe nutrition snapshot: editing a food later must not alter past meals.
    const nutrition = mealEntry(
      { ...meal, ingredients: [], portions: 1 },
      [],
      "2026-01-01",
      {},
      ratio,
    );
    entry.calories = nutrition.calories;
    entry.proteinGrams = nutrition.proteinGrams;
    entry.carbsGrams = nutrition.carbsGrams;
    entry.fatGrams = nutrition.fatGrams;
    entry.mealPortions = ratio * (meal.portions ?? 1);
    entry.mealEstimate = !meal.cookedWeightGrams;
    if (meal.portionTracking?.calorieDetails)
      entry.calorieDetails = scaleCalorieDetails(
        meal.portionTracking.calorieDetails,
        ratio,
      );
    if (entry.calorieDetails?.length) {
      const detailTotal = entry.calorieDetails.reduce(
        (n, p) => n + p.calories,
        0,
      );
      if (detailTotal > 0 && entry.calories != null)
        entry.calorieDetails = entry.calorieDetails.map((p) => ({
          ...p,
          calories: (p.calories * entry.calories!) / detailTotal,
        }));
    }
  }
}

export function addMealServing(
  state: State,
  meal: Meal,
  day: string,
  grams: number,
  measuredTotal?: number,
  finish = false,
) {
  if (!Number.isFinite(grams) || grams <= 0 || meal.portionTracking?.finished)
    throw new Error("Quantité invalide ou plat déjà terminé");
  const estimate = estimateCookedWeight(meal, state.foods);
  if (
    measuredTotal !== undefined &&
    (!Number.isFinite(measuredTotal) || measuredTotal <= 0)
  )
    throw new Error("Poids total invalide");
  if (!meal.portionTracking) {
    if (state.entries.some((e) => e.mealId === meal.id))
      throw new Error(
        "Ce plat a déjà été consommé sans suivi au poids. Utilise une nouvelle préparation.",
      );
    if (!measuredTotal && !estimate)
      throw new Error(
        "Indique le poids total : certains ingrédients n’ont pas de poids connu.",
      );
    meal.portionTracking = { estimatedWeightGrams: estimate ?? measuredTotal! };
  }
  if (measuredTotal !== undefined) meal.cookedWeightGrams = measuredTotal;
  const eaten = servedWeight(meal, state.entries);
  if (meal.cookedWeightGrams && eaten + grams > meal.cookedWeightGrams + 0.001)
    throw new Error("Cette assiette dépasse le reste disponible");
  const entry = mealEntry({ ...meal, ingredients: [], portions: 1 }, [], day);
  entry.mealServingGrams = grams;
  entry.quantityGrams = grams;
  entry.quantityUnit = "g";
  entry.note = meal.notes;
  state.entries.push(entry);
  if (
    finish ||
    (meal.cookedWeightGrams &&
      Math.abs(eaten + grams - meal.cookedWeightGrams) < 0.001)
  )
    finishMeal(state, meal);
  else recalculateMealServings(state, meal);
  meal.usageCount++;
  meal.lastUsedAt = Date.now();
}

export function finishMeal(state: State, meal: Meal) {
  const total = servedWeight(meal, state.entries);
  if (!(total > 0) || !meal.portionTracking)
    throw new Error("Ajoute au moins une assiette pesée");
  meal.cookedWeightGrams = total;
  meal.portionTracking.finished = true;
  recalculateMealServings(state, meal);
}
