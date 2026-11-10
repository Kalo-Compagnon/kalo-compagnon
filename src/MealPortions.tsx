import { useRef, useState } from "react";
import { Button, NumberField, Sheet, num, useApp } from "./ui";
import {
  fmt,
  foodLabel,
  mealEntry,
  remainingMealPortions,
  type Meal,
} from "./domain";

export default function MealPortions({ meal }: { meal: Meal }) {
  const { state, day, update, notify, close } = useApp();
  const [mode, setMode] = useState<"grams" | "portions">("grams");
  const [weight, setWeight] = useState(String(meal.cookedWeightGrams ?? ""));
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const current = state.meals.find((m) => m.id === meal.id) ?? meal;
  const prepared = current.portions ?? 1;
  const remaining = remainingMealPortions(current, state.entries);
  const ratio =
    mode === "grams" ? num(amount) / num(weight) : num(amount) / prepared;
  const valid =
    Number.isFinite(ratio) &&
    ratio > 0 &&
    ratio * prepared <= remaining &&
    (mode !== "grams" || (Number.isFinite(num(weight)) && num(weight) > 0));
  const preview = valid
    ? mealEntry(current, state.foods, day, {}, ratio * prepared)
    : null;
  async function save() {
    if (!valid || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    try {
      await update((s) => {
        const saved = s.meals.find((m) => m.id === meal.id);
        if (!saved) throw new Error("Repas introuvable");
        const portions = ratio * (saved.portions ?? 1);
        if (portions > remainingMealPortions(saved, s.entries))
          throw new Error("Quantité supérieure au reste disponible");
        const entry = mealEntry(saved, s.foods, day, {}, portions);
        if (mode === "grams") {
          saved.cookedWeightGrams = num(weight);
          entry.quantityGrams = num(amount);
          entry.quantityUnit = "g";
        }
        s.entries.push(entry);
        saved.usageCount++;
        saved.lastUsedAt = Date.now();
      });
      notify("Quantité mangée ajoutée, reste mis à jour");
      close();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  return (
    <Sheet
      title={`Portions · ${meal.name}`}
      subtitle="Indique seulement ce que tu manges."
    >
      <div className="meal-calculator-actions">
        <Button
          onClick={() => {
            setMode("grams");
            setAmount("");
          }}
          disabled={saving}
          aria-pressed={mode === "grams"}
        >
          En grammes
        </Button>
        <Button
          onClick={() => {
            setMode("portions");
            setAmount("");
          }}
          disabled={saving}
          aria-pressed={mode === "portions"}
        >
          En portions
        </Button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={saving}>
          {mode === "grams" && (
            <>
              <NumberField
                label="Poids total du plat cuisiné (g)"
                value={weight}
                min={0.01}
                required
                onChange={setWeight}
              />
              <p>
                Pèse tout le plat après cuisson, sans le récipient. Pour
                l’assiette, retire aussi le poids de l’assiette vide.
              </p>
              <p>
                Les ingrédients restent comptés dans leur état de saisie
                (cru/sec ou cuit). Pour des pâtes : saisis leur poids sec avec
                une fiche crue, puis pèse le plat cuit entier ici. Le calcul
                utilise le rapport assiette cuite / plat cuit, sans coefficient
                de cuisson approximatif.
              </p>
            </>
          )}
          <NumberField
            label={
              mode === "grams"
                ? "Poids mangé, sans l’assiette (g)"
                : "Portions mangées"
            }
            value={amount}
            min={0.0001}
            required
            onChange={setAmount}
          />
          {mode === "portions" && (
            <div className="meal-calculator-actions">
              <Button onClick={() => setAmount("0.5")}>½ portion</Button>
              <Button onClick={() => setAmount("1")}>1 portion</Button>
            </div>
          )}
        </fieldset>
        <p>
          {mode === "grams" && num(weight) > 0
            ? `${fmt((num(weight) * remaining) / prepared)} g restants`
            : `${fmt(remaining)} portion(s) restante(s)`}
        </p>
        {preview && (
          <p aria-live="polite">
            {fmt(preview.calories ?? 0)} kcal mangées · reste après :{" "}
            {mode === "grams"
              ? `${fmt(num(weight) * (remaining / prepared - ratio))} g`
              : `${fmt(remaining - ratio * prepared)} portion(s)`}
          </p>
        )}
        {preview &&
          current.ingredients.some((p) => p.weightBasis === "raw") && (
            <div>
              <p>Équivalent cru/sec dans cette assiette :</p>
              <ul>
                {current.ingredients
                  .filter((p) => p.weightBasis === "raw")
                  .map((p) => {
                    const food = state.foods.find((f) => f.id === p.foodId);
                    return food ? (
                      <li key={p.id}>
                        {foodLabel(food)} : {fmt(p.quantity * ratio)}{" "}
                        {food.referenceUnit} crus/secs
                      </li>
                    ) : null;
                  })}
              </ul>
            </div>
          )}
        {!valid &&
          num(amount) > 0 &&
          Number.isFinite(ratio) &&
          ratio * prepared > remaining && (
            <p role="alert">Cette quantité dépasse le reste disponible.</p>
          )}
        <Button primary type="submit" disabled={!valid || saving}>
          Ajouter la quantité mangée
        </Button>
      </form>
    </Sheet>
  );
}
