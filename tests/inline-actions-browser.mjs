import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://localhost:8787/**", (route) =>
    route.fulfill({
      path: resolve(
        ".",
        new URL(route.request().url()).pathname.slice(1) || "index.html",
      ),
    }),
  );
  await page.addInitScript(() => {
    const request = indexedDB.open("logger-web-v2", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("documents");
    request.onsuccess = () => {
      const db = request.result,
        tx = db.transaction("documents", "readwrite");
      tx.objectStore("documents").put(
        [
          {
            key: "day/2026-01-01",
            value: { weightKg: 80 },
            revision: 0,
            pending: true,
          },
          {
            key: "day/2026-01-02",
            value: { weightKg: 81 },
            revision: 0,
            pending: true,
          },
        ],
        "guest",
      );
      tx.oncomplete = () => db.close();
    };
  });
  await page.goto("http://localhost:8787/");
  const row = page.locator(".weight-record").first();
  await row.scrollIntoViewIfNeeded();
  const scrollBeforeOpen = await page.evaluate(() => scrollY);
  await row.click();
  const panel = page.getByRole("region", {
    name: "Action en cours",
    exact: true,
  });
  await expect(panel.getByLabel("Poids de la pesée (kg)")).toHaveValue("81");
  expect(
    await panel.evaluate((el) =>
      el.parentElement.previousElementSibling?.classList.contains(
        "weight-record",
      ),
    ),
  ).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".inline-action-host")).toHaveAttribute(
    "data-motion",
    "open",
  );
  expect(Math.abs(await page.evaluate(() => scrollY) - scrollBeforeOpen)).toBeLessThanOrEqual(1);
  await row.click();
  await expect(page.locator(".inline-action-host")).toHaveAttribute(
    "data-motion",
    "closing",
  );
  await expect(page.locator(".inline-action-host")).toHaveCount(1);
  await expect(page.locator(".inline-action-host")).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await row.click();
  await expect(panel.getByLabel("Poids de la pesée (kg)")).toHaveValue("81");
  await expect(page.locator(".account-sheet-backdrop")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await panel.getByLabel("Poids de la pesée (kg)").fill("79.8");
  await panel
    .getByRole("button", { name: "Enregistrer la modification", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await expect(row).toContainText("79,8");
  await row.click();
  await page.locator(".history-older summary").first().click();
  await page.locator(".weight-record").last().click();
  await expect(panel.getByLabel("Poids de la pesée (kg)")).toHaveValue("80");
  expect(
    await panel.evaluate((el) =>
      el.parentElement.previousElementSibling?.textContent.includes(
        "01/01/2026",
      ),
    ),
  ).toBe(true);
  await panel.getByLabel("Poids de la pesée (kg)").fill("70");
  await panel.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.locator(".weight-record").last()).toContainText("80");
  await page.getByRole("button", { name: /Mode local/ }).click();
  await expect(page.locator("main.screen > header .inline-action")).toHaveCount(
    1,
  );
  await panel.getByRole("button", { name: "Apparence", exact: true }).click();
  await expect(panel.getByLabel("Mode d’affichage")).toBeVisible();
  await expect(page.locator(".inline-action-host")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await row.click();
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Accueil", exact: true }).click();
  await page.locator(".weight-record").first().click();
  await expect(page.locator(".inline-action-host")).toHaveAttribute(
    "data-motion",
    "open",
  );
  await page.screenshot({
    path: "qa/inline-weight-mobile.png",
    fullPage: true,
  });
  await page.locator(".weight-record").first().click();
  await page.locator(".weight-record").first().click();
  await expect(page.locator(".inline-action-host")).toHaveAttribute(
    "data-motion",
    "open",
  );
  await expect(panel.getByLabel("Poids de la pesée (kg)")).toHaveValue("79.8");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel
    .getByRole("button", { name: "Supprimer cette pesée", exact: true })
    .click();
  await expect(page.locator(".weight-record")).toHaveCount(1);
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await page
    .getByRole("button", { name: "Kermit Cuisto", exact: true })
    .click();
  const kermit = page.getByRole("region", {
    name: "Kermit Cuisto",
    exact: true,
  });
  await expect(kermit).toBeVisible();
  expect(
    await kermit.evaluate((el) => !!el.closest(".meals-preparation")),
  ).toBe(true);
  await kermit.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(kermit).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(
    "Inline actions: weight edit/save/cancel, relocating, nested settings, keyboard and navigation verified.",
  );
} finally {
  await browser.close();
}
