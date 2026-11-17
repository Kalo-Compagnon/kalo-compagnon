import { chromium, expect } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:8787");
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  const calculator = page.getByRole("region", { name: "Calculateur de repas" });
  async function temporary(host, name, calories) {
    const row = host.locator(".temporary-meal-row").last();
    await row.getByPlaceholder("Aliment", { exact: true }).fill(name);
    await row.getByPlaceholder("Calories", { exact: true }).fill(calories);
  }
  await expect(calculator.locator(".temporary-meal-row")).toHaveCount(1);
  await temporary(calculator, "Dessert temporaire QA", "245.5");
  await expect(calculator.locator(".temporary-meal-row")).toHaveCount(2);
  await calculator.getByLabel("Calories de l’aliment temporaire 1", { exact: true }).fill("250");
  await expect(calculator.getByLabel("Total du repas")).toHaveText("250 kcal");
  await calculator.getByLabel("Calories de l’aliment temporaire 1", { exact: true }).fill("245.5");
  await temporary(calculator, "Autre aliment QA", "0");
  await expect(calculator.locator(".temporary-meal-row")).toHaveCount(3);
  await calculator.getByLabel("Aliment temporaire 3", { exact: true }).fill("Incomplet");
  await expect(calculator.getByRole("button", { name: "Ajouter le repas", exact: true })).toBeDisabled();
  await calculator.getByRole("button", { name: "Retirer l’aliment temporaire 3", exact: true }).click();
  await calculator.getByRole("button", { name: "Retirer l’aliment temporaire 2", exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(calculator.getByLabel("Total du repas")).toHaveText(
    "245,5 kcal",
  );
  await calculator
    .getByRole("button", { name: "Ajouter le repas", exact: true })
    .click();
  await expect(page.locator(".entry")).toHaveCount(1);
  await page
    .getByRole("button", {
      name: "Afficher les repas enregistrés",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Créer un repas", exact: true })
    .click();
  const composer = page.getByRole("region", {
    name: "Action en cours",
    exact: true,
  });
  await composer
    .getByLabel("Nom du repas", { exact: true })
    .fill("Repas temporaire QA");
  await temporary(composer, "Plat temporaire QA", "420");
  await composer.getByLabel("Calories de l’aliment temporaire 1", { exact: true }).fill("840");
  await composer
    .getByRole("button", { name: "Enregistrer sans ajouter", exact: true })
    .click();
  await expect(composer).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Afficher les repas enregistrés",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Préparer Repas temporaire QA", exact: true })
    .click();
  await expect(calculator.getByLabel("Total du repas")).toHaveText("840 kcal");
  await calculator
    .getByRole("button", { name: "Ajouter le repas", exact: true })
    .click();
  await expect(
    page.locator(".entry").filter({ hasText: "840 kcal" }),
  ).toHaveCount(1);
  const savedFoodNames = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open("logger-web-v2");
      request.onsuccess = () => resolve(request.result);
    });
    const docs = await new Promise((resolve) => {
      const request = db
        .transaction("documents")
        .objectStore("documents")
        .get("guest");
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return docs
      .filter((d) => d.key.startsWith("food/"))
      .map((d) => d.value?.name);
  });
  expect(savedFoodNames).not.toContain("Dessert temporaire QA");
  expect(savedFoodNames).not.toContain("Plat temporaire QA");
  expect(errors).toEqual([]);
  console.log(
    "Temporary ingredients: journal, saved meal reuse, editing and no food catalog persistence OK",
  );
} finally {
  await browser.close();
}
