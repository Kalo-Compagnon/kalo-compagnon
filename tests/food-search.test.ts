import test from "node:test";
import assert from "node:assert/strict";
import { initialState, type Food, mealEntry, nutrients } from "../src/domain";
import {
  internalFood,
  offProduct,
  searchFoods,
  selectableFood,
} from "../src/food-search";
import { exportJSON, importJSON, exportCSV, importCSV } from "../src/transfer";
const food = (id: string, name: string, extra: Partial<Food> = {}): Food => ({
  ...initialState().foods[0],
  id,
  name,
  ...extra,
});
const foods = [
  food("generic", "Yaourt aux fruits", { source: "ciqual", isFavorite: true }),
  food("brand", "Yaourt fraise", {
    source: "off",
    brand: "Yoplait",
    externalId: "12345678",
  }),
  food("custom", "Crème maison", { isCustom: true }),
  food("potato", "Pomme de terre vapeur", { source: "ciqual" }),
];
test("le catalogue Kalo est exclu du sélecteur sans supprimer les données historiques", () => {
  const state = initialState();
  assert.ok(state.foods.length > 0);
  assert.equal(state.foods.filter(selectableFood).length, 0);
  assert.ok(selectableFood(food("personal", "Personnel", { isCustom: true })));
  assert.ok(selectableFood(foods[1]));
});
test("recherche: accents, fragments, ordre, marque et code", () => {
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
    searchFoods(foods, "yaourt", "products", "recent").map((f) => f.id),
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
test("OFF: énergie kJ, unités, valeurs absentes et zéro réel", () => {
  const p = offProduct({
    code: "12345678",
    product_name: "Test",
    quantity: "1 l",
    nutriments: { energy_100g: 418.4, energy_unit: "kJ" },
  })!;
  assert.ok(Math.abs(p.kcalPer100! - 100) < 0.001);
  assert.equal(p.referenceUnit, "ml");
  assert.equal(p.proteinPer100, null);
  assert.ok(internalFood(p).missingNutrients?.includes("proteinPer100"));
  const missing = offProduct({ code: "1", product_name: "Test" })!;
  assert.equal(missing.kcalPer100, null);
  assert.throws(() => internalFood(missing));
  assert.equal(
    offProduct({
      code: "1",
      product_name: "Eau",
      nutriments: { "energy-kcal_100g": 0 },
    })!.kcalPer100,
    0,
  );
  assert.equal(
    offProduct({
      code: "1",
      product_name: "Test",
      nutriments: { "energy-kcal_100g": -1 },
    })!.kcalPer100,
    null,
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
  assert.equal(
    searchFoods([unit], "boucherie", "personal", "catalog").length,
    1,
  );
});
