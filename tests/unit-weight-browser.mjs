import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://localhost:8787");
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await page.locator(".food-create").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom", { exact: true }).fill("Barre chocolat QA");
  await dialog.getByLabel("kcal", { exact: true }).fill("500");
  await dialog.getByLabel("g protéines", { exact: true }).fill("10");
  await dialog.getByLabel("Unité", { exact: true }).selectOption("unité");
  await dialog
    .getByRole("button", { name: "Enregistrer l’aliment", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Poids d’une unité (g)").fill("21");
  await expect(dialog).toContainText("1 unité = 21 g · 105 kcal");
  await dialog
    .getByRole("button", { name: "Enregistrer l’aliment", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByLabel("Rechercher", { exact: true })
    .fill("Barre chocolat QA");
  await expect(page.locator(".food-result")).toContainText(
    "105 kcal/unité (21 g)",
  );
  await page
    .getByRole("button", { name: "Ajouter Barre chocolat QA", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Quantité (unité)", { exact: true }),
  ).toHaveValue("1");
  await expect(dialog).toContainText("105 kcal");
  await dialog.getByLabel("Quantité (unité)", { exact: true }).fill("2");
  await expect(dialog).toContainText("210 kcal");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.locator(".entry")).toContainText("210 kcal");
  await page
    .getByRole("button", {
      name: "Ajouter Barre chocolat QA au repas",
      exact: true,
    })
    .click();
  const calculator = page.getByRole("region", { name: "Calculateur de repas" });
  await expect(calculator.getByLabel("Total du repas")).toHaveText("105 kcal");
  await calculator.getByRole("spinbutton").fill("2");
  await expect(calculator.getByLabel("Total du repas")).toHaveText("210 kcal");
  await page.reload();
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await page
    .getByLabel("Rechercher", { exact: true })
    .fill("Barre chocolat QA");
  const row = page.locator(".food-result"),
    box = await row.boundingBox();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(dialog.getByLabel("kcal", { exact: true })).toHaveValue("500");
  await expect(dialog.getByLabel("Poids d’une unité (g)")).toHaveValue("21");
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  // Simulate a pre-existing per-piece record: never reinterpret its 180 kcal
  // as a per-100-g value while upgrading it to a weighted unit.
  await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open("logger-web-v2");
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction("documents", "readwrite"),
      store = tx.objectStore("documents");
    const r = store.get("guest");
    r.onsuccess = () => {
      for (const doc of r.result)
        if (
          (doc.key.startsWith("food/") || doc.key.startsWith("catalog/")) &&
          doc.value?.name === "Barre chocolat QA"
        ) {
          delete doc.value.unitWeightGrams;
          doc.value.kcalPer100 = 180;
        }
      store.put(r.result, "guest");
    };
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await page
    .getByLabel("Rechercher", { exact: true })
    .fill("Barre chocolat QA");
  await page.locator(".food-result .row-main").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(dialog).toContainText("Ancienne fiche");
  await dialog.getByLabel("Poids d’une unité (g)").pressSequentially("21");
  await dialog.getByLabel("kcal", { exact: true }).focus();
  await expect(dialog).toContainText("1 unité = 21 g · 180 kcal");
  await dialog
    .getByRole("button", { name: "Enregistrer l’aliment", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".food-result")).toContainText(
    "180 kcal/unité (21 g)",
  );
  await expect(page.locator(".entry")).toContainText("210 kcal");
  console.log(
    "Unit weight: package values per 100 g, 21 g bar, one/two pieces, calculator, validation and persistence OK",
  );
} finally {
  await browser.close();
}
