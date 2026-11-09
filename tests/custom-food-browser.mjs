import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://localhost:8787");
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await page
    .getByRole("button", {
      name: "＋ Créer un aliment personnalisé",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom", { exact: true }).fill("Merguez QA");
  await dialog
    .getByLabel("Marque (facultatif)", { exact: true })
    .fill("Boucherie QA");
  await dialog.getByLabel("Unité", { exact: true }).selectOption("unité");
  await expect(dialog).toContainText("pour 100 g");
  await dialog.getByLabel("Poids d’une unité (g)").fill("100");
  await dialog.getByLabel("kcal", { exact: true }).fill("180");
  await dialog.getByLabel("g protéines", { exact: true }).fill("12");
  await dialog
    .getByRole("button", { name: "Enregistrer l’aliment", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Catalogue Kalo", exact: true })
    .click();
  await page.getByRole("button", { name: "Catalogue", exact: true }).click();
  await expect(
    page.locator(".food-result").filter({ hasText: "Merguez QA" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".food-result").filter({ hasText: "Merguez QA" }),
  ).toContainText("180 kcal/unité");
  await expect(
    page.locator(".food-result").filter({ hasText: "Merguez QA" }),
  ).toContainText("Boucherie QA");
  await page.getByLabel("Rechercher", { exact: true }).fill("boucherie");
  await expect(page.locator(".food-result")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Ajouter Merguez QA", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Quantité (unité)", { exact: true }),
  ).toHaveValue("1");
  await dialog.getByLabel("Quantité (unité)", { exact: true }).fill("2");
  await expect(dialog).toContainText("360 kcal");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.locator(".entry")).toContainText("360 kcal");
  await page.reload();
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await page.getByLabel("Rechercher", { exact: true }).fill("boucherie");
  await expect(
    page.locator(".food-result").filter({ hasText: "Merguez QA" }),
  ).toContainText("Catalogue Kalo");
  const card = page.locator(".food-result").filter({ hasText: "Merguez QA" });
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(
    dialog.getByLabel("Marque (facultatif)", { exact: true }),
  ).toHaveValue("Boucherie QA");
  await expect(dialog.getByLabel("Unité", { exact: true })).toHaveValue(
    "unité",
  );
  await expect(dialog.getByLabel("kcal", { exact: true })).toHaveValue("180");
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const search = await page.locator(".food-search-bar input").boundingBox();
    const create = await page.locator(".food-create").boundingBox();
    assert.ok(
      create.x >= search.x + search.width && Math.abs(create.y - search.y) < 4,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  console.log(
    "Aliment personnel: marque, unité, calcul pour 2 pièces, Catalogue Kalo, recherche et persistance OK",
  );
} finally {
  await browser.close();
}
