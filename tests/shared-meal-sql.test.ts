import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (name: string) =>
  readFileSync(new URL(`../supabase/${name}`, import.meta.url), "utf8");
const migration = read("migrations/20261110180622_shared_meal_catalog.sql");
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002";
const food = {
  id: "ciqual-test",
  name: "Ingredient",
  category: "Autres",
  referenceUnit: "g",
  kcalPer100: 100,
  proteinPer100: 4,
  carbsPer100: 10,
  fatPer100: 2,
  isCustom: false,
  source: "ciqual",
  isFavorite: true,
  usageCount: 5,
  note: "private ingredient",
};
const meal = {
  id: "recipe-test",
  name: "Recette",
  ingredients: [
    {
      id: "part",
      foodId: food.id,
      quantity: 100,
      isVariable: false,
      weightBasis: "raw",
      private: "private part",
    },
  ],
  cachedCalories: 100,
  cachedProtein: 4,
  cachedCarbs: 10,
  cachedFat: 2,
  portionTracking: { estimatedWeightGrams: 300, finished: true },
  isFavorite: true,
  usageCount: 10,
  notes: "private notes",
  imagePath: "private photo",
  createdAt: 100,
};

test("Recettes SQL : reprise des recettes et ingredients, RLS, droits, validation et revisions", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema public,auth to anon,authenticated;`);
    await db.exec(read("schema.sql"));
    await db.exec(read("shared-catalog-activation.sql"));
    await db.query("insert into auth.users values($1),($2)", [a, b]);
    await db.query(
      "insert into logger_documents(user_id,key,value) values($1,$2,$3::jsonb),($1,$4,$5::jsonb)",
      [
        a,
        `food/${food.id}`,
        JSON.stringify(food),
        `meal/${meal.id}`,
        JSON.stringify(meal),
      ],
    );
    await db.exec(migration);
    const row = (
      await db.query<{ value: any }>("select value from logger_meal_catalog")
    ).rows[0];
    assert(row);
    assert.equal(row.value.name, "Recette");
    assert.equal(row.value.ingredientFoods[0].source, "ciqual");
    assert.equal(row.value.ingredients[0].weightBasis, "raw");
    assert(!JSON.stringify(row.value).includes("private"));
    assert(!("portionTracking" in row.value));
    assert.equal(
      (
        await db.query<{ value: any }>(
          "select value from logger_documents where key=$1",
          [`meal/${meal.id}`],
        )
      ).rows[0].value.notes,
      "private notes",
    );
    const as = async (uid: string, query: string, params: any[] = []) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid,
      ]);
      await db.exec(uid ? "set role authenticated" : "set role anon");
      return db.query(query, params);
    };
    assert.equal(
      (await as(b, "select * from public.logger_meal_catalog")).rows.length,
      1,
    );
    await assert.rejects(
      as("", "select * from public.logger_meal_catalog"),
      /permission denied/,
    );
    await assert.rejects(
      as("", "select public.logger_meal_catalog_put($1,$2::jsonb,1)", [
        meal.id,
        JSON.stringify(row.value),
      ]),
      /permission denied/,
    );
    await assert.rejects(
      as(b, "update public.logger_meal_catalog set value=null"),
      /permission denied/,
    );
    await assert.rejects(
      as(b, "delete from public.logger_meal_catalog"),
      /permission denied/,
    );
    await assert.rejects(
      as(b, "select public.logger_meal_catalog_value($1,$2::jsonb)", [
        meal.id,
        JSON.stringify(row.value),
      ]),
      /permission denied/,
    );
    const put = async (value: unknown, revision: number) =>
      (
        await as(
          b,
          "select public.logger_meal_catalog_put($1,$2::jsonb,$3) as result",
          [meal.id, JSON.stringify(value), revision],
        )
      ).rows[0] as { result: any };
    const changed = {
      ...row.value,
      name: "Modifiee",
      notes: "private",
      ingredientFoods: [
        { ...row.value.ingredientFoods[0], isFavorite: true, usageCount: 99 },
      ],
    };
    assert.equal((await put(changed, 1)).result.accepted, true);
    assert.equal((await put(changed, 1)).result.accepted, false);
    const shared = (await as(a, "select value from public.logger_meal_catalog"))
      .rows[0] as { value: any };
    assert(!JSON.stringify(shared.value).includes("private"));
    assert(!("isFavorite" in shared.value.ingredientFoods[0]));
    await assert.rejects(
      put(
        {
          ...changed,
          ingredients: [{ ...changed.ingredients[0], quantity: -1 }],
        },
        2,
      ),
      /Invalid recipe ingredient/,
    );
    await assert.rejects(
      put({ ...changed, ingredientFoods: [] }, 2),
      /Invalid recipe ingredients/,
    );
    await assert.rejects(
      put(
        {
          ...changed,
          ingredientFoods: [
            { ...changed.ingredientFoods[0], source: "private" },
          ],
        },
        2,
      ),
      /Invalid ingredient source/,
    );
    assert.equal((await put(null, 2)).result.accepted, true);
    assert.equal(
      (
        (await as(a, "select value from public.logger_meal_catalog"))
          .rows[0] as { value: any }
      ).value,
      null,
    );
  } finally {
    await db.close();
  }
});
