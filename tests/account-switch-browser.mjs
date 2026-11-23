import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const ids = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
];
const users = ids.map((id, i) => ({
  id,
  email: `${i ? "b" : "a"}@example.test`,
  aud: "authenticated",
  role: "authenticated",
}));
function token(id, exp = Math.floor(Date.now() / 1000) + 3600) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: id,
        exp,
        iat: exp - 3600,
        aud: "authenticated",
        role: "authenticated",
      }),
    ).toString("base64url"),
    "test",
  ].join(".");
}
function session(user) {
  return {
    access_token: token(user.id),
    refresh_token: `refresh-${user.id}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}
const docs = new Map(
  ids.map((id, i) => [
    id,
    new Map([
      [
        "settings/displayName",
        {
          key: "settings/displayName",
          value: i ? "Compte B" : "Compte A",
          revision: 1,
        },
      ],
      [
        "settings/profileCompleted",
        { key: "settings/profileCompleted", value: true, revision: 1 },
      ],
    ]),
  ]),
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("https://*.supabase.co/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const jwt = req.headers().authorization?.slice(7);
    let uid;
    try {
      uid = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString(),
      ).sub;
    } catch {}
    if (url.pathname.endsWith("/token")) {
      const body = req.postDataJSON();
      const user =
        url.searchParams.get("grant_type") === "password"
          ? users.find(
              (u) =>
                u.email === body.email && body.password === "password-test",
            )
          : users.find((u) => body.refresh_token === `refresh-${u.id}`);
      return user
        ? route.fulfill({ json: session(user) })
        : route.fulfill({
            status: 400,
            json: { code: "invalid_credentials", message: "Connexion refusée" },
          });
    }
    if (url.pathname.endsWith("/user"))
      return route.fulfill({ json: users.find((u) => u.id === uid) });
    if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204 });
    if (url.pathname.endsWith("/logger_documents")) {
      assert.equal(url.searchParams.get("user_id"), `eq.${uid}`);
      return route.fulfill({ json: [...docs.get(uid).values()] });
    }
    if (url.pathname.endsWith("/rpc/logger_put")) {
      const { p_key, p_value } = req.postDataJSON();
      const revision = (docs.get(uid).get(p_key)?.revision ?? 0) + 1;
      docs.get(uid).set(p_key, { key: p_key, value: p_value, revision });
      return route.fulfill({
        json: { accepted: true, revision, value: p_value },
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto(process.env.APP_URL || "http://127.0.0.1:5173/");
  await page.evaluate(
    (s) =>
      localStorage.setItem(
        "sb-rlatjredsjvgjsbrqmtm-auth-token",
        JSON.stringify(s),
      ),
    session(users[0]),
  );
  await page.reload();
  await expect(page.locator(".account-access")).toContainText("Compte A");
  await page.locator(".account-access").click();
  await page
    .getByRole("button", { name: "Ajouter un compte", exact: true })
    .click();
  await page.getByLabel("Adresse e-mail", { exact: true }).fill(users[1].email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Connexion refusée" }),
  ).toBeVisible();
  await expect(page.locator(".account-access")).toContainText("Compte A");
  await page.getByLabel("Mot de passe", { exact: true }).fill("password-test");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.locator(".account-access")).toContainText("Compte B");
  await page.locator(".account-access").click();
  await expect(page.locator(".account-switcher-row")).toHaveCount(2);
  await page
    .locator("dialog[open]")
    .evaluate(async (el) =>
      Promise.all(el.getAnimations().map((a) => a.finished)),
    );
  await page.screenshot({ path: "qa/account-switch-mobile.png" });
  await page
    .getByRole("button", { name: `Utiliser ${users[0].email}`, exact: true })
    .click();
  await expect(page.locator(".account-access")).toContainText("Compte A");
  await page.reload();
  await expect(page.locator(".account-access")).toContainText("Compte A");
  await page.locator(".account-access").click();
  await expect(page.locator(".account-switcher-row")).toHaveCount(2);
  await page
    .getByRole("button", { name: `Utiliser ${users[1].email}`, exact: true })
    .click();
  await expect(page.locator(".account-access")).toContainText("Compte B");
  await page.locator(".account-access").click();
  await page
    .getByRole("button", { name: `Utiliser ${users[0].email}`, exact: true })
    .click();
  await expect(page.locator(".account-access")).toContainText("Compte A");
  // A revoked inactive session must leave the active journal intact.
  await page.evaluate(
    ({ id, expired }) => {
      const key = Object.keys(localStorage).find((k) =>
        k.startsWith("kalo:accounts:"),
      );
      const saved = JSON.parse(localStorage.getItem(key));
      saved.find((a) => a.id === id).tokens = {
        access_token: expired,
        refresh_token: "revoked",
      };
      localStorage.setItem(key, JSON.stringify(saved));
    },
    { id: ids[1], expired: token(ids[1], 1000) },
  );
  await page.locator(".account-access").click();
  await page
    .getByRole("button", { name: `Utiliser ${users[1].email}`, exact: true })
    .click();
  await expect(page.getByLabel("Adresse e-mail", { exact: true })).toHaveValue(
    users[1].email,
  );
  await expect(page.locator(".account-access")).toContainText("Compte A");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page
    .getByRole("button", {
      name: `Retirer ${users[1].email} de cet appareil`,
      exact: true,
    })
    .click();
  await expect(page.locator(".account-switcher-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await expect(page.locator(".account-access")).toContainText("Mode local");
  await page.locator(".account-access").click();
  await expect(page.locator(".account-switcher-row")).toHaveCount(0);
  assert.deepEqual(errors, []);
  assert.equal(docs.get(ids[0]).get("settings/displayName").value, "Compte A");
  assert.equal(docs.get(ids[1]).get("settings/displayName").value, "Compte B");
  console.log(
    "Comptes : ajout, échec de connexion, aller-retour, rechargement, révocation, retrait et déconnexion OK",
  );
} finally {
  await browser.close();
}
