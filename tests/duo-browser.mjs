import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const uid = "10000000-0000-4000-8000-000000000001";
  await page.addInitScript(
    ({ uid }) => {
      localStorage.setItem(
        "sb-rlatjredsjvgjsbrqmtm-auth-token",
        JSON.stringify({
          access_token: "test-session",
          refresh_token: "test-refresh",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: uid,
            aud: "authenticated",
            role: "authenticated",
            email: "local@example.test",
          },
        }),
      );
    },
    { uid },
  );
  let status = "none",
    sharing = {},
    fail = false,
    partnerAccent = "#a89ae5";
  const privatePermissions = {
    weight: false,
    measurements: false,
    activity: false,
    goals: false,
    food: false,
  };
  const snapshot = () => ({
    status,
    code: "private-test-code",
    sharing,
    partner: { name: "Partenaire test", accent: partnerAccent },
    partnerSharing: { ...privatePermissions, weight: true, activity: true },
    documents:
      status === "active"
        ? [
            {
              key: "day/2026-10-01",
              value: {
                weightKg: 80,
                steps: 1000,
                fitSteps: 2000,
                fitCalories: 100,
                fitCoveredSteps: 2000,
                manualActivityCalories: 50,
              },
            },
            { key: "day/2026-10-10", value: { weightKg: 84 } },
          ]
        : [],
  });
  // Every Supabase call is intercepted; no production account is used.
  await page.route("https://*.supabase.co/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/rpc/logger_duo")) {
      if (fail)
        return route.fulfill({ status: 503, json: { message: "offline" } });
      const body = route.request().postDataJSON();
      if (body.p_action === "invite") status = "pending";
      if (body.p_action === "accept") status = "active";
      if (body.p_action === "share") sharing = body.p_payload;
      if (body.p_action === "revoke") status = "none";
      return route.fulfill({ json: snapshot() });
    }
    if (url.includes("/rpc/logger_put"))
      return route.fulfill({ json: { accepted: true, revision: 1 } });
    if (url.includes("/logger_food_catalog"))
      return route.fulfill({ json: [] });
    if (url.includes("/logger_documents"))
      return route.fulfill({
        json: [
          { key: "settings/displayName", value: "Moi test", revision: 1 },
          { key: "settings/haloColor", value: "#226688", revision: 1 },
          { key: "settings/profileCompleted", value: true, revision: 1 },
        ],
      });
    return route.fulfill({ json: {} });
  });
  await page.goto("http://localhost:8787");
  await expect(page.locator(".liquid-nav button")).toHaveCount(4);
  const tab = (name) => page.getByRole("button", { name, exact: true }).click();
  await tab("Corps");
  await expect(page.getByLabel("Pas à ajouter", { exact: true })).toBeVisible();
  await tab("Mensurations");
  await expect(page.locator(".body-figure")).toBeVisible();
  await tab("Duo");
  await expect(
    page.getByText("Aucun partenaire associé", { exact: true }),
  ).toBeVisible();
  await tab("Créer une invitation");
  await expect(
    page.getByText("Liaison en attente", { exact: true }),
  ).toBeVisible();
  await tab("Révoquer la liaison");
  await tab("Confirmer");
  await expect(
    page.getByText("Aucun partenaire associé", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Code reçu de mon partenaire").fill("test-code");
  await tab("Accepter cette liaison");
  await expect(
    page.getByRole("heading", { name: "Partenaire test", exact: true }),
  ).toBeVisible();
  const halo = page.locator(".ambient-halo");
  await expect(halo).toHaveCSS(
    "background-image",
    /linear-gradient\(90deg, rgb\(34, 102, 136\) 0%, rgb\(34, 102, 136\) 50%, rgb\(168, 154, 229\) 50%, rgb\(168, 154, 229\) 100%\)/,
  );
  const geometry = () =>
    halo.evaluate((element) => {
      const style = getComputedStyle(element);
      return [
        "width",
        "height",
        "top",
        "right",
        "opacity",
        "filter",
        "borderRadius",
        "position",
      ].map((key) => style[key]);
    });
  const originalGeometry = await geometry();
  await tab("Accueil");
  await expect(halo).toHaveCSS("background-image", "none");
  assert.deepEqual(await geometry(), originalGeometry);
  await tab("Duo");
  await expect(halo).toHaveCSS("background-image", /linear-gradient/);
  partnerAccent = null;
  await tab("Actualiser Duo");
  await expect(
    page.getByRole("heading", { name: "Partenaire test", exact: true }),
  ).toBeVisible();
  await expect(halo).toHaveCSS("background-image", "none");
  await expect(halo).toHaveCSS("background-color", "rgb(34, 102, 136)");
  partnerAccent = "#a89ae5";
  await tab("Actualiser Duo");
  await expect(halo).toHaveCSS("background-image", /linear-gradient/);
  await page.getByLabel("Journée du Duo").fill("2026-10-01");
  await expect(
    page.getByRole("region", { name: "Partenaire test · Activité physique" }),
  ).toContainText("3300");
  await expect(page.getByText("Catégorie non autorisée.")).toHaveCount(2);
  assert.equal(
    await page.evaluate(async (uid) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("logger-web-v2");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const documents = await new Promise((resolve, reject) => {
        const request = database
          .transaction("documents")
          .objectStore("documents")
          .get(uid);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return documents.some((d) => d.key === "day/2026-10-01");
    }, uid),
    false,
    "partner documents must never enter the personal store",
  );
  await tab("Gérer mon partage Duo");
  await expect(page.getByRole("checkbox")).toHaveCount(5);
  for (const checkbox of await page.getByRole("checkbox").all())
    await expect(checkbox).not.toBeChecked();
  await page
    .getByRole("checkbox", { name: "Poids et progression", exact: true })
    .check();
  await expect(
    page.getByRole("checkbox", { name: "Poids et progression", exact: true }),
  ).toBeChecked();
  await tab("Fermer");
  await page.screenshot({ path: "qa/duo-shared-mobile.png", fullPage: true });
  for (const width of [320, 390, 768, 844, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ["Accueil", "Repas", "Corps", "Duo"]) {
      await tab(name);
      await expect(
        page.locator('.liquid-nav button[aria-current="page"]'),
      ).toHaveCount(1);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${name} overflow at ${width}`,
      );
    }
  }
  fail = true;
  await tab("Actualiser Duo");
  await expect(page.getByRole("alert")).toContainText("Duo indisponible");
  await expect(halo).toHaveCSS("background-image", "none");
  await expect(page.getByText("Partenaire test", { exact: true })).toHaveCount(
    0,
  );
  await tab("Accueil");
  await expect(page.locator(".weight-tracking")).toBeVisible();
  await tab("Moi test · Compte");
  await tab("Se déconnecter");
  await expect(
    page.getByRole("button", { name: "Mode local · Se connecter" }),
  ).toBeVisible();
  await tab("Duo");
  await expect(
    page.getByText(/Connecte-toi à ton compte pour associer/),
  ).toBeVisible();
  await expect(page.getByText("Partenaire test", { exact: true })).toHaveCount(
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Duo : parcours simulés, consentement, partage, erreur réseau et cinq largeurs OK.",
  );
} finally {
  await browser.close();
}
