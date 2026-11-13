import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const uid = "10000000-0000-4000-8000-000000000001";
  const today = new Date().toISOString().slice(0, 10);
  const own = Object.entries({
    "settings/displayName": "Loric",
    "settings/sex": "male",
    "settings/profileCompleted": true,
    [`day/${today}`]: { measurements: { Poitrine: 103, Taille: 93 } },
  }).map(([key, value]) => ({ key, value, revision: 1 }));
  let shared = true,
    writes = 0;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((id) => {
    localStorage.setItem(
      "sb-rlatjredsjvgjsbrqmtm-auth-token",
      JSON.stringify({
        access_token: id,
        refresh_token: "test",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id,
          aud: "authenticated",
          role: "authenticated",
          email: "test@example.test",
        },
      }),
    );
  }, uid);
  await page.route("http://localhost:8787/**", (route) =>
    route.fulfill({
      path: resolve(
        ".",
        new URL(route.request().url()).pathname.slice(1) || "index.html",
      ),
    }),
  );
  await page.route("https://*.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/logger_duo"))
      return route.fulfill({
        json: {
          status: "active",
          consented: true,
          partner: { name: "Coralie", accent: "#dc92b7" },
          partnerSharing: { measurements: shared },
          documents: shared
            ? [
                {
                  key: `day/${today}`,
                  value: {
                    measurements: { Poitrine: 94, "Sous-poitrine": 78.5 },
                  },
                },
              ]
            : [],
        },
      });
    if (path.endsWith("/logger_documents")) return route.fulfill({ json: own });
    if (path.endsWith("/rpc/logger_put")) {
      writes++;
      return route.fulfill({ json: { revision: 2 } });
    }
    if (path.endsWith("/user"))
      return route.fulfill({
        json: {
          id: uid,
          aud: "authenticated",
          role: "authenticated",
          email: "test@example.test",
        },
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("http://localhost:8787/");
  await page.getByRole("button", { name: "Corps", exact: true }).click();
  await page.getByRole("button", { name: "Mensurations", exact: true }).click();
  const selector = page.getByRole("group", { name: "Profil des mensurations" });
  const info = page.getByRole("button", {
    name: "Afficher les conseils de mesure",
  });
  await expect(selector).toHaveCount(0);
  await info.click();
  await expect(
    selector.getByRole("button", { name: "Coralie", exact: true }),
  ).toBeEnabled();
  await info.click();
  async function chooseProfile(name) {
    await info.click();
    await expect(selector).toBeVisible();
    await selector.getByRole("button", { name, exact: true }).click();
    await info.click();
    await expect(selector).toHaveCount(0);
  }
  await expect(page.locator(".body-figure canvas")).toHaveCSS(
    "height",
    "430px",
  );
  await chooseProfile("Coralie");
  await expect(page.locator(".body-figure canvas")).toHaveCSS(
    "height",
    "430px",
  );
  await chooseProfile("Loric");
  await page
    .getByRole("button", { name: "Page suivante", exact: true })
    .click();
  await expect(
    page.getByLabel("Poitrine en centimètres", { exact: true }),
  ).toHaveValue("103");
  const before = writes;
  await chooseProfile("Coralie");
  await expect(
    page.locator(".measurement-current-delta").first(),
  ).toContainText("94 cm");
  await expect(page.locator(".measure-editor")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Enregistrer un relevé", exact: true }),
  ).toHaveCount(0);
  await chooseProfile("Loric");
  await expect(
    page.getByLabel("Poitrine en centimètres", { exact: true }),
  ).toHaveValue("103");
  for (let i = 0; i < 2; i++)
    await page
      .getByRole("button", { name: "Page suivante", exact: true })
      .click();
  await page.getByRole("button", { name: "Bas du corps", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mesure secrète", exact: true }),
  ).toBeVisible();
  await chooseProfile("Coralie");
  await expect(
    page.getByRole("button", { name: "Poitrine en détail", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".measurement-bra-size")).toContainText("95B");
  await page
    .getByRole("button", { name: "Afficher les conseils de mesure" })
    .click();
  await expect(page.locator(".measurement-instructions dt")).toHaveCount(2);
  await expect(
    page.locator('.measurement-figure-panel[data-active="false"]'),
  ).toHaveCSS("visibility", "hidden");
  await page.screenshot({
    path: "qa/measurement-profiles-mobile.png",
    fullPage: true,
  });
  shared = false;
  await page.evaluate(() => window.dispatchEvent(new Event("duo-changed")));
  await expect(
    page.getByText(
      "Mensurations du partenaire indisponibles ou non partagées.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Afficher les conseils de mesure" })
    .click();
  await expect(page.locator(".measurement-bra-size")).toContainText(
    "Deux mesures à renseigner",
  );
  expect(writes).toBe(before);
  expect(errors).toEqual([]);
  console.log(
    "Measurement profiles: real snapshots, read-only partner, hidden views and revocation verified.",
  );
} finally {
  await browser.close();
}
