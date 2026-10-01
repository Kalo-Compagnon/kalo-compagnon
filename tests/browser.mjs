import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
mkdirSync("qa", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "fr-FR",
  timezoneId: "Europe/Paris",
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage(),
  errors = [];
page.setDefaultTimeout(15000);
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error(e.message);
});
await page.goto("http://localhost:8787");
await page.getByRole("heading", { name: "Aujourd’hui", exact: true }).waitFor();
await page.screenshot({
  path: "qa/global-empty-mobile.png",
  fullPage: true,
  animations: "disabled",
});
await page
  .getByRole("button", { name: "Paramétrer le métabolisme basal" })
  .click();
await page.getByLabel("Âge", { exact: true }).fill("30");
await page.getByLabel("Taille (cm)", { exact: true }).fill("180");
await page.getByLabel("Poids (kg)", { exact: true }).fill("80");
await page.getByRole("button", { name: "Calculer", exact: true }).click();
await page.getByRole("button", { name: "Repas", exact: true }).click();
await page
  .getByRole("button", { name: "Ajouter", exact: false })
  .first()
  .click();
await page
  .getByRole("button", {
    name: "Aliment Recherche instantanée et quantité libre",
  })
  .click();
await page.getByLabel("Rechercher", { exact: true }).fill("banane");
await page.locator(".row-main").first().waitFor();
await page.locator(".row-main").first().click();
await page.getByLabel("Quantité (g)", { exact: true }).fill("123.4");
await page.getByRole("button", { name: "Ajouter", exact: true }).click();
await page.locator(".entry").first().waitFor();
await page
  .getByRole("button", { name: "Ajouter", exact: false })
  .first()
  .click();
await page
  .getByRole("button", {
    name: "Extra / Photo Restaurant, imprévu ou estimation ultérieure",
  })
  .click();
await page.getByLabel("Courte note (facultatif)").fill("Extra test");
await page.getByRole("button", { name: "Ajouter", exact: true }).click();
await page.getByText("À estimer", { exact: true }).waitFor();
await page.getByRole("button", { name: "Global", exact: true }).click();
assert.ok(
  await page.getByText("Données à renseigner", { exact: true }).isVisible(),
);
await page.getByRole("button", { name: "Repas", exact: true }).click();
await page.locator(".row-main").filter({ hasText: "Extra test" }).click();
await page.getByLabel("Calories estimées (facultatif)").fill("150");
await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
await page.screenshot({
  path: "qa/meals-mobile.png",
  fullPage: true,
  animations: "disabled",
});
await page.reload();
await page.locator(".liquid-nav").waitFor();
await page.getByRole("button", { name: "Repas", exact: true }).click();
assert.equal(await page.locator(".entry").count(), 2);
await page.getByRole("button", { name: "Activité", exact: true }).click();
await page.getByLabel("Pas à ajouter", { exact: true }).fill("2000");
await page
  .getByRole("button", { name: "Enregistrer les pas", exact: true })
  .click();
await page.getByText("2 300 pas", { exact: true }).waitFor();
await page.screenshot({
  path: "qa/activity-mobile.png",
  fullPage: true,
  animations: "disabled",
});
await page.getByRole("button", { name: "Mensuration", exact: true }).click();
await page.locator(".body-figure canvas").waitFor();
await page.screenshot({
  path: "qa/measurements-overview-mobile.png",
  fullPage: true,
  animations: "disabled",
});
await page.getByRole("button", { name: "Page suivante", exact: true }).click();
await page.getByLabel("Poitrine en centimètres", { exact: true }).fill("95.5");
await page.getByRole("button", { name: "Augmenter de 0,5 centimètre" }).click();
await expect(
  page.getByLabel("Poitrine en centimètres", { exact: true }),
).toHaveValue("96");
await page.screenshot({
  path: "qa/measurements-detail-mobile.png",
  fullPage: true,
  animations: "disabled",
});
await page.getByRole("button", { name: "Global", exact: true }).click();
assert.ok(
  await page.getByText("Déficit quotidien moyen", { exact: true }).isVisible(),
);
await page.screenshot({
  path: "qa/global-mobile.png",
  fullPage: true,
  animations: "disabled",
});
const sizes = [
  [390, 844],
  [844, 390],
  [1920, 1080],
  [2560, 1440],
];
for (const [width, height] of sizes) {
  await page.setViewportSize({ width, height });
  for (const name of ["Global", "Repas", "Mensuration", "Activité"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.screenshot({
      path: `qa/${name}-${width}x${height}.png`,
      fullPage: true,
      animations: "disabled",
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false, `${name} ${width}: débordement horizontal`);
  }
}
assert.deepEqual(errors, []);
writeFileSync(
  "qa/browser-results.json",
  JSON.stringify(
    {
      passed: true,
      sizes,
      checks: [
        "basal",
        "food",
        "extra missing calories",
        "edit extra",
        "reload persistence",
        "steps",
        "measurements",
        "global",
        "responsive overflow",
      ],
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
console.log("Parcours principaux et quatre formats : OK");
