import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Trash2 } from "lucide-react";
import IngredientWeightBasis from "./IngredientWeightBasis";
import { Button, Field, NumberField, num, useApp } from "./ui";
import {
  fmt,
  foodLabel,
  mealEntry,
  mealTotals,
  remainingMealPortions,
  nutrients,
  type Food,
  type Meal,
  type Ingredient,
} from "./domain";

export type DraftMealPart = {
  id: string;
  food: Food;
  quantity: string;
  weightBasis?: Ingredient["weightBasis"];
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
  const { state, day, update, notify } = useApp();
  const [newBatch, setNewBatch] = useState(false);
  const [portions, setPortions] = useState("1");
  const [eaten, setEaten] = useState("1");
  const [name, setName] = useState("");
  useEffect(() => {
    setNewBatch(false);
    setName(loadedMeal?.name ?? "");
    setPortions(String(loadedMeal?.portions ?? 1));
    setEaten("1");
  }, [loadedMeal]);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const valid =
    Number.isFinite(num(portions)) &&
    num(portions) > 0 &&
    parts.length > 0 &&
    parts.every((p) => Number.isFinite(num(p.quantity)) && num(p.quantity) > 0);
  const ingredients = parts.map((p) => ({
    id: p.id,
    foodId: p.food.id,
    quantity: Math.max(0, num(p.quantity) || 0),
    isVariable: false,
    weightBasis: p.weightBasis,
  }));
  const foods = parts.map((p) => p.food);
  const totals = mealTotals(ingredients, foods);
  async function save(mode: "add" | "save") {
    if (!valid || submitting.current) return;
    if (mode === "add" && (!Number.isFinite(num(eaten)) || num(eaten) <= 0))
      return;
    submitting.current = true;
    setSaving(true);
    try {
      const meal: Meal = {
        ...loadedMeal,
        id: !newBatch && loadedMeal ? loadedMeal.id : crypto.randomUUID(),
        name: name.trim() || "Mon repas",
        ingredients,
        portions: num(portions),
        cookedWeightGrams: newBatch ? undefined : loadedMeal?.cookedWeightGrams,
        cachedCalories: totals[0],
        cachedProtein: totals[1],
        cachedCarbs: totals[2],
        cachedFat: totals[3],
        isFavorite: loadedMeal?.isFavorite ?? false,
        usageCount: loadedMeal?.usageCount ?? 0,
        createdAt: loadedMeal?.createdAt ?? Date.now(),
      };
      await update((s) => {
        if (mode === "add") {
          if (num(eaten) > remainingMealPortions(meal, s.entries))
            throw new Error("Pas assez de portions restantes");
          s.entries.push(mealEntry(meal, foods, day, {}, num(eaten)));
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
      setPortions("1");
      setEaten("1");
      setNewBatch(false);
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
                  <IngredientWeightBasis
                    name={foodLabel(part.food)}
                    value={part.weightBasis}
                    onChange={(weightBasis) =>
                      setParts((old) =>
                        old.map((p) =>
                          p.id === part.id ? { ...p, weightBasis } : p,
                        ),
                      )
                    }
                  />
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
          <p>
            Pour les pâtes pesées sèches, utilise une fiche de pâtes
            crues/sèches. Le poids de l’assiette cuite se renseigne avec le
            bouton ½ du repas enregistré, à partir du poids total après cuisson.
          </p>
          <NumberField
            label="Portions préparées (plat entier)"
            value={portions}
            min={0.01}
            required
            onChange={setPortions}
          />
          <NumberField
            label="Portions mangées"
            value={eaten}
            min={0.01}
            max={remainingMealPortions(
              {
                id: !newBatch ? (loadedMeal?.id ?? "") : "",
                portions: num(portions),
              },
              state.entries,
            )}
            onChange={setEaten}
          />
          <p>
            Quantité mangée :{" "}
            {fmt((totals[0] * (num(eaten) || 0)) / (num(portions) || 1))} kcal
          </p>
          <p>
            {fmt(totals[0] / (num(portions) || 1))} kcal par portion ·{" "}
            {fmt(
              remainingMealPortions(
                {
                  id: !newBatch ? (loadedMeal?.id ?? "") : "",
                  portions: num(portions),
                },
                state.entries,
              ),
            )}{" "}
            portion(s) restante(s).
          </p>
          {loadedMeal && !newBatch && (
            <Button disabled={saving} onClick={() => setNewBatch(true)}>
              Cuisiner à nouveau ce plat
            </Button>
          )}
          {newBatch && (
            <p>
              Nouvelle préparation : les portions du plat précédent sont
              conservées séparément.
            </p>
          )}
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
              setPortions("1");
              setEaten("1");
              setNewBatch(false);
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
