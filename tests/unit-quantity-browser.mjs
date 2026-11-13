import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route("http://localhost:8787/**", (route) => route.fulfill({ path: resolve(".", new URL(route.request().url()).pathname.slice(1) || "index.html") }));
  await page.goto("http://localhost:8787/");
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await page.locator(".food-create").click();
  const panel = page.getByRole("region", { name: "Action en cours", exact: true });
  await panel.getByLabel("Nom", { exact: true }).fill("Mochi QA");
  await panel.getByLabel("kcal", { exact: true }).fill("372");
  await panel.getByLabel("Unité", { exact: true }).selectOption("unité");
  await panel.getByLabel("Poids d’une unité (g)").fill("15");
  await panel.getByRole("button", { name: "Enregistrer l’aliment", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.getByLabel("Rechercher", { exact: true }).fill("Mochi QA");
  await page.getByRole("button", { name: "Ajouter Mochi QA", exact: true }).click();
  const quantity = panel.getByLabel("Quantité (unité)", { exact: true });
  await expect.poll(() => panel.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight - 88;
  })).toBe(true);
  await expect(quantity).toHaveValue("1");
  await quantity.press("ArrowUp");
  await expect(quantity).toHaveValue("1.5");
  await quantity.press("ArrowDown");
  await expect(quantity).toHaveValue("1");
  await quantity.press("ArrowDown");
  await expect(quantity).toHaveValue("0.5");
  await quantity.press("ArrowDown");
  await expect(quantity).toHaveValue("0.5");
  console.log("Unit quantity arrows use half-unit increments with a 0.5 minimum.");
} finally { await browser.close(); }
