import { timestamp, type Entry } from "./domain";
import {
  validateReply,
  type Estimate,
} from "../supabase/functions/_shared/kermit";

export function kermitEntry(value: Estimate, day: string, id: string): Entry {
  const checked = validateReply(value);
  if (checked.type !== "estimation") throw new Error("Estimation invalide");
  return {
    id,
    timestamp: timestamp(day),
    type: "meal",
    foodName: checked.nom_repas,
    calories: checked.total_kcal,
    mealEstimate: true,
    note: [
      "Estimation Gemini",
      ...checked.ingredients.map(
        (i) =>
          `${i.nom} : ${i.quantite_g === null ? "quantité inconnue" : `${i.quantite_g} g`} · ${i.kcal} kcal`,
      ),
      ...checked.incertitudes,
    ].join("\n"),
    // Unknown quantities stay explicit in the note; never turn them into zero.
    calorieDetails: checked.ingredients
      .filter((i) => i.quantite_g !== null)
      .map((i) => ({
        name: i.nom,
        quantity: i.quantite_g!,
        unit: "g",
        calories: i.kcal,
      })),
  };
}
