import { useState } from "react";
import { Trash2 } from "lucide-react";
import { num } from "./ui";
import type { Food } from "./domain";

type Row = { id: string; name: string; calories: string };
const blankRow = (): Row => ({
  id: crypto.randomUUID(),
  name: "",
  calories: "",
});
const complete = (row: Row) =>
  !!row.name.trim() &&
  !!row.calories.trim() &&
  Number.isFinite(num(row.calories)) &&
  num(row.calories) >= 0;

export default function TemporaryMealFood({
  initialFoods = [],
  onChange,
  disabled = false,
}: {
  initialFoods?: Food[];
  onChange: (foods: Food[], valid: boolean) => void;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => [
    ...initialFoods.map((food) => ({
      id: food.id,
      name: food.name,
      calories: String(food.kcalPer100),
    })),
    blankRow(),
  ]);
  function change(next: Row[]) {
    if (!next.length || complete(next[next.length - 1]))
      next = [...next, blankRow()];
    setRows(next);
    onChange(
      next.filter(complete).map((row) => ({
        id: row.id,
        name: row.name.trim(),
        category: "Autres",
        referenceUnit: "unité",
        kcalPer100: num(row.calories),
        proteinPer100: 0,
        carbsPer100: 0,
        fatPer100: 0,
        missingNutrients: ["proteinPer100", "carbsPer100", "fatPer100"],
        isCustom: true,
        isFavorite: false,
        usageCount: 0,
      })),
      next.every(
        (row) => (!row.name.trim() && !row.calories.trim()) || complete(row),
      ),
    );
  }
  return (
    <div
      className="temporary-meal-foods"
      role="group"
      aria-label="Aliments temporaires"
    >
      {rows.map((row, index) => (
        <div className="temporary-meal-row" key={row.id}>
          <input
            aria-label={`Aliment temporaire ${index + 1}`}
            placeholder="Aliment"
            value={row.name}
            disabled={disabled}
            onChange={(e) =>
              change(
                rows.map((r) =>
                  r.id === row.id ? { ...r, name: e.target.value } : r,
                ),
              )
            }
          />
          <input
            aria-label={`Calories de l’aliment temporaire ${index + 1}`}
            placeholder="Calories"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={row.calories}
            disabled={disabled}
            onChange={(e) =>
              change(
                rows.map((r) =>
                  r.id === row.id ? { ...r, calories: e.target.value } : r,
                ),
              )
            }
          />
          {index < rows.length - 1 || row.name || row.calories ? (
            <button
              className="food-icon"
              type="button"
              disabled={disabled}
              aria-label={`Retirer l’aliment temporaire ${index + 1}`}
              onClick={() => change(rows.filter((r) => r.id !== row.id))}
            >
              <Trash2 size={18} />
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
    </div>
  );
}
