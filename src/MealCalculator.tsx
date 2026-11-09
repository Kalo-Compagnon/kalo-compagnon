import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Trash2 } from "lucide-react";
import { Button, Field, NumberField, num, useApp } from "./ui";
import {
  fmt,
  foodLabel,
  mealEntry,
  mealTotals,
  nutrients,
  type Food,
  type Meal,
} from "./domain";

export type DraftMealPart = { id: string; food: Food; quantity: string };

export default function MealCalculator({
  parts,
  setParts,
}: {
  parts: DraftMealPart[];
  setParts: Dispatch<SetStateAction<DraftMealPart[]>>;
}) {
  const { day, update, notify } = useApp();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const valid =
    parts.length > 0 &&
    parts.every((p) => Number.isFinite(num(p.quantity)) && num(p.quantity) > 0);
  const ingredients = parts.map((p) => ({
    id: p.id,
    foodId: p.food.id,
    quantity: Math.max(0, num(p.quantity) || 0),
    isVariable: false,
  }));
  const foods = parts.map((p) => p.food);
  const totals = mealTotals(ingredients, foods);
  return (
    <section className="meal-calculator" aria-label="Calculateur de repas">
      <div className="meal-calculator-heading">
        <h3>Mon repas</h3>
        <output aria-label="Total du repas" aria-live="polite">
          {fmt(totals[0])} kcal
        </output>
      </div>
      {!parts.length ? (
        <p>Utilise l’assiette d’un aliment pour composer ton repas.</p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid || submitting.current) return;
            submitting.current = true;
            setSaving(true);
            try {
              const meal: Meal = {
                id: crypto.randomUUID(),
                name: name.trim() || "Mon repas",
                ingredients,
                cachedCalories: totals[0],
                cachedProtein: totals[1],
                cachedCarbs: totals[2],
                cachedFat: totals[3],
                isFavorite: false,
                usageCount: 0,
                createdAt: Date.now(),
              };
              const entry = mealEntry(meal, foods, day);
              await update((s) => {
                s.entries.push(entry);
                for (const food of foods) {
                  let saved = s.foods.find((f) => f.id === food.id);
                  if (!saved) {
                    saved = { ...food };
                    s.foods.push(saved);
                  }
                  saved.usageCount++;
                  saved.lastUsedAt = Date.now();
                }
              });
              setParts([]);
              setName("");
              notify("Repas ajouté à la journée");
            } catch (e) {
              notify((e as Error).message);
            } finally {
              submitting.current = false;
              setSaving(false);
            }
          }}
        >
          <Field
            label="Nom du repas (facultatif)"
            placeholder="Mon repas"
            value={name}
            disabled={saving}
            onChange={(e) => setName(e.target.value)}
          />
          <fieldset disabled={saving} className="meal-calculator-parts">
            {parts.map((part) => (
              <div key={part.id} className="meal-calculator-part">
                <div className="meal-calculator-food">
                  <strong>{foodLabel(part.food)}</strong>
                  <small>
                    {fmt(
                      nutrients(
                        part.food,
                        Math.max(0, num(part.quantity) || 0),
                      )[0],
                    )}{" "}
                    kcal
                  </small>
                </div>
                <NumberField
                  label={`Quantité de ${foodLabel(part.food)} (${part.food.referenceUnit})`}
                  value={part.quantity}
                  min={0.0001}
                  required
                  onChange={(quantity) =>
                    setParts((old) =>
                      old.map((p) =>
                        p.id === part.id ? { ...p, quantity } : p,
                      ),
                    )
                  }
                />
                <button
                  className="food-icon"
                  type="button"
                  aria-label={`Retirer ${foodLabel(part.food)} du repas`}
                  onClick={() =>
                    setParts((old) => old.filter((p) => p.id !== part.id))
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </fieldset>
          <p>Le repas reste en préparation jusqu’à ta validation.</p>
          <Button primary type="submit" disabled={!valid || saving}>
            {saving ? "Ajout en cours…" : "Ajouter ce repas à la journée"}
          </Button>
          <Button
            disabled={saving}
            onClick={() => {
              setParts([]);
              setName("");
            }}
          >
            Vider le repas
          </Button>
        </form>
      )}
    </section>
  );
}
