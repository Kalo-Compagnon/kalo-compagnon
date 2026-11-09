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
  await page.getByRole("button", { name: "Catalogue", exact: true }).click();
  await expect(page.locator(".food-result")).toHaveCount(0);
  await expect(
    page.getByText("Le catalogue Kalo est vide.", { exact: false }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("logger-web-v2");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction("documents", "readwrite");
    const documents = Array.from({ length: 9 }, (_, i) => {
      const food = {
        id: `user-${i}`,
        name: `Aliment utilisateur ${i}`,
        category: "Autres",
        referenceUnit: "g",
        kcalPer100: 100,
        proteinPer100: 5,
        carbsPer100: 10,
        fatPer100: 2,
        isCustom: true,
        isFavorite: false,
        usageCount: 0,
      };
      return {
        key: `food/${food.id}`,
        value: food,
        revision: 0,
        pending: true,
      };
    });
    transaction.objectStore("documents").put(documents, "guest");
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  await page.reload();
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await page.getByRole("button", { name: "Catalogue", exact: true }).click();
  await page
    .getByRole("button", { name: "Catalogue Kalo", exact: true })
    .click();
  await expect(page.locator(".food-result")).toHaveCount(9);
  await page.getByRole("button", { name: "Tous", exact: true }).click();
  await expect(page.locator(".food-result")).toHaveCount(9);
  await expect(page.locator(".food-picker")).not.toContainText(
    "Open Food Facts",
  );
  await expect(page.locator(".food-picker .lucide-pencil")).toHaveCount(0);
  const dims = await page.locator(".food-results").evaluate((el) => {
    el.scrollTop = 200;
    return {
      height: el.clientHeight,
      total: el.scrollHeight,
      scroll: el.scrollTop,
    };
  });
  assert.equal(dims.height, 308);
  assert.ok(dims.total > dims.height && dims.scroll > 0);
  const first = page.locator(".food-result").first();
  const name = await first.locator(".row-main span").innerText();
  await first.getByRole("button", { name: /^Ajouter aux favoris/ }).click();
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await expect(page.locator(".food-result")).toHaveCount(1);
  await expect(page.locator(".food-result")).toContainText(name);
  await page.reload();
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await expect(page.locator(".food-result")).toContainText(name);
  await page
    .getByRole("button", { name: "Aliments bruts", exact: true })
    .click();
  await expect(page.locator(".food-result")).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  console.log(
    "Kalo catalogue, Ciqual filter, four scrollable rows and persistent favorites OK",
  );
} finally {
  await browser.close();
}
