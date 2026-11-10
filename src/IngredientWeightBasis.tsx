import type { Ingredient } from "./domain";

export default function IngredientWeightBasis({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Ingredient["weightBasis"];
  onChange: (value: Ingredient["weightBasis"]) => void;
}) {
  return (
    <label className="field">
      <span>État à la pesée de {name}</span>
      <select
        value={value ?? ""}
        onChange={(e) =>
          onChange((e.target.value || undefined) as Ingredient["weightBasis"])
        }
      >
        <option value="">Non précisé</option>
        <option value="raw">Cru / sec (avant cuisson)</option>
        <option value="cooked">Cuit (après cuisson)</option>
      </select>
      <small>
        La fiche nutritionnelle doit correspondre à cet état. Choisir « cuit »
        ne convertit pas une fiche crue.
      </small>
    </label>
  );
}
