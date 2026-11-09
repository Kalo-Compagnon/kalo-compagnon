import { normalize, type Food } from "./domain";
export type SourceFilter = "all" | "kalo" | "generic";
export type FoodSection = "recent" | "favorites" | "catalog";
export type CatalogFood = Omit<
  Food,
  "kcalPer100" | "proteinPer100" | "carbsPer100" | "fatPer100"
> & {
  kcalPer100: number | null;
  proteinPer100: number | null;
  carbsPer100: number | null;
  fatPer100: number | null;
};
const words = (s: string) =>
  normalize(s)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
// Preserve historical records for saved recipes, outside the selectable catalogue.
export const selectableFood = (food: CatalogFood) =>
  !food.isDeleted &&
  ((!food.source && food.isCustom) || food.source === "ciqual");
export function searchFoods(
  foods: CatalogFood[],
  query: string,
  filter: SourceFilter,
  section: FoodSection,
  limit = Number.POSITIVE_INFINITY,
) {
  const tokens = words(query),
    q = tokens.join(" ");
  const unique = new Map<string, CatalogFood>();
  foods.forEach((f) => {
    if (!unique.has(f.id)) unique.set(f.id, f);
  });
  return [...unique.values()]
    .filter((f) => {
      if (!selectableFood(f)) return false;
      if (filter === "kalo" && (!f.isCustom || !!f.source)) return false;
      if (filter === "generic" && f.source !== "ciqual") return false;
      if (!q)
        return section === "recent"
          ? !!f.lastUsedAt
          : section === "favorites"
            ? f.isFavorite
            : true;
      const text = words(
        [f.name, f.brand, f.subtype, f.externalId, ...(f.aliases ?? [])]
          .filter(Boolean)
          .join(" "),
      ).join(" ");
      return tokens.every((t) => text.includes(t));
    })
    .sort((a, b) => {
      if (!q && section === "recent")
        return (
          (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || a.id.localeCompare(b.id)
        );
      const score = (f: CatalogFood) => {
        const name = words(f.name).join(" "),
          brand = words(f.brand ?? "");
        return (
          (name === q ? 10000 : 0) +
          (f.externalId === query.trim() ? 20000 : 0) +
          (brand.some((w) => tokens.includes(w)) ? 5000 : 0) +
          (tokens.every((t) => words(f.name).includes(t)) ? 1000 : 0) +
          (name.startsWith(q) ? 300 : 0) +
          (f.source === "ciqual" ? 40 : 0) +
          (f.isFavorite ? 20 : 0) +
          (f.lastUsedAt ? 10 : 0) +
          [f.kcalPer100, f.proteinPer100, f.carbsPer100, f.fatPer100].filter(
            (v) => v !== null,
          ).length
        );
      };
      return (
        score(b) - score(a) ||
        a.name.localeCompare(b.name, "fr") ||
        a.id.localeCompare(b.id)
      );
    })
    .slice(0, limit);
}
export const sourceLabel = (f: CatalogFood) =>
  f.source === "ciqual"
    ? `Ciqual ${f.sourceVersion ?? ""} · Aliment brut`
    : "Catalogue Kalo";
export function internalFood(f: CatalogFood): Food {
  if (f.kcalPer100 === null)
    throw new Error(
      "Valeur énergétique manquante : crée une fiche personnelle pour la compléter.",
    );
  const keys = ["proteinPer100", "carbsPer100", "fatPer100"] as const;
  return {
    ...f,
    kcalPer100: f.kcalPer100,
    proteinPer100: f.proteinPer100 ?? 0,
    carbsPer100: f.carbsPer100 ?? 0,
    fatPer100: f.fatPer100 ?? 0,
    missingNutrients: keys.filter((k) => f[k] === null),
  };
}
