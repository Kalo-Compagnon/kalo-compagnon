import { useRef, useState } from "react";
import { Button, NumberField, Sheet, num, useApp } from "./ui";
import { fmt, type Meal } from "./domain";
import {
  addMealServing,
  estimateCookedWeight,
  finishMeal,
  recalculateMealServings,
  servedWeight,
  trackingWeight,
} from "./cooking";

export default function MealPortions({ meal }: { meal: Meal }) {
  const { state, day, update, notify, close, modal } = useApp();
  const current = state.meals.find((m) => m.id === meal.id) ?? meal;
  const [weight, setWeight] = useState(String(current.cookedWeightGrams ?? ""));
  const [amount, setAmount] = useState("");
  const [last, setLast] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const estimate =
    current.portionTracking?.estimatedWeightGrams ??
    estimateCookedWeight(current, state.foods);
  const measured = weight.trim() ? num(weight) : undefined;
  const eaten = servedWeight(current, state.entries);
  const total = measured ?? Math.max(estimate ?? 0, eaten + (num(amount) || 0));
  const validWeight =
    measured === undefined ||
    (Number.isFinite(measured) && measured > 0 && measured >= eaten);
  const valid =
    validWeight &&
    (measured !== undefined || estimate != null) &&
    total > 0 &&
    Number.isFinite(num(amount)) &&
    num(amount) > 0 &&
    (measured === undefined || eaten + num(amount) <= measured + 0.001);
  const finished = !!current.portionTracking?.finished;
  const legacy =
    !current.portionTracking && state.entries.some((e) => e.mealId === meal.id);
  async function perform(action: "add" | "finish" | "weight") {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    try {
      await update((s) => {
        const saved = s.meals.find((m) => m.id === meal.id);
        if (!saved) throw new Error("Repas introuvable");
        if (action === "add")
          addMealServing(s, saved, day, num(amount), measured, last);
        else if (action === "finish") finishMeal(s, saved);
        else {
          if (!validWeight || !measured)
            throw new Error("Poids total invalide");
          if (measured < servedWeight(saved, s.entries))
            throw new Error("Poids inférieur aux assiettes déjà mangées");
          saved.cookedWeightGrams = measured;
          saved.portionTracking ??= {
            estimatedWeightGrams: estimate ?? measured,
          };
          recalculateMealServings(s, saved);
        }
      });
      notify(
        action === "finish" || last
          ? "Plat terminé : toutes les assiettes ont été recalculées"
          : "Portions mises à jour",
      );
      close();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  async function newPreparation() {
    const next: Meal = {
      ...current,
      id: crypto.randomUUID(),
      portionTracking: undefined,
      cookedWeightGrams: undefined,
      portions: 1,
      usageCount: 0,
      lastUsedAt: undefined,
      createdAt: Date.now(),
    };
    await update((s) => {
      s.meals.push(next);
    });
    modal(<MealPortions key={next.id} meal={next} />);
  }
  return (
    <Sheet
      title={"Portions · " + meal.name}
      subtitle="Pèse ton assiette, le reste est suivi automatiquement."
    >
      {finished || legacy ? (
        <>
          <p>
            {finished
              ? "Plat terminé. Le calcul définitif est enregistré."
              : "Ce repas a déjà été consommé avec l’ancien suivi. Démarre une nouvelle préparation pour peser tes assiettes."}
          </p>
          <Button primary onClick={() => void newPreparation()}>
            Cuisiner à nouveau ce plat
          </Button>
        </>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) void perform("add");
            }}
          >
            <fieldset disabled={saving}>
              <NumberField
                label="Poids de mon assiette (g, sans l’assiette vide)"
                value={amount}
                min={0.01}
                required
                onChange={setAmount}
              />
              <details>
                <summary>J’ai pesé le plat entier (facultatif)</summary>
                <NumberField
                  label="Poids total du plat cuit (g)"
                  value={weight}
                  min={0.01}
                  onChange={setWeight}
                />
                {current.portionTracking && (
                  <Button
                    disabled={!validWeight || !measured || saving}
                    onClick={() => void perform("weight")}
                  >
                    Corriger le poids total
                  </Button>
                )}
              </details>
              <label className="check">
                <input
                  type="checkbox"
                  checked={last}
                  onChange={(e) => setLast(e.target.checked)}
                />
                C’est la dernière assiette, tout le plat a été mangé
              </label>
            </fieldset>
            <p>
              {measured
                ? "Poids total mesuré : " + fmt(measured) + " g"
                : estimate
                  ? "Poids total estimé : environ " + fmt(total) + " g"
                  : "Indique le poids total : un ingrédient n’a pas de poids connu."}
            </p>
            {!measured && (
              <p>
                Calories provisoires. Quand toutes les assiettes auront été
                pesées, termine le plat : leurs poids seront additionnés et les
                calories de chaque assiette recalculées, même les jours
                précédents.
              </p>
            )}
            {valid && (
              <p aria-live="polite">
                {fmt(
                  (current.cachedCalories * num(amount)) /
                    (last ? eaten + num(amount) : total),
                )}{" "}
                kcal {last || measured ? "" : "estimées"} ·{" "}
                {last
                  ? "plat terminé après cette assiette"
                  : "reste " +
                    (measured ? "" : "estimé ") +
                    ": " +
                    fmt(Math.max(0, total - eaten - num(amount))) +
                    " g"}
              </p>
            )}
            <Button primary type="submit" disabled={!valid || saving}>
              Ajouter mon assiette
            </Button>
          </form>
          {current.portionTracking && eaten > 0 && (
            <>
              <p>
                {fmt(eaten)} g déjà mangés. Valide seulement si toutes les
                assiettes du plat ont été enregistrées, y compris celles
                partagées.
              </p>
              <Button disabled={saving} onClick={() => void perform("finish")}>
                Tout a été mangé : terminer le plat
              </Button>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

export function ActiveMealPortions() {
  const { state, modal } = useApp();
  const meals = state.meals.filter(
    (m) => m.portionTracking && !m.portionTracking.finished,
  );
  if (!meals.length) return null;
  return (
    <section
      className="card active-meal-portions"
      aria-labelledby="active-portions-title"
    >
      <h2 id="active-portions-title">Portions en cours</h2>
      {meals.map((meal) => (
        <div key={meal.id} className="active-meal-portion">
          <div>
            <strong>{meal.name}</strong>
            <p>
              {fmt(
                Math.max(
                  0,
                  trackingWeight(meal, state.entries) -
                    servedWeight(meal, state.entries),
                ),
              )}{" "}
              g restants
              {!meal.cookedWeightGrams && " environ · calories provisoires"}
            </p>
          </div>
          <Button onClick={() => modal(<MealPortions meal={meal} />)}>
            ½ Portions
          </Button>
        </div>
      ))}
    </section>
  );
}
