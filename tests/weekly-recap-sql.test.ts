import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("récap SQL : données privées, source minimale, bail exclusif et archive immuable", async () => {
  const db = new PGlite();
  const a = "10000000-0000-4000-8000-000000000001",
    b = "10000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon;
      create table public.kermit_users(user_id uuid primary key references auth.users(id));`);
    await db.exec(readFileSync("supabase/schema.sql", "utf8"));
    await db.exec(readFileSync("supabase/weekly-recaps.sql", "utf8"));
    await db.exec(readFileSync("supabase/weekly-recap-jobs.sql", "utf8"));
    await db.exec(readFileSync("supabase/weekly-recap-diagnostics.sql", "utf8"));
    await db.query("insert into auth.users values($1),($2)", [a, b]);
    for (const [user, weight] of [
      [a, 70],
      [b, 80],
    ] as const) {
      await db.query(
        "insert into public.logger_documents(user_id,key,value) values($1,'day/2026-11-16',$2),($1,'settings/displayName','\"PRIVATE-NAME\"'),($1,'settings/deficitGoal','300')",
        [user, JSON.stringify({ weightKg: weight, steps: 1000 })],
      );
      await db.query(
        "insert into public.logger_documents(user_id,key,value) values($1,'entry/today',$2)",
        [
          user,
          JSON.stringify({
            timestamp: Date.parse("2026-11-16T12:00:00+01:00"),
            calories: 500,
            foodName: "PRIVATE-FOOD",
            note: "PRIVATE-NOTE",
            imagePath: "PRIVATE-PHOTO",
            proteinGrams: 20,
          }),
        ],
      );
    }
    await db.query(
      "insert into public.logger_weekly_preferences(user_id,enabled) values($1,true),($2,false)",
      [a, b],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select * from public.logger_weekly_preferences")).rows
        .length,
      1,
    );
    await assert.rejects(
      db.query("select public.logger_weekly_source($1,'2026-11-16')", [b]),
    );
    await assert.rejects(
      db.query("select public.logger_weekly_claim($1,'2026-11-16')", [a]),
    );
    await assert.rejects(
      db.query("update public.logger_weekly_preferences set enabled=true"),
    );
    await assert.rejects(db.query("select * from public.logger_weekly_jobs"));
    await assert.rejects(
      db.query(
        "insert into public.logger_weekly_jobs(user_id,week_start) values($1,'2026-11-16')",
        [a],
      ),
    );
    await db.exec("reset role;set role service_role");
    const first = (
      await db.query<{ lease: string }>(
        "select public.logger_weekly_claim($1,'2026-11-16') as lease",
        [a],
      )
    ).rows[0].lease;
    assert.ok(first);
    assert.equal(
      (
        await db.query<{ lease: string | null }>(
          "select public.logger_weekly_claim($1,'2026-11-16') as lease",
          [a],
        )
      ).rows[0].lease,
      null,
    );
    const source = (
      await db.query<{ source: unknown }>(
        "select public.logger_weekly_source($1,'2026-11-16') as source",
        [a],
      )
    ).rows[0].source;
    const json = JSON.stringify(source);
    assert.ok(!json.includes("PRIVATE-"));
    assert.ok(json.includes('"weightKg":70'));
    assert.ok(!json.includes('"weightKg":80'));
    await db.query(
      "update public.logger_weekly_reports set lease_until=now()-interval '1 second' where user_id=$1",
      [a],
    );
    const second = (
      await db.query<{ lease: string }>(
        "select public.logger_weekly_claim($1,'2026-11-16') as lease",
        [a],
      )
    ).rows[0].lease;
    assert.notEqual(second, first);
    await db.query(
      "update public.logger_weekly_reports set status='ready',metrics='{}',narrative='{}' where user_id=$1 and lease_token=$2",
      [a, first],
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.logger_weekly_reports where user_id=$1",
          [a],
        )
      ).rows[0].status,
      "generating",
    );
    await db.query(
      "update public.logger_weekly_reports set status='ready',metrics='{}',narrative='{}' where user_id=$1 and lease_token=$2",
      [a, second],
    );
    assert.equal(
      (
        await db.query<{ lease: string | null }>(
          "select public.logger_weekly_claim($1,'2026-11-16') as lease",
          [a],
        )
      ).rows[0].lease,
      null,
    );
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    await db.exec("set role authenticated");
    assert.equal(
      (
        await db.query(
          "select week_start,status,metrics from public.logger_weekly_reports",
        )
      ).rows.length,
      0,
    );
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    await db.exec("set role authenticated");
    assert.equal(
      (
        await db.query(
          "select week_start,status,metrics from public.logger_weekly_reports",
        )
      ).rows.length,
      1,
    );
    await assert.rejects(
      db.query("select lease_token from public.logger_weekly_reports"),
    );
    await assert.rejects(db.query("select error_detail from public.logger_weekly_reports"));
  } finally {
    await db.close();
  }
});
