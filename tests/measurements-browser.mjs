import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(15000);
  await page.clock.install({ time: new Date("2026-10-06T12:00:00+02:00") });
  await page.route("http://localhost:8787/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      path: resolve(".", path.slice("/logger/".length) || "index.html"),
    });
  });
  await page.addInitScript(() => {
    window.seedFinished = new Promise((resolve, reject) => {
      const request = indexedDB.open("logger-web-v2", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("documents");
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("documents", "readwrite"),
          store = tx.objectStore("documents");
        const get = store.get("guest");
        get.onsuccess = () => {
          if (!get.result)
            store.put(
              [
                {
                  key: "day/2026-10-05",
                  value: { measurements: { Poitrine: 95, Taille: 80 } },
                  revision: 0,
                  pending: true,
                },
              ],
              "guest",
            );
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.goto("http://localhost:8787/logger/");
  await page.evaluate(() => window.seedFinished);
  const tab = () =>
    page.getByRole("button", { name: "Mensuration", exact: true }).click();
  await tab();
  await page
    .getByRole("button", { name: "Page suivante", exact: true })
    .click();
  const input = () =>
    page.getByLabel("Poitrine en centimètres", { exact: true });
  await expect(input()).toHaveValue("95");
  await input().fill("96");
  await input().blur();
  await expect(page.locator(".measurement-current-delta")).toContainText(
    "↑ +1 cm",
  );
  await page
    .getByRole("button", { name: "Enregistrer un relevé", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Relevé enregistré");
  await page.reload();
  await tab();
  await page
    .getByRole("button", { name: "Page suivante", exact: true })
    .click();
  await expect(input()).toHaveValue("96");
  await page.clock.setSystemTime(new Date("2026-10-07T12:00:00+02:00"));
  await page.reload();
  await tab();
  await page
    .getByRole("button", { name: "Page suivante", exact: true })
    .click();
  await expect(input()).toHaveValue("96");
  await input().fill("97");
  await input().blur();
  await expect(page.locator(".measurement-current-delta")).toContainText(
    "↑ +1 cm",
  );
  await page
    .getByRole("button", { name: "Page précédente", exact: true })
    .click();
  await expect(page.locator(".measurement-preview")).toContainText("↑ +1 cm");
  await page
    .getByRole("button", { name: "Historique et évolution", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Précédent : 96 cm");
  mkdirSync("qa", { recursive: true });
  await page.screenshot({
    path: "qa/measurements-evolution-mobile.png",
    animations: "disabled",
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({
    path: "qa/measurements-evolution-desktop.png",
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  console.log(
    "Mensurations : anciennes valeurs, saisie, relevé, rechargement, lendemain et flèches vérifiés.",
  );
} finally {
  await browser.close();
}
