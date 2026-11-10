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
  await dialog.getByLabel("Type de cuisson").selectOption("pasta");
  await dialog.getByLabel("Unité", { exact: true }).selectOption("unité");
  await dialog.getByLabel("Poids d’une unité (g)").fill("100");
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
    calculator.getByRole("button", { name: "Ajouter le repas" }),
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
  await calculator
    .getByRole("button", { name: "Enregistrer le repas", exact: true })
    .click();
  await expect(calculator.getByLabel("Total du repas")).toHaveText("0 kcal");
  await expect(page.locator(".entry")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Afficher les repas enregistrés",
      exact: true,
    })
    .click();
  await expect(page.locator(".meal-result")).toHaveCount(1);
  await expect(page.locator(".meal-result")).toContainText("Déjeuner QA");
  await page
    .getByRole("button", { name: "Préparer Déjeuner QA", exact: true })
    .click();
  await expect(calculator.getByLabel("Total du repas")).toHaveText("540 kcal");
  await expect(calculator.getByLabel("Nom du repas (facultatif)")).toHaveValue(
    "Déjeuner QA",
  );
  await expect(page.locator(".entry")).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const addButton = await calculator
      .getByRole("button", { name: "Ajouter le repas", exact: true })
      .boundingBox();
    const saveButton = await calculator
      .getByRole("button", { name: "Enregistrer le repas", exact: true })
      .boundingBox();
    assert.ok(
      Math.abs(addButton.y - saveButton.y) < 1 && saveButton.x > addButton.x,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await calculator.getByRole("button", { name: "Ajouter le repas" }).click();
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
  await page
    .getByRole("button", {
      name: "Afficher les repas enregistrés",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Catalogue des repas", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Rechercher", { exact: true })).toHaveAttribute(
    "placeholder",
    "Rechercher un repas...",
  );
  await expect(page.locator(".food-attribution")).not.toContainText("Kalo");
  await expect(page.locator(".food-attribution")).not.toContainText("Ciqual");
  await expect(
    page
      .getByRole("region", { name: "Résultats des repas", exact: true })
      .locator(".food-result:not(.meal-result)"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Créer un repas", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Composer un repas", exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("Nom du repas", { exact: true })
    .fill("Second repas QA");
  await dialog
    .getByRole("button", { name: "＋ Ajouter un ingrédient", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Afficher les repas enregistrés",
      exact: true,
    }),
  ).toHaveCount(0);
  await dialog.getByLabel("Rechercher", { exact: true }).fill("Assiette QA");
  await dialog.locator(".food-result .row-main").click();
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Enregistrer sans ajouter", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".meal-result")).toHaveCount(2);
  await expect(page.locator(".entry")).toHaveCount(1);
  let mealRow = page.locator(".meal-swipe").filter({
    has: page.getByRole("button", {
      name: "Préparer Second repas QA",
      exact: true,
    }),
  });
  const offset = () =>
    mealRow
      .locator(".swipe-content")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
  async function dragMeal(distance) {
    await mealRow.scrollIntoViewIfNeeded();
    const box = await mealRow.boundingBox();
    const x = distance < 0 ? box.x + box.width - 15 : box.x + 15;
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x + distance, box.y + box.height / 2, { steps: 10 });
  }
  await dragMeal(-35);
  await expect.poll(offset).toBeLessThan(-25);
  await page.mouse.up();
  await expect.poll(offset).toBe(0);
  await expect(calculator.getByLabel("Total du repas")).toHaveText("0 kcal");
  await dragMeal(-100);
  await page.mouse.up();
  await expect(calculator.getByLabel("Nom du repas (facultatif)")).toHaveValue(
    "Second repas QA",
  );
  await calculator
    .getByLabel("Nom du repas (facultatif)")
    .fill("Second repas modifié");
  await calculator
    .locator(".meal-calculator-parts")
    .getByRole("spinbutton")
    .fill("2");
  await calculator
    .getByRole("button", { name: "Enregistrer le repas", exact: true })
    .click();
  await expect(page.locator(".meal-result")).toHaveCount(2);
  mealRow = page.locator(".meal-swipe").filter({
    has: page.getByRole("button", {
      name: "Préparer Second repas modifié",
      exact: true,
    }),
  });
  await expect(mealRow).toContainText("360 kcal");
  await dragMeal(100);
  await page.mouse.up();
  await expect(dialog).toContainText("Supprimer ce repas ?");
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.locator(".meal-result")).toHaveCount(2);
  await dragMeal(100);
  await page.mouse.up();
  await dialog.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(page.locator(".meal-result")).toHaveCount(1);
  await expect(page.locator(".entry")).toContainText("540 kcal");
  await page.reload();
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Afficher les repas enregistrés",
      exact: true,
    })
    .click();
  await expect(page.locator(".meal-result")).toHaveCount(1);
  await expect(page.locator(".meal-result")).not.toContainText("Second repas");
  await expect(page.locator(".entry")).toContainText("540 kcal");

  await expect(
    calculator.getByLabel("Portions préparées (plat entier)"),
  ).toHaveCount(0);
  await expect(calculator.getByRole("combobox")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Choisir les portions de Déjeuner QA",
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Cuisiner à nouveau ce plat" })
    .click();
  await dialog.getByLabel("Poids mangé (g)").fill("100");
  await expect(dialog).toContainText("Poids total estimé");
  await expect(dialog).toContainText("711 g");
  await dialog
    .getByRole("button", { name: "Ajouter mon assiette", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Portions en cours" }),
  ).toBeVisible();
  await expect(
    page.locator(".entry").filter({ hasText: "100 g" }),
  ).toContainText("estimées");
  await page.locator(".entry").filter({ hasText: "100 g" }).click();
  await expect(dialog.getByLabel("Courte note (facultatif)")).toHaveCount(0);
  await expect(
    dialog.getByRole("region", { name: "Détail des calories" }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Total des calories (kcal)")).toHaveValue(
    "75.95",
  );
  await expect(dialog.locator(".meal-calorie-details dd")).toHaveCount(2);
  for (const value of await dialog
    .locator(".meal-calorie-details dd")
    .allTextContents())
    assert.match(value, /^\d+(?:,\d{1,2})? kcal$/);
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const pickerBox = await page.locator(".meal-food-picker").boundingBox();
    const portionsBox = await page
      .locator(".active-meal-portions")
      .boundingBox();
    const historyBox = await page.locator(".meals-history").boundingBox();
    assert.ok(portionsBox.y >= pickerBox.y + pickerBox.height);
    assert.ok(historyBox.y >= portionsBox.y + portionsBox.height);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.reload();
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Portions en cours" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "½ Portions", exact: true }).click();
  await dialog.getByLabel("Poids mangé (g)").fill("100");
  await dialog
    .getByRole("checkbox", { name: "Dernière assiette", exact: false })
    .check();
  await dialog
    .getByRole("button", { name: "Ajouter mon assiette", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Portions en cours" }),
  ).toHaveCount(0);
  await expect(page.locator(".entry").filter({ hasText: "100 g" })).toHaveCount(
    2,
  );
  for (const entry of await page
    .locator(".entry")
    .filter({ hasText: "100 g" })
    .all()) {
    await expect(entry).toContainText("270 kcal");
    await expect(entry).not.toContainText("estimées");
  }
  // A tracked/finished recipe loads into the normal calculator on row click.
  // Only the explicit portions button opens the historical batch.
  await page.getByRole("button", { name: "Afficher les repas enregistrés", exact: true }).click();
  const trackedId = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("logger-web-v2");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const request = database.transaction("documents").objectStore("documents").get("guest");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return rows.find(d => d.key.startsWith("meal/") && d.value?.portionTracking?.finished)?.value.id;
  });
  assert.ok(trackedId);
  const trackedRow = page.locator(`.meal-result[data-meal-id="${trackedId}"]`);
  await trackedRow.getByRole("button", { name: "Préparer Déjeuner QA", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(calculator.getByLabel("Nom du repas (facultatif)")).toHaveValue("Déjeuner QA");
  await calculator.getByRole("spinbutton").first().fill("1");
  await expect(calculator.getByLabel("Total du repas")).toHaveText("360 kcal");
  await calculator.getByRole("button", { name: "Vider le repas" }).click();
  await trackedRow.getByRole("button", { name: "Choisir les portions de Déjeuner QA", exact: true }).click();
  await expect(dialog).toContainText("Plat terminé · calories définitives");
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await trackedRow.getByRole("button", { name: "Préparer Déjeuner QA", exact: true }).click();
  await calculator.getByRole("spinbutton").first().fill("1");
  await calculator.getByRole("button", { name: "Ajouter le repas", exact: true }).click();
  await expect(calculator.getByLabel("Total du repas")).toHaveText("0 kcal");
  await expect(page.locator(".entry").filter({ hasText: "100 g" })).toHaveCount(2);
  for (const entry of await page.locator(".entry").filter({ hasText: "100 g" }).all()) {
    await expect(entry).toContainText("270 kcal");
  }
  await expect(page.getByRole("region", { name: "Portions en cours" })).toHaveCount(0);
  console.log(
    "Meal calculator: quantities, units, removal, deferred journal entry, persistence and responsive layout OK",
  );
} finally {
  await browser.close();
}
