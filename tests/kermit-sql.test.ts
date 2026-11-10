import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("Kermit SQL: access, independent quotas, rolling limits, UTC and browser permissions", async () => {
  const db = new PGlite();
  const a = "10000000-0000-4000-8000-000000000001",
    b = "10000000-0000-4000-8000-000000000002",
    outsider = "10000000-0000-4000-8000-000000000003";
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);",
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/20261110200000_kermit_quotas.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const id of [a, b, outsider])
      await db.query("insert into auth.users values($1)", [id]);
    await db.query("insert into public.kermit_users values($1),($2)", [a, b]);
    const reserve = async (id: string, tokens = 1000) =>
      (
        await db.query<{ result: string }>(
          "select public.reserve_kermit_call($1,$2) as result",
          [id, tokens],
        )
      ).rows[0].result;
    assert.equal(await reserve(outsider), "denied");
    await db.exec(
      "create table public.logger_private_duo_pair(first_user uuid, second_user uuid)",
    );
    await db.query("insert into public.logger_private_duo_pair values($1,$2)", [
      a,
      b,
    ]);
    const activation = readFileSync(
      new URL("../supabase/kermit-activation.sql", import.meta.url),
      "utf8",
    );
    await db.exec(activation);
    await db.exec(activation);
    assert.equal(
      (await db.query("select * from public.kermit_users")).rows.length,
      2,
    );
    const concurrent = await Promise.all(
      Array.from({ length: 14 }, () => reserve(a)),
    );
    assert.equal(concurrent.filter((s) => s === "ok").length, 10);
    assert.equal(await reserve(b), "busy");
    await db.exec("truncate public.kermit_calls");
    assert.equal(await reserve(a, 100000), "ok");
    assert.equal(await reserve(b, 100000), "busy");
    await db.exec("truncate public.kermit_calls");
    await db.query(
      "insert into public.kermit_calls(user_id,called_at,reserved_tokens) select $1,date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',1000 from generate_series(1,50)",
      [a],
    );
    assert.equal(await reserve(a), "daily");
    // Move calls out of the rolling minute (even when the test runs at midnight UTC).
    await db.exec(
      "update public.kermit_calls set called_at = now() - interval '2 minutes'",
    );
    assert.equal(await reserve(b), "ok");
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select * from public.kermit_calls"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("insert into public.kermit_users values($1)", [outsider]),
      /permission denied/,
    );
    await assert.rejects(reserve(a), /permission denied/);
    await db.exec("reset role; set role anon");
    await assert.rejects(reserve(a), /permission denied/);
  } finally {
    await db.close();
  }
});
