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
  await expect(page.locator(".add-meal")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "＋ Créer un aliment personnalisé",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom", { exact: true }).fill("Assiette QA");
  await dialog.getByLabel("Unité", { exact: true }).selectOption("unité");
  await dialog.getByLabel("kcal", { exact: true }).fill("180");
  await dialog
    .getByRole("button", { name: "Enregistrer l’aliment", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("Rechercher", { exact: true }).fill("Assiette QA");
  const add = page.getByRole("button", {
    name: "Ajouter Assiette QA au repas",
    exact: true,
  });
  await add.click();
  await add.click();
  const calculator = page.getByRole("region", { name: "Calculateur de repas" });
  const quantities = calculator.getByRole("spinbutton");
  await quantities.nth(0).fill("2");
  await quantities.nth(1).fill("3");
  await expect(calculator.getByLabel("Total du repas")).toHaveText("900 kcal");
  await expect(page.locator(".entry")).toHaveCount(0);
  await quantities.nth(0).fill("");
  await expect(
    calculator.getByRole("button", { name: "Ajouter ce repas à la journée" }),
  ).toBeDisabled();
  await quantities.nth(0).fill("2");
  await calculator
    .getByRole("button", { name: "Retirer Assiette QA du repas" })
    .nth(1)
    .click();
  await expect(calculator.getByLabel("Total du repas")).toHaveText("360 kcal");
  await add.click();
  await expect(calculator.getByLabel("Total du repas")).toHaveText("540 kcal");
  await calculator.getByLabel("Nom du repas (facultatif)").fill("Déjeuner QA");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await calculator
    .getByRole("button", { name: "Ajouter ce repas à la journée" })
    .click();
  await expect(page.locator(".entry")).toHaveCount(1);
  await expect(page.locator(".entry")).toContainText("Déjeuner QA");
  await expect(page.locator(".entry")).toContainText("540 kcal");
  await expect(calculator.getByLabel("Total du repas")).toHaveText("0 kcal");
  await page.reload();
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await expect(page.locator(".entry")).toHaveCount(1);
  await expect(page.locator(".entry")).toContainText("540 kcal");
  await page.getByLabel("Rechercher", { exact: true }).fill("Assiette QA");
  await add.click();
  await calculator.getByRole("button", { name: "Vider le repas" }).click();
  await expect(calculator.getByLabel("Total du repas")).toHaveText("0 kcal");
  await expect(page.locator(".entry")).toHaveCount(1);
  console.log(
    "Meal calculator: quantities, units, removal, deferred journal entry, persistence and responsive layout OK",
  );
} finally {
  await browser.close();
}
