import test from "node:test";
import assert from "node:assert/strict";
import { initialState, type Food, mealEntry, nutrients } from "../src/domain";
import { internalFood, searchFoods, selectableFood } from "../src/food-search";
import { exportJSON, importJSON, exportCSV, importCSV } from "../src/transfer";
const food = (id: string, name: string, extra: Partial<Food> = {}): Food => ({
  ...initialState().foods[0],
  isCustom: true,
  id,
  name,
  ...extra,
});
const foods = [
  food("generic", "Yaourt aux fruits", { source: "ciqual", isFavorite: true }),
  food("brand", "Yaourt fraise", {
    brand: "Yoplait",
    subtype: "Sans sucre",
    externalId: "12345678",
  }),
  food("custom", "Crème maison", { isCustom: true }),
  food("potato", "Pomme de terre vapeur", { source: "ciqual" }),
];
test("Kalo contient uniquement les ajouts utilisateurs et conserve les archives", () => {
  const state = initialState();
  assert.ok(state.foods.length > 0);
  assert.equal(state.foods.filter(selectableFood).length, 0);
  assert.ok(selectableFood(food("kalo", "Personnel", { isCustom: true })));
  assert.ok(selectableFood(foods[1]));
  const legacy = { ...state.foods[0], isFavorite: true, lastUsedAt: 123 };
  for (const section of ["catalog", "recent", "favorites"] as const) {
    for (const filter of ["all", "kalo"] as const) {
      assert.deepEqual(searchFoods([legacy], "", filter, section), []);
      assert.deepEqual(searchFoods([legacy], legacy.name, filter, section), []);
    }
  }
  assert.deepEqual(
    searchFoods(foods, "", "kalo", "catalog")
      .map((f) => f.id)
      .sort(),
    ["brand", "custom"],
  );
});
test("recherche: accents, fragments, ordre, marque et code", () => {
  assert.equal(
    searchFoods(foods, "sans sucre", "kalo", "catalog")[0].id,
    "brand",
  );
  for (const q of ["yaourt yoplait", "YOPLAIT yaourt", "yopl", "12345678"])
    assert.equal(searchFoods(foods, q, "all", "recent")[0].id, "brand");
  assert.equal(searchFoods(foods, "creme", "all", "recent")[0].id, "custom");
  assert.equal(
    searchFoods(foods, "terre vapeur pomme", "all", "recent")[0].id,
    "potato",
  );
  assert.deepEqual(searchFoods(foods, "inconnu", "all", "catalog"), []);
});
test("filtres, favoris, récents chronologiques, limite et dédoublonnage", () => {
  assert.deepEqual(
    searchFoods(foods, "yaourt", "kalo", "recent").map((f) => f.id),
    ["brand"],
  );
  assert.deepEqual(
    searchFoods(foods, "yaourt", "generic", "recent").map((f) => f.id),
    ["generic"],
  );
  assert.deepEqual(
    searchFoods(foods, "", "all", "favorites").map((f) => f.id),
    ["generic"],
  );
  assert.deepEqual(
    searchFoods(
      [food("a", "A", { lastUsedAt: 10 }), food("b", "B", { lastUsedAt: 20 })],
      "",
      "all",
      "recent",
    ).map((f) => f.id),
    ["b", "a"],
  );
  assert.equal(
    searchFoods([...foods, ...foods], "", "all", "catalog", 2).length,
    2,
  );
});
test("Suppression : toutes les listes masquent la fiche, ses calculs restent disponibles", () => {
  const archived = {
    ...foods[1],
    isDeleted: true,
    isFavorite: true,
    lastUsedAt: 100,
  };
  assert.equal(selectableFood(archived), false);
  for (const section of ["catalog", "recent", "favorites"] as const)
    for (const query of ["", archived.name])
      assert.deepEqual(searchFoods([archived], query, "all", section), []);
  assert.equal(nutrients(archived, 100)[0], archived.kcalPer100);
});
test("missing nutrients and zero energy remain distinct", () => {
  const missing = { ...foods[0], kcalPer100: null };
  assert.throws(() => internalFood(missing));
  assert.equal(internalFood({ ...foods[0], kcalPer100: 0 }).kcalPer100, 0);
  assert.ok(
    internalFood({
      ...foods[0],
      proteinPer100: null,
    }).missingNutrients?.includes("proteinPer100"),
  );
});
test("export/import conserve provenance et ancien journal", () => {
  const state = initialState();
  state.foods.push(foods[1]);
  state.entries.push({
    id: "old",
    timestamp: 1,
    type: "food",
    foodName: "Ancien",
    calories: 123,
  });
  const imported = importJSON(exportJSON(state));
  assert.equal(imported.foods.find((f) => f.id === "brand")?.brand, "Yoplait");
  assert.equal(
    imported.foods.find((f) => f.id === "brand")?.subtype,
    "Sans sucre",
  );
  imported.foods[0].kcalPer100 = 999;
  assert.equal(imported.entries[0].calories, 123);
});

test("aliments à la pièce : calories et recettes par unité, sauvegardes et grammes inchangés", () => {
  const unit = food("piece", "Merguez", {
    isCustom: true,
    brand: "Boucherie",
    referenceUnit: "unité",
    kcalPer100: 180,
    proteinPer100: 12,
  });
  assert.deepEqual(nutrients(unit, 2).slice(0, 2), [360, 24]);
  assert.equal(nutrients({ ...unit, referenceUnit: "g" }, 50)[0], 90);
  const state = initialState();
  state.foods.push(unit);
  const meal = {
    id: "meal",
    name: "Dîner",
    ingredients: [
      { id: "part", foodId: unit.id, quantity: 3, isVariable: false },
    ],
    cachedCalories: 0,
    cachedProtein: 0,
    cachedCarbs: 0,
    cachedFat: 0,
    isFavorite: false,
    usageCount: 0,
    createdAt: 1,
  };
  assert.equal(mealEntry(meal, state.foods, "2026-11-08").calories, 540);
  for (const restored of [
    importJSON(exportJSON(state)),
    importCSV(exportCSV(state)).state,
  ]) {
    const saved = restored.foods.find((f) => f.id === unit.id)!;
    assert.equal(saved.referenceUnit, "unité");
    assert.equal(saved.brand, "Boucherie");
    assert.equal(nutrients(saved, 2)[0], 360);
  }
  assert.equal(searchFoods([unit], "boucherie", "kalo", "catalog").length, 1);
});

test("Paquet pour 100 g : une barre de 21 g, fractions, repas et sauvegardes", () => {
  const bar = food("bar", "Barre chocolat", {
    isCustom: true,
    referenceUnit: "unité",
    unitWeightGrams: 21,
    kcalPer100: 500,
    proteinPer100: 10,
    carbsPer100: 50,
    fatPer100: 20,
  });
  assert.equal(nutrients(bar, 1)[0], 105);
  assert.equal(nutrients(bar, 2)[0], 210);
  assert.equal(nutrients(bar, 0.5)[0], 52.5);
  assert.equal(nutrients({ ...bar, referenceUnit: "g" }, 100)[0], 500);
  const state = initialState();
  state.foods.push(bar);
  for (const restored of [
    importJSON(exportJSON(state)),
    importCSV(exportCSV(state)).state,
  ]) {
    const saved = restored.foods.find((f) => f.id === "bar")!;
    assert.equal(saved.unitWeightGrams, 21);
    assert.equal(saved.kcalPer100, 500);
    assert.equal(nutrients(saved, 2)[0], 210);
  }
});
