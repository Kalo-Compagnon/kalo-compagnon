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
  for (const uid of [a, b])
    await db.query(
      "insert into public.logger_documents(user_id,key,value) values($1,'settings/profileCompleted','true')",
      [uid],
    );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261109120000_shared_food_catalog.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync("supabase/migrations/20261109130000_food_subtype.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261109140000_food_unit_weight.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261109150000_food_soft_delete.sql",
      "utf8",
    ),
  );
  const errors = [];
  async function createPage(uid) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "fr-FR",
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
              email: "catalogue@example.test",
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
                  uid,
                  Number(url.searchParams.get("limit") ?? 500),
                  Number(url.searchParams.get("offset") ?? 0),
                ],
              )
            ).rows;
          if (url.pathname.endsWith("/logger_food_catalog"))
            return (
              await db.query(
                "select id,value,revision::int from public.logger_food_catalog order by id limit $1 offset $2",
                [
                  Number(url.searchParams.get("limit") ?? 500),
                  Number(url.searchParams.get("offset") ?? 0),
                ],
              )
            ).rows;
          if (url.pathname.endsWith("/rpc/logger_put")) {
            const p = request.postDataJSON();
            return (
              await db.query(
                "select public.logger_put($1,$2::jsonb,$3) as result",
                [p.p_key, JSON.stringify(p.p_value), p.p_revision],
              )
            ).rows[0].result;
          }
          if (url.pathname.endsWith("/rpc/logger_catalog_put")) {
            const p = request.postDataJSON();
            return (
              await db.query(
                "select public.logger_catalog_put($1,$2::jsonb,$3) as result",
                [p.p_id, JSON.stringify(p.p_value), p.p_revision],
              )
            ).rows[0].result;
          }
          return {};
        });
        await route.fulfill({ json: data });
      } catch (error) {
        await route.fulfill({ status: 400, json: { message: error.message } });
      }
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:8787");
    await page.getByRole("button", { name: "Repas", exact: true }).click();
    return page;
  }
  const first = await createPage(a),
    second = await createPage(b);
  await first.locator(".food-create").click();
  await first.getByLabel("Nom", { exact: true }).fill("Produit partagé QA");
  await first.getByLabel("Variante / goût (facultatif)").fill("Vanille");
  await first.getByLabel("kcal", { exact: true }).fill("123");
  await first
    .getByRole("button", { name: "Enregistrer l’aliment", exact: true })
    .click();
  await expect(first.getByRole("dialog")).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await asUser(a, () =>
            db.query("select count(*)::int n from public.logger_food_catalog"),
          )
        ).rows[0].n,
    )
    .toBe(1);
  await second.reload();
  await second.getByRole("button", { name: "Repas", exact: true }).click();
  await second
    .getByLabel("Rechercher", { exact: true })
    .fill("Produit partagé QA");
  await expect(second.locator(".food-result")).toHaveCount(1);
  await expect(second.locator(".food-result")).toContainText("123 kcal/100 g");
  await expect(second.locator(".food-result")).toContainText("Vanille");
  await second.getByLabel("Rechercher", { exact: true }).fill("vanille");
  await expect(second.locator(".food-result")).toHaveCount(1);
  await second
    .getByRole("button", {
      name: "Ajouter aux favoris : Produit partagé QA · Vanille",
      exact: true,
    })
    .click();
  await first.reload();
  await first.getByRole("button", { name: "Repas", exact: true }).click();
  await first
    .getByLabel("Rechercher", { exact: true })
    .fill("Produit partagé QA");
  await expect(
    first.getByRole("button", {
      name: "Ajouter aux favoris : Produit partagé QA · Vanille",
      exact: true,
    }),
  ).toBeVisible();
  const card = second.locator(".food-result"),
    box = await card.boundingBox();
  await second.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
  await second.mouse.down();
  await second.mouse.move(box.x + 10, box.y + box.height / 2, { steps: 12 });
  await second.mouse.up();
  await second.getByLabel("kcal", { exact: true }).fill("234");
  await expect(second.getByLabel("Variante / goût (facultatif)")).toHaveValue(
    "Vanille",
  );
  await second.getByLabel("Variante / goût (facultatif)").fill("Chocolat");
  await second
    .getByRole("button", { name: "Enregistrer l’aliment", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await asUser(a, () =>
            db.query(
              "select value->>'kcalPer100' kcal from public.logger_food_catalog",
            ),
          )
        ).rows[0].kcal,
    )
    .toBe("234");
  await first.reload();
  await first.getByRole("button", { name: "Repas", exact: true }).click();
  await first
    .getByLabel("Rechercher", { exact: true })
    .fill("Produit partagé QA");
  await expect(first.locator(".food-result")).toContainText("234 kcal/100 g");
  await expect(first.locator(".food-result")).toContainText("Chocolat");
  const deletionCard = first.locator(".food-result");
  const deletionBox = await deletionCard.boundingBox();
  await first.mouse.move(
    deletionBox.x + 15,
    deletionBox.y + deletionBox.height / 2,
  );
  await first.mouse.down();
  await first.mouse.move(
    deletionBox.x + 115,
    deletionBox.y + deletionBox.height / 2,
    { steps: 10 },
  );
  await first.mouse.up();
  await first
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmer", exact: true })
    .click();
  await expect(first.locator(".food-result")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          await asUser(a, () =>
            db.query(
              "select value->>'isDeleted' deleted from public.logger_food_catalog",
            ),
          )
        ).rows[0].deleted,
    )
    .toBe("true");
  await second.reload();
  await second.getByRole("button", { name: "Repas", exact: true }).click();
  await second
    .getByLabel("Rechercher", { exact: true })
    .fill("Produit partagé QA");
  await expect(second.locator(".food-result")).toHaveCount(0);
  await expect(first.locator(".entry")).toHaveCount(0);
  await expect(second.locator(".entry")).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "Shared Kalo catalogue: two authenticated browser contexts, PostgreSQL RLS, creation, edits and private favorites OK",
  );
} finally {
  await browser.close();
  await db.close();
}
