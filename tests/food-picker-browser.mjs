import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "fr-FR",
  });
  const page = await context.newPage();
  let calls = 0;
  await page.route("https://world.openfoodfacts.org/**", async (route) => {
    calls++;
    const url = new URL(route.request().url());
    assert.equal(url.searchParams.get("page_size"), "24");
    await route.fulfill({
      json: {
        products: [
          {
            code: "1234567890123",
            product_name_fr: "Yaourt test",
            brands: "Yoplait",
            nutriments: {
              "energy-kcal_100g": 62,
              proteins_100g: 8,
              carbohydrates_100g: 4,
              fat_100g: 1,
            },
          },
        ],
      },
    });
  });
  async function openPicker() {
    await page.getByRole("button", { name: "Repas", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Ajouter un aliment", exact: true }),
    ).toBeVisible();
  }
  await page.goto("http://localhost:8787");
  await openPicker();
  await page.setViewportSize({ width: 1544, height: 820 });
  await page.screenshot({
    path: "qa/food-picker-inline-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const compact = await page.evaluate(() => ({
    input: document
      .querySelector(".food-search-bar input")
      .getBoundingClientRect().height,
    filter: document
      .querySelector(".food-filters button")
      .getBoundingClientRect().height,
    section: document
      .querySelector(".food-sections button")
      .getBoundingClientRect().height,
  }));
  assert.ok(
    compact.input <= 44 && compact.filter <= 32 && compact.section <= 32,
  );
  await expect(
    page.getByText("Aucun aliment récent.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Rechercher", { exact: true }).fill("yaourt yoplait");
  assert.equal(calls, 0);
  await page.getByRole("button", { name: "Produits", exact: true }).click();
  await expect(page.getByLabel("Rechercher", { exact: true })).toHaveValue(
    "yaourt yoplait",
  );
  await page
    .getByRole("button", { name: "Catalogue Kalo", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Rechercher dans Open Food Facts",
      exact: true,
    })
    .click();
  await expect(page.locator(".food-result")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Tous", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".food-result")).toContainText("62 kcal/100 g");
  await page
    .getByRole("button", {
      name: "Ajouter aux favoris : Yaourt test",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Retirer des favoris : Yaourt test",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Ajouter Yaourt test", exact: true })
    .click();
  await page.getByLabel("Quantité (g)", { exact: true }).fill("150");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.locator(".entry").first()).toContainText("93");
  await page.reload();
  await openPicker();
  await expect(page.locator(".food-result").first()).toContainText(
    "Yaourt test",
  );
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await expect(page.locator(".food-result")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Aliments bruts", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Le référentiel Ciqual n’est pas encore installé."),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Tous", exact: true }).click();
  await page.getByRole("button", { name: "Catalogue", exact: true }).click();
  await expect(page.locator(".food-result")).toHaveCount(1);
  await expect(
    page.locator(".food-result").filter({ hasText: "Catalogue Kalo" }),
  ).toHaveCount(0);
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "qa/food-picker-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Mode local · Se connecter" }).click();
  await page.getByRole("button", { name: "Apparence", exact: true }).click();
  await page.getByLabel("Mode d’affichage").selectOption("dark");
  await page.getByRole("button", { name: "Rose", exact: true }).click();
  await page
    .getByRole("button", { name: "Enregistrer l’apparence", exact: true })
    .click();
  await openPicker();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "qa/food-picker-dark.png", fullPage: true });
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim(),
  );
  const rgb = `rgb(${[1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16)).join(", ")})`;
  await expect(page.locator(".food-icon").first()).toHaveCSS("color", rgb);
  await page.getByLabel("Rechercher", { exact: true }).fill("inconnu");
  await page.route("https://world.openfoodfacts.org/**", (route) =>
    route.abort(),
  );
  await page
    .getByRole("button", {
      name: "Rechercher dans Open Food Facts",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /fetch|indisponible|Failed/i }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByLabel("Rechercher", { exact: true }).fill("yaourt test");
  await expect(page.locator(".food-result").first()).toBeVisible();
  console.log(
    "Catalogue: OFF simulé, favoris persistants, journal, filtres, erreur réseau et quatre formats OK",
  );
} finally {
  await browser.close();
}
