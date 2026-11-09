import type { Food } from "./domain";

// Only catalogue data is shared. Account preferences and activity never leave
// the user's private food document.
export function sharedFood(food: Food): Partial<Food> | null {
  if (!food.isCustom || food.source) return null;
  return {
    id: food.id,
    name: food.name,
    brand: food.brand ?? "",
    subtype: food.subtype ?? "",
    category: food.category,
    referenceUnit: food.referenceUnit,
    ...(food.unitWeightGrams ? { unitWeightGrams: food.unitWeightGrams } : {}),
    kcalPer100: food.kcalPer100,
    proteinPer100: food.proteinPer100,
    carbsPer100: food.carbsPer100,
    fatPer100: food.fatPer100,
    aliases: food.aliases ?? [],
    missingNutrients: food.missingNutrients ?? [],
    isCustom: true,
    ...(food.isDeleted ? { isDeleted: true } : {}),
  };
}
