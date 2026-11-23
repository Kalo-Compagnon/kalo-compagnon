import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("notifications SQL : RLS, fonctions privées, déduplication, rattachement et données séparées", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated,anon,service_role;
      grant execute on function auth.uid() to authenticated,anon;
      create schema extensions; grant usage on schema extensions to service_role;
      create function extensions.digest(text,text) returns bytea language sql immutable as $$ select decode(md5($1),'hex') $$;`);
    await db.exec(readFileSync("supabase/schema.sql", "utf8"));
    await db.exec(
      readFileSync(
        "supabase/migrations/20261123020508_web_push_reminders.sql",
        "utf8",
      ),
    );
    const a = "10000000-0000-4000-8000-000000000001",
      b = "10000000-0000-4000-8000-000000000002";
    await db.query("insert into auth.users values($1),($2)", [a, b]);
    await db.exec("grant select on public.logger_documents to service_role");
    await db.query(
      "insert into public.logger_push_preferences(user_id,settings) values($1,'{\"version\":1}'),($2,'{\"version\":1}')",
      [a, b],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select * from public.logger_push_preferences")).rows
        .length,
      1,
    );
    await assert.rejects(
      db.query("select * from kalo_private.push_configuration"),
    );
    await assert.rejects(db.query("select public.logger_push_keys()"));
    await assert.rejects(
      db.query(
        "select public.logger_push_snapshot($1,current_date,'Europe/Paris')",
        [b],
      ),
    );
    await assert.rejects(
      db.query(
        "insert into public.logger_push_preferences(user_id,settings) values($1,'{}')",
        [a],
      ),
    );
    await db.exec("reset role; set role service_role");
    const endpoint = "https://web.push.apple.com/test-endpoint-example";
    const register = (user: string, install: string) =>
      db.query<{ id: string }>(
        "select public.logger_push_register($1,$2,$3,$4,$5,$6) as id",
        [
          user,
          install,
          endpoint,
          "A".repeat(87),
          "B".repeat(22),
          "https://kalo-compagnon.github.io/",
        ],
      );
    const first = (await register(a, a)).rows[0].id;
    assert.equal((await register(a, a)).rows[0].id, first);
    const claim = () =>
      db.query<{ claimed: boolean }>(
        "select public.logger_push_claim($1,'day:weight:missing',current_date) as claimed",
        [first],
      );
    assert.equal((await claim()).rows[0].claimed, true);
    assert.equal((await claim()).rows[0].claimed, false);
    await db.query(
      "update public.logger_push_deliveries set lease_until=now()-interval '1 second' where subscription_id=$1",
      [first],
    );
    assert.equal((await claim()).rows[0].claimed, true);
    await db.query(
      "update public.logger_push_deliveries set sent_at=now(),lease_until=now()-interval '1 second' where subscription_id=$1",
      [first],
    );
    assert.equal((await claim()).rows[0].claimed, false);
    const second = (await register(b, a)).rows[0].id;
    assert.notEqual(second, first);
    assert.equal(
      (await db.query("select * from public.logger_push_deliveries")).rows
        .length,
      0,
    );
    await db.exec("reset role");
    for (const [user, weight] of [
      [a, 70],
      [b, 80],
    ] as const)
      await db.query(
        "insert into public.logger_documents(user_id,key,value) values($1,'day/2026-11-23',$2)",
        [user, JSON.stringify({ weightKg: weight })],
      );
    await db.query(
      "insert into public.logger_documents(user_id,key,value) values($1,'entry/today',$2),($1,'entry/yesterday',$3)",
      [
        a,
        JSON.stringify({
          timestamp: Date.parse("2026-11-23T08:00:00+01:00"),
          calories: 300,
          type: "food",
        }),
        JSON.stringify({
          timestamp: Date.parse("2026-11-22T08:00:00+01:00"),
          calories: 900,
          type: "food",
        }),
      ],
    );
    await db.exec("set role service_role");
    const result = (
      await db.query<{
        snapshot: { day: { weightKg: number }; entries: unknown[] };
      }>(
        "select public.logger_push_snapshot($1,'2026-11-23','Europe/Paris') as snapshot",
        [a],
      )
    ).rows[0].snapshot;
    assert.equal(result.day.weightKg, 70);
    assert.equal(result.entries.length, 1);
  } finally {
    await db.close();
  }
});
