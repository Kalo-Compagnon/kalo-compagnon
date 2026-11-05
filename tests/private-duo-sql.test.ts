import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261105210000_private_duo.sql",
    import.meta.url,
  ),
  "utf8",
);
const personalSchema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002",
  outsider = "10000000-0000-4000-8000-000000000003";
async function setup() {
  const db = new PGlite();
  await db.exec(`create role authenticated; create role anon;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(personalSchema);
  await db.query("insert into auth.users(id) values($1),($2),($3)", [
    a,
    b,
    outsider,
  ]);
  const docs: [string, string, unknown][] = [
    [a, "settings/displayName", "Profil A"],
    [b, "settings/displayName", "Profil B"],
    [outsider, "settings/displayName", "Compte test"],
    [b, "settings/haloColor", "#80b4e7"],
    [b, "settings/basal", 1500],
    [b, "settings/deficitGoal", 300],
    [b, "settings/target", 2000],
    [b, "settings/birthDate", "2000-01-01"],
    [
      b,
      "day/2026-11-05",
      {
        weightKg: 80,
        basal: 1500,
        target: 2000,
        steps: 1000,
        fitSteps: 2000,
        fitCalories: 100,
        fitCoveredSteps: 2000,
        manualActivityCalories: 50,
        measurements: { Taille: 80 },
        measurementHistory: [{ timestamp: 1, values: { Taille: 80 } }],
      },
    ],
    [b, "measurement/2026-11-05/Taille", null],
    [
      b,
      "entry/food",
      {
        id: "food",
        timestamp: 1793880000000,
        type: "meal",
        foodName: "Déjeuner",
        calories: 500,
        note: "private-note",
        imagePath: "private-photo",
      },
    ],
    [
      b,
      "fit/walk",
      {
        id: "walk",
        timestamp: 1,
        name: "Marche",
        days: ["2026-11-05"],
        calories: 100,
        steps: 2000,
        coveredSteps: 2000,
        hash: "private-hash",
      },
    ],
    [
      b,
      "physical/record",
      {
        id: "record",
        timestamp: 1,
        weightKg: 80,
        waistCm: 80,
        imagePath: "private-photo",
      },
    ],
  ];
  for (const [uid, key, value] of docs)
    await db.query(
      "insert into public.logger_documents(user_id,key,value) values($1,$2,$3::jsonb)",
      [uid, key, value === null ? null : JSON.stringify(value)],
    );
  return db;
}
test(
  "Duo privé : vrai PostgreSQL, deux accords, filtrage serveur et révocation",
  { timeout: 60000 },
  async (t) => {
    const db = await setup();
    try {
      await db.exec(
        readFileSync(
          new URL("../supabase/migrations/20261105_duo.sql", import.meta.url),
          "utf8",
        ),
      );
      await db.exec(migration);
      await db.query(
        "insert into public.logger_private_duo_pair(singleton,first_user,second_user) values(true,$1,$2)",
        [a, b],
      );
      const auth = async (uid: string) => {
        await db.exec("reset role");
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          uid,
        ]);
        await db.exec("set role authenticated");
      };
      const rpc = async (action = "snapshot", payload: unknown = {}) =>
        (
          await db.query<{ result: any }>(
            "select public.logger_duo($1,$2::jsonb) as result",
            [action, JSON.stringify(payload)],
          )
        ).rows[0].result;
      await t.test(
        "la paire est configurée uniquement côté serveur, aucun partage implicite",
        async () => {
          const pair = (
            await db.query(
              "select first_user,second_user from public.logger_private_duo_pair",
            )
          ).rows[0];
          assert.deepEqual(pair, { first_user: a, second_user: b });
          await auth(a);
          assert.equal((await rpc()).status, "none");
          assert.equal((await rpc("join")).status, "pending");
          assert.equal((await rpc("join")).status, "pending");
          await auth(b);
          assert.equal((await rpc()).status, "none");
          const active = await rpc("join");
          assert.equal(active.status, "active");
          assert.deepEqual(active.documents, []);
          assert.deepEqual(active.sharing, {});
          assert.deepEqual(active.partnerSharing, {});
        },
      );
      await t.test(
        "les permissions ne donnent jamais accès aux documents bruts du partenaire",
        async () => {
          await auth(a);
          assert.equal(
            (
              await db.query(
                "select * from public.logger_documents where user_id=$1",
                [b],
              )
            ).rows.length,
            0,
          );
          await assert.rejects(
            db.query(
              "update public.logger_documents set value=null where user_id=$1",
              [b],
            ),
            /permission denied/,
          );
          await assert.rejects(
            db.query("select * from public.logger_private_duo_pair"),
            /permission denied/,
          );
          await assert.rejects(rpc("invite"), /Action Duo inconnue/);
        },
      );
      await t.test(
        "chaque catégorie filtre les clés et les champs avant la réponse",
        async () => {
          for (const category of [
            "weight",
            "measurements",
            "activity",
            "goals",
            "food",
          ]) {
            await auth(b);
            await rpc("share", { [category]: true });
            await auth(a);
            const snapshot = await rpc();
            const docs = new Map<string, any>(
              snapshot.documents.map((d: any) => [d.key, d.value]),
            );
            const serialized = JSON.stringify(snapshot.documents);
            assert.ok(
              !serialized.includes("private-note") &&
                !serialized.includes("private-photo") &&
                !serialized.includes("private-hash"),
            );
            assert.ok(!docs.has("settings/birthDate"));
            const day = docs.get("day/2026-11-05");
            if (category === "weight") {
              assert.deepEqual(day, { weightKg: 80 });
              assert.equal(docs.get("physical/record").waistCm, undefined);
            }
            if (category === "measurements") {
              assert.equal(day.weightKg, undefined);
              assert.deepEqual(day.measurements, { Taille: 80 });
              assert.equal(docs.get("measurement/2026-11-05/Taille"), null);
              assert.equal(docs.get("physical/record").weightKg, undefined);
            }
            if (category === "activity") {
              assert.equal(day.steps, 1000);
              assert.equal(day.fitCoveredSteps, 2000);
              assert.equal(day.basal, undefined);
              assert.equal(day.weightKg, undefined);
              assert.ok(docs.has("fit/walk"));
              assert.ok(!docs.has("entry/food"));
            }
            if (category === "goals") {
              assert.deepEqual(day, { basal: 1500, target: 2000 });
              assert.equal(docs.get("settings/deficitGoal"), 300);
              assert.ok(!docs.has("entry/food"));
            }
            if (category === "food") {
              assert.equal(day, undefined);
              assert.equal(docs.get("entry/food").calories, 500);
              assert.equal(docs.get("entry/food").note, undefined);
            }
          }
        },
      );
      await t.test(
        "le compte test et les appels anonymes ne peuvent pas obtenir de données réelles",
        async () => {
          await auth(outsider);
          await db.query(
            "select public.logger_put('settings/displayName','\"Profil A\"'::jsonb,1)",
          );
          for (const action of ["snapshot", "join", "share", "revoke"])
            assert.deepEqual(await rpc(action, { food: true }), {
              status: "unavailable",
              mode: "fixed",
            });
          await db.exec("reset role; set role anon");
          await assert.rejects(rpc(), /permission denied/);
        },
      );
      await t.test(
        "réexécuter le script préserve la liaison et les données personnelles",
        async () => {
          await db.exec("reset role");
          await db.exec(migration);
          await auth(a);
          assert.equal((await rpc()).status, "active");
          assert.equal((await rpc()).documents[0].key, "entry/food");
        },
      );
      await t.test(
        "révocation immédiate, aucun rétablissement automatique, nouveaux accords requis",
        async () => {
          await auth(a);
          assert.equal((await rpc("revoke")).status, "none");
          await auth(b);
          assert.equal((await rpc()).status, "none");
          assert.equal((await rpc()).documents, undefined);
          await assert.rejects(rpc("share", { food: true }), /deux accords/);
          assert.equal((await rpc("join")).status, "pending");
          await auth(a);
          assert.equal((await rpc()).status, "none");
          assert.deepEqual((await rpc("join")).documents, []);
          await db.exec("reset role");
          assert.equal(
            (
              await db.query<{ count: number }>(
                "select count(*)::int as count from public.logger_duo_sharing",
              )
            ).rows[0].count,
            0,
          );
          assert.equal(
            (
              await db.query<{ count: number }>(
                "select count(*)::int as count from public.logger_documents",
              )
            ).rows[0].count,
            13,
          );
        },
      );
    } finally {
      await db.close();
    }
  },
);
test(
  "Duo private: absent configuration exposes nothing and clients cannot set the pair",
  { timeout: 60000 },
  async () => {
    const db = await setup();
    try {
      await db.exec(migration);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        a,
      ]);
      await db.exec("set role authenticated");
      const call = async () =>
        (await db.query<{result:{status:string;mode:string}}>("select public.logger_duo() as result")).rows[0].result;
      assert.deepEqual(await call(), { status: "unconfigured", mode: "fixed" });
      await assert.rejects(
        db.query(
          "insert into public.logger_private_duo_pair(singleton,first_user,second_user) values(true,$1,$2)",
          [a, b],
        ),
        /permission denied/,
      );
      await db.exec("reset role");
      await assert.rejects(
        db.query(
          "insert into public.logger_private_duo_pair(singleton,first_user,second_user) values(true,$1,$2)",
          [a, a],
        ),
        /check constraint/,
      );
      await db.query(
        "insert into public.logger_private_duo_pair(singleton,first_user,second_user) values(true,$1,$2)",
        [a, b],
      );
      await db.exec("set role authenticated");
      assert.equal((await call()).status, "none");
    } finally {
      await db.close();
    }
  },
);
