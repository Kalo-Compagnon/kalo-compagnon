import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Trash2 } from "lucide-react";
import { recipeCalorieDetails } from "./meal-calorie-details";
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

export type DraftMealPart = {
  id: string;
  food: Food;
  quantity: string;
};

export default function MealCalculator({
  parts,
  setParts,
  loadedMeal = null,
  onReset,
}: {
  parts: DraftMealPart[];
  setParts: Dispatch<SetStateAction<DraftMealPart[]>>;
  loadedMeal?: Meal | null;
  onReset?: () => void;
}) {
  const { day, update, notify } = useApp();
  const [name, setName] = useState("");
  useEffect(() => {
    setName(loadedMeal?.name ?? "");
  }, [loadedMeal]);
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
  async function save(mode: "add" | "save") {
    if (!valid || submitting.current) return;
    if (loadedMeal?.portionTracking) {
      notify("Utilise le menu Portions pour ce plat en suivi.");
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      const meal: Meal = {
        ...loadedMeal,
        id: loadedMeal?.id ?? crypto.randomUUID(),
        name: name.trim() || "Mon repas",
        ingredients,
        portions: 1,
        cookedWeightGrams: loadedMeal?.cookedWeightGrams,
        cachedCalories: totals[0],
        cachedProtein: totals[1],
        cachedCarbs: totals[2],
        cachedFat: totals[3],
        isFavorite: loadedMeal?.isFavorite ?? false,
        usageCount: loadedMeal?.usageCount ?? 0,
        createdAt: loadedMeal?.createdAt ?? Date.now(),
      };
      await update((s) => {
        meal.calorieDetails = recipeCalorieDetails(
          { ...meal, calorieDetails: undefined },
          foods,
        );
        if (mode === "add") {
          s.entries.push(mealEntry(meal, foods, day));
          s.meals = s.meals.filter((m) => m.id !== meal.id);
          s.meals.push(meal);
          const savedMeal = s.meals.find((m) => m.id === meal.id);
          if (savedMeal) {
            savedMeal.usageCount++;
            savedMeal.lastUsedAt = Date.now();
          }
        } else {
          s.meals = s.meals.filter((m) => m.id !== meal.id);
          s.meals.push(meal);
        }
        for (const food of foods) {
          let saved = s.foods.find((f) => f.id === food.id);
          if (!saved) {
            saved = { ...food };
            s.foods.push(saved);
          }
          if (mode === "add") {
            saved.usageCount++;
            saved.lastUsedAt = Date.now();
          }
        }
      });
      setParts([]);
      setName("");
      onReset?.();
      notify(mode === "add" ? "Repas ajouté à la journée" : "Repas enregistré");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
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
          onSubmit={(e) => {
            e.preventDefault();
            void save("add");
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
                  min={part.food.referenceUnit === "unité" ? 0.5 : 0.0001}
                  step={part.food.referenceUnit === "unité" ? 0.5 : "any"}
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
          <div className="meal-calculator-actions">
            <Button primary type="submit" disabled={!valid || saving}>
              Ajouter le repas
            </Button>
            <Button
              disabled={!valid || saving}
              onClick={() => void save("save")}
            >
              Enregistrer le repas
            </Button>
          </div>
          <Button
            disabled={saving}
            onClick={() => {
              setParts([]);
              setName("");
              onReset?.();
            }}
          >
            Vider le repas
          </Button>
        </form>
      )}
    </section>
  );
}
