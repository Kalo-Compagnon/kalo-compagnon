import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261109120000_shared_food_catalog.sql",
    import.meta.url,
  ),
  "utf8",
);
const subtypeMigration = readFileSync(
  new URL(
    "../supabase/migrations/20261109130000_food_subtype.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002";
const food = {
  id: "shared",
  name: "Yaourt Kalo",
  category: "Autres",
  referenceUnit: "g",
  kcalPer100: 100,
  proteinPer100: 4,
  carbsPer100: 8,
  fatPer100: 2,
  isCustom: true,
  isFavorite: true,
  usageCount: 12,
  lastUsedAt: 123,
  note: "private",
  imagePath: "private-photo",
  user_id: a,
};

test("Catalogue SQL : partage entre comptes, champs privés exclus, RLS, validation et conflits", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(schema);
    await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
    await db.query(
      "insert into public.logger_documents(user_id,key,value) values($1,$2,$3::jsonb)",
      [a, "food/shared", JSON.stringify(food)],
    );
    await db.query(
      "insert into public.logger_documents(user_id,key,value) values($1,$2,$3::jsonb)",
      [
        a,
        "food/seed",
        JSON.stringify({ ...food, id: "seed", isCustom: false }),
      ],
    );
    await db.exec(migration);
    await db.exec(subtypeMigration);
    const as = async (uid: string, sql: string, params: any[] = []) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid,
      ]);
      await db.exec(`set role ${uid ? "authenticated" : "anon"}`);
      return db.query<any>(sql, params);
    };
    const rows = (await as(b, "select * from public.logger_food_catalog")).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].value.name, food.name);
    for (const key of [
      "isFavorite",
      "usageCount",
      "lastUsedAt",
      "note",
      "imagePath",
      "user_id",
    ])
      assert.ok(!(key in rows[0].value));
    assert.equal(
      (await as(b, "select * from public.logger_documents")).rows.length,
      0,
    );
    await assert.rejects(
      as("", "select * from public.logger_food_catalog"),
      /permission denied/i,
    );
    await assert.rejects(
      as("", "select public.logger_catalog_put($1,$2::jsonb,0)", [
        "new",
        JSON.stringify({ ...food, id: "new" }),
      ]),
      /permission denied/i,
    );
    await assert.rejects(
      as(b, "update public.logger_food_catalog set revision=99"),
      /permission denied/i,
    );
    await assert.rejects(
      as(b, "delete from public.logger_food_catalog"),
      /permission denied/i,
    );
    const put = async (uid: string, value: any, revision: number) =>
      (
        await as(
          uid,
          "select public.logger_catalog_put($1,$2::jsonb,$3) as result",
          [value.id, JSON.stringify(value), revision],
        )
      ).rows[0].result;
    assert.equal(
      (await put(b, { ...food, name: "Mis à jour", subtype: "Vanille" }, 1))
        .accepted,
      true,
    );
    const conflict = await put(a, { ...food, name: "Ancienne version" }, 1);
    assert.equal(conflict.accepted, false);
    assert.equal(conflict.revision, 2);
    assert.equal(conflict.value.name, "Mis à jour");
    assert.equal(conflict.value.subtype, "Vanille");
    for (const invalid of [
      { ...food, isCustom: false },
      { ...food, source: "ciqual" },
      { ...food, kcalPer100: -1 },
      { ...food, referenceUnit: "kg" },
      { ...food, name: "" },
      { ...food, aliases: [123] },
      { ...food, subtype: ["Vanille"] },
    ])
      await assert.rejects(put(a, invalid, 2));
    await db.exec("reset role");
    await db.exec(migration);
    await db.exec(subtypeMigration);
    const after = (await as(a, "select * from public.logger_food_catalog"))
      .rows;
    assert.equal(after[0].revision, 2);
    assert.equal(after[0].value.name, "Mis à jour");
  } finally {
    await db.close();
  }
});
