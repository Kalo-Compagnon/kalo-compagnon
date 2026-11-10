import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Repository } from "../src/persistence";
import { sharedMeal } from "../src/shared-meal";
import { mealRecipeDraft } from "../src/meal-draft";
import { initialState, type Food, type Meal } from "../src/domain";

export const recipeFood: Food = {
  id: "recipe-food",
  name: "Ingredient",
  category: "Autres",
  referenceUnit: "g",
  kcalPer100: 100,
  proteinPer100: 4,
  carbsPer100: 10,
  fatPer100: 2,
  source: "ciqual",
  isCustom: false,
  isFavorite: true,
  usageCount: 8,
  lastUsedAt: 100,
};
export const recipeMeal: Meal = {
  id: "shared-meal",
  name: "Recette commune",
  ingredients: [
    {
      id: "part",
      foodId: recipeFood.id,
      quantity: 100,
      isVariable: false,
      weightBasis: "raw",
    },
  ],
  cachedCalories: 100,
  cachedProtein: 4,
  cachedCarbs: 10,
  cachedFat: 2,
  isFavorite: true,
  usageCount: 10,
  lastUsedAt: 200,
  createdAt: 10,
  notes: "private note",
  imagePath: "private photo",
  cookedWeightGrams: 300,
};

function backend() {
  type Row = { value: any; revision: number };
  const shared = new Map<string, Map<string, Row>>([
    ["logger_food_catalog", new Map()],
    ["logger_meal_catalog", new Map()],
  ]);
  const personal = new Map<string, Map<string, Row>>();
  let offline = false,
    recipesAvailable = true;
  return {
    shared,
    personal,
    offline: (value: boolean) => {
      offline = value;
    },
    recipesAvailable: (value: boolean) => {
      recipesAvailable = value;
    },
    client(uid: string) {
      const own = personal.get(uid) ?? new Map<string, Row>();
      personal.set(uid, own);
      return {
        from(table: string) {
          const rows = shared.get(table) ?? own;
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return this;
            },
            async range(first: number, last: number) {
              if (
                offline ||
                (table === "logger_meal_catalog" && !recipesAvailable)
              )
                return { error: new Error("Offline"), data: null };
              return {
                error: null,
                data: [...rows]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .slice(first, last + 1)
                  .map(([id, row]) => ({
                    ...(shared.has(table) ? { id } : { key: id }),
                    ...structuredClone(row),
                  })),
              };
            },
          };
        },
        async rpc(
          name: string,
          p: {
            p_id?: string;
            p_key?: string;
            p_value: any;
            p_revision: number;
          },
        ) {
          const table =
            name === "logger_meal_catalog_put"
              ? "logger_meal_catalog"
              : name === "logger_catalog_put"
                ? "logger_food_catalog"
                : "";
          if (offline || (table === "logger_meal_catalog" && !recipesAvailable))
            return { error: new Error("Offline"), data: null };
          const rows = shared.get(table) ?? own,
            id = (table ? p.p_id : p.p_key)!;
          const old = rows.get(id);
          if ((old?.revision ?? 0) !== p.p_revision)
            return {
              error: null,
              data: {
                accepted: false,
                revision: old?.revision ?? 0,
                value: old?.value ?? null,
              },
            };
          rows.set(id, {
            value: structuredClone(p.p_value),
            revision: p.p_revision + 1,
          });
          return {
            error: null,
            data: { accepted: true, revision: p.p_revision + 1 },
          };
        },
      } as unknown as SupabaseClient;
    },
  };
}

test("Recettes communes : ingredients utilisables, preferences et portions privees, modification, suppression et cache", async () => {
  const cloud = backend(),
    a = new Repository(cloud.client("recipe-a")),
    b = new Repository(cloud.client("recipe-b"));
  await a.load("recipe-a");
  await b.load("recipe-b");
  await a.update((s) => {
    s.foods.push(structuredClone(recipeFood));
    s.meals.push(structuredClone(recipeMeal));
  });
  await a.sync();
  await b.sync();
  assert.equal(b.state.meals[0].name, recipeMeal.name);
  assert.equal(b.state.meals[0].isFavorite, false);
  assert.equal(b.state.meals[0].notes, undefined);
  assert.equal(b.state.meals[0].imagePath, undefined);
  assert.equal(b.state.meals[0].usageCount, 0);
  assert.equal(
    b.state.foods.find((f) => f.id === recipeFood.id)?.source,
    "ciqual",
  );
  assert.equal(
    b.state.foods.find((f) => f.id === recipeFood.id)?.isFavorite,
    false,
  );
  assert.equal(a.state.meals[0].notes, "private note");
  assert(!JSON.stringify(cloud.shared).includes("private note"));
  await b.update((s) => {
    s.meals[0].isFavorite = true;
  });
  assert.equal(
    b.docs.find((d) => d.key === "recipe/shared-meal")?.pending,
    false,
  );
  await b.sync();
  await a.update((s) => {
    s.meals[0].portionTracking = { estimatedWeightGrams: 300, finished: true };
  });
  await a.sync();
  await b.sync();
  assert.equal(b.state.meals[0].portionTracking, undefined);
  await b.update((s) => {
    s.meals[0].name = "Recette modifiée";
  });
  await b.sync();
  await a.sync();
  assert.equal(a.state.meals[0].name, recipeMeal.name); // Historical batch unchanged.
  assert.equal(a.state.meals[0].portionTracking?.finished, true);
  const draft = mealRecipeDraft(a.state.meals[0]);
  assert.equal(draft.portionTracking, undefined);
  assert.notEqual(draft.id, recipeMeal.id);
  const fresh = new Repository(cloud.client("recipe-c"));
  await fresh.load("recipe-c");
  await fresh.sync();
  assert.equal(fresh.state.meals[0].name, "Recette modifiée");
  await fresh.update((s) => {
    s.settings.deficitGoal = 500;
  });
  assert(!fresh.docs.some((d) => d.key === "meal/shared-meal"));
  const cached = new Repository(null);
  await cached.load("recipe-c");
  assert.equal(cached.state.meals[0].name, "Recette modifiée");
  await b.update((s) => {
    s.meals = [];
  });
  await b.sync();
  await fresh.sync();
  await a.sync();
  assert.equal(fresh.state.meals.length, 0);
  assert.equal(a.state.meals[0].portionTracking?.finished, true);
  assert.equal(
    cloud.shared.get("logger_meal_catalog")!.get(recipeMeal.id)!.value,
    null,
  );
});

test("Recettes communes : hors ligne, conflits de revision et catalogue absent sans bloquer le journal", async () => {
  const cloud = backend(),
    a = new Repository(cloud.client("offline-recipe-a")),
    b = new Repository(cloud.client("offline-recipe-b"));
  await a.load("offline-recipe-a");
  await b.load("offline-recipe-b");
  cloud.offline(true);
  await a.update((s) => {
    s.foods.push({ ...recipeFood });
    s.meals.push({ ...recipeMeal });
  });
  await a.sync();
  assert(a.docs.some((d) => d.key.startsWith("recipe/") && d.pending));
  cloud.offline(false);
  await a.sync();
  await b.sync();
  await a.update((s) => {
    s.meals[0].name = "A";
  });
  await b.update((s) => {
    s.meals[0].name = "B";
  });
  await a.sync();
  await b.sync();
  assert(b.docs.find((d) => d.key === "recipe/shared-meal")?.conflict);
  await b.resolve("recipe/shared-meal", false);
  await a.sync();
  assert.equal(a.state.meals[0].name, "B");
  cloud.recipesAvailable(false);
  await b.update((s) => {
    s.entries.push({
      id: "private-entry",
      type: "extra",
      timestamp: 1,
      foodName: "Private",
      calories: 42,
    });
  });
  await b.sync();
  assert(cloud.personal.get("offline-recipe-b")!.has("entry/private-entry"));
});

test("Recettes communes : serialisation exclut les champs prives et garde les ingredients Ciqual", () => {
  const value = sharedMeal(
    { ...recipeMeal, portionTracking: { estimatedWeightGrams: 400 } },
    [recipeFood],
  )!;
  for (const key of [
    "isFavorite",
    "usageCount",
    "lastUsedAt",
    "notes",
    "imagePath",
    "portionTracking",
    "cookedWeightGrams",
    "createdAt",
  ])
    assert(!(key in value));
  for (const key of ["isFavorite", "usageCount", "lastUsedAt"])
    assert(!(key in value.ingredientFoods[0]));
  assert.equal(value.ingredientFoods[0].source, "ciqual");
  assert.equal(sharedMeal(recipeMeal, initialState().foods), null);
});
