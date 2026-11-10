import { useRef, useState } from "react";
import { Button, NumberField, Sheet, num, useApp } from "./ui";
import { fmt, type Meal } from "./domain";
import { fmtCalories } from "./meal-calorie-details";
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
    <Sheet title={"Portions · " + meal.name}>
      <div className="portion-editor">
        {finished || legacy ? (
          <>
            <p className="portion-status">
              {finished
                ? "Plat terminé · calories définitives"
                : "Ce plat utilise l’ancien suivi."}
            </p>
            <Button primary onClick={() => void newPreparation()}>
              Cuisiner à nouveau ce plat
            </Button>
          </>
        ) : (
          <>
            <form
              className="portion-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) void perform("add");
              }}
            >
              <fieldset className="portion-fields" disabled={saving}>
                <div>
                  <NumberField
                    label="Poids mangé (g)"
                    value={amount}
                    min={0.01}
                    required
                    onChange={setAmount}
                    placeholder="Ex. : 250"
                  />
                  <p className="portion-hint">Sans le poids de l’assiette.</p>
                </div>
                <details className="portion-total-option">
                  <summary>J’ai pesé le plat entier</summary>
                  <div className="portion-total-fields">
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
                  </div>
                </details>
                <label className="portion-last">
                  <input
                    type="checkbox"
                    checked={last}
                    onChange={(e) => setLast(e.target.checked)}
                  />
                  <span>
                    Dernière assiette<small>Le plat sera terminé.</small>
                  </span>
                </label>
              </fieldset>
              <div className="portion-summary" aria-live="polite">
                <dl>
                  <div>
                    <dt>
                      {measured ? "Poids total mesuré" : "Poids total estimé"}
                    </dt>
                    <dd>
                      {total > 0
                        ? (measured ? "" : "≈ ") + fmt(total) + " g"
                        : "À renseigner"}
                    </dd>
                  </div>
                  <div>
                    <dt>{last && valid ? "Après cette assiette" : "Reste"}</dt>
                    <dd>
                      {last && valid
                        ? "Plat terminé"
                        : total > 0
                          ? (measured ? "" : "≈ ") +
                            fmt(
                              Math.max(0, total - eaten - (num(amount) || 0)),
                            ) +
                            " g"
                          : "—"}
                    </dd>
                  </div>
                </dl>
                {valid && (
                  <p className="portion-calories">
                    <span>Cette assiette</span>
                    <strong>
                      {fmtCalories(
                        (current.cachedCalories * num(amount)) /
                          (last ? eaten + num(amount) : total),
                      )}{" "}
                      kcal
                    </strong>
                  </p>
                )}
                {!measured && estimate != null && !last && (
                  <p className="portion-hint">
                    <strong>Calories provisoires.</strong> Recalculées à la fin
                    du plat, pour toutes les assiettes.
                  </p>
                )}
                {estimate == null && !measured && (
                  <p className="portion-hint">
                    Renseigne le poids total pour ce plat.
                  </p>
                )}
                {!validWeight && (
                  <p role="alert">
                    Le poids total doit couvrir les assiettes déjà mangées.
                  </p>
                )}
                {measured != null &&
                  validWeight &&
                  num(amount) > 0 &&
                  eaten + num(amount) > measured && (
                    <p role="alert">
                      Cette assiette dépasse le reste disponible.
                    </p>
                  )}
              </div>
              <Button primary type="submit" disabled={!valid || saving}>
                Ajouter mon assiette
              </Button>
            </form>
            {current.portionTracking && eaten > 0 && (
              <div className="portion-finish">
                <p>
                  <strong>{fmt(eaten)} g</strong> déjà mangés
                </p>
                <Button
                  disabled={saving}
                  onClick={() => void perform("finish")}
                >
                  Terminer le plat
                </Button>
                <p className="portion-hint">
                  Toutes les assiettes doivent être enregistrées.
                </p>
              </div>
            )}
          </>
        )}
      </div>
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
