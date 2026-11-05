import { chromium, expect } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
}).format(new Date());
let queue = Promise.resolve();
function asUser(uid, work) {
  const result = queue.then(async () => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
    try {
      return await work();
    } finally {
      await db.exec("reset role");
    }
  });
  queue = result.catch(() => {});
  return result;
}
try {
  await db.exec(`create role authenticated; create role anon;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(readFileSync("supabase/schema.sql", "utf8"));
  await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
  for (const [uid, name, accent, calories] of [
    [a, "Profil A", "#dc92b7", 500],
    [b, "Profil B", "#80b4e7", 700],
  ]) {
    const docs = {
      "settings/displayName": name,
      "settings/profileCompleted": true,
      "settings/haloColor": accent,
      "settings/basal": 1500,
      "settings/deficitGoal": 300,
      "settings/target": 2000,
      [`day/${today}`]: { basal: 1500, steps: 1000 },
      "entry/food": {
        id: "food",
        timestamp: new Date(`${today}T12:00:00+01:00`).getTime(),
        type: "meal",
        foodName: "Déjeuner",
        calories,
      },
    };
    for (const [key, value] of Object.entries(docs))
      await db.query(
        "insert into public.logger_documents(user_id,key,value) values($1,$2,$3::jsonb)",
        [uid, key, JSON.stringify(value)],
      );
  }
  await db.exec(
    readFileSync("supabase/migrations/20261105210000_private_duo.sql", "utf8"),
  );
  await db.query(
    "insert into public.logger_private_duo_pair(singleton,first_user,second_user) values(true,$1,$2)",
    [a, b],
  );
  const errors = [];
  async function createPage(uid) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "fr-FR",
      timezoneId: "Europe/Paris",
    });
    await context.addInitScript(
      (uid) =>
        localStorage.setItem(
          "sb-rlatjredsjvgjsbrqmtm-auth-token",
          JSON.stringify({
            access_token: uid,
            refresh_token: "test-refresh",
            token_type: "bearer",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: uid,
              aud: "authenticated",
              role: "authenticated",
              email: "duo@example.test",
            },
          }),
        ),
      uid,
    );
    await context.route("https://*.supabase.co/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      try {
        const data = await asUser(uid, async () => {
          if (url.pathname.endsWith("/logger_documents"))
            return (
              await db.query(
                "select key,value,revision::int from public.logger_documents where user_id=$1 order by key limit $2 offset $3",
                [
                  url.searchParams.get("user_id")?.slice(3) ?? uid,
                  Number(url.searchParams.get("limit") ?? 500),
                  Number(url.searchParams.get("offset") ?? 0),
                ],
              )
            ).rows;
          if (url.pathname.endsWith("/rpc/logger_duo")) {
            const { p_action, p_payload } = request.postDataJSON();
            return (
              await db.query(
                "select public.logger_duo($1,$2::jsonb) as result",
                [p_action, JSON.stringify(p_payload)],
              )
            ).rows[0].result;
          }
          if (url.pathname.endsWith("/rpc/logger_put")) {
            const { p_key, p_value, p_revision } = request.postDataJSON();
            return (
              await db.query(
                "select public.logger_put($1,$2::jsonb,$3::bigint) as result",
                [p_key, JSON.stringify(p_value), p_revision],
              )
            ).rows[0].result;
          }
          return {};
        });
        await route.fulfill({ json: data });
      } catch (error) {
        await route.fulfill({
          status: 400,
          json: { code: error.code, message: error.message },
        });
      }
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://localhost:8787");
    await page.getByRole("button", { name: "Duo", exact: true }).click();
    return page;
  }
  const first = await createPage(a),
    second = await createPage(b);
  for (const page of [first, second]) {
    await expect(
      page.getByRole("button", { name: "Activer mon Duo", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Créer une invitation", exact: true }),
    ).toHaveCount(0);
  }
  await first
    .getByRole("button", { name: "Activer mon Duo", exact: true })
    .click();
  await expect(
    first.getByRole("heading", { name: "Liaison en attente", exact: true }),
  ).toBeVisible();
  await second
    .getByRole("button", { name: "Activer mon Duo", exact: true })
    .click();
  await expect(
    second.getByRole("button", { name: "Gérer mon partage Duo", exact: true }),
  ).toBeVisible();
  await second
    .getByRole("button", { name: "Gérer mon partage Duo", exact: true })
    .click();
  for (const checkbox of await second.getByRole("checkbox").all())
    await expect(checkbox).not.toBeChecked();
  for (const name of [
    "Activité physique",
    "Objectifs",
    "Calories et alimentation",
  ]) {
    await second.getByRole("checkbox", { name, exact: true }).check();
    await expect(
      second.getByRole("checkbox", { name, exact: true }),
    ).toBeChecked();
  }
  await second.getByRole("button", { name: "Fermer", exact: true }).click();
  await first
    .getByRole("button", { name: "Actualiser Duo", exact: true })
    .click();
  await expect(
    first.getByRole("region", { name: "Accueil de Profil B", exact: true }),
  ).toContainText("700 kcal");
  await expect(
    first.getByRole("region", {
      name: "Profil B · Activité physique",
      exact: true,
    }),
  ).toContainText("1300");
  await expect(first.locator("canvas")).toHaveAttribute(
    "aria-label",
    /Profil B, apport 700 kcal/,
  );
  await expect(
    second.getByRole("region", { name: "Accueil de Profil A", exact: true }),
  ).toContainText("Non partagé");
  await first
    .getByRole("button", { name: "Révoquer la liaison", exact: true })
    .click();
  await first.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(
    first.getByRole("button", { name: "Activer mon Duo", exact: true }),
  ).toBeVisible();
  await second
    .getByRole("button", { name: "Actualiser Duo", exact: true })
    .click();
  await expect(
    second.getByRole("button", { name: "Activer mon Duo", exact: true }),
  ).toBeVisible();
  await expect(
    second.getByRole("region", { name: "Accueil de Profil A", exact: true }),
  ).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "Duo privé : deux navigateurs + vrai SQL PostgreSQL, activation sans code, partage indépendant, données et révocation OK.",
  );
} finally {
  await browser.close();
  await queue;
  await db.close();
}
