import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://localhost:8787/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ path: resolve(".", path.slice(1) || "index.html") });
  });
  await page.goto("http://localhost:8787/");
  await page.getByRole("button", { name: "Corps", exact: true }).waitFor();
  // Set the existing persisted profile preference, leaving all other data intact.
  async function setSex(sex) {
    await page.evaluate(
      (value) =>
        new Promise((done, fail) => {
          const request = indexedDB.open("logger-web-v2", 1);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction("documents", "readwrite");
            const store = tx.objectStore("documents");
            const get = store.get("guest");
            get.onsuccess = () =>
              store.put(
                [
                  ...(get.result ?? []).filter(
                    (doc) => doc.key !== "settings/sex",
                  ),
                  { key: "settings/sex", value, revision: 0, pending: true },
                ],
                "guest",
              );
            tx.oncomplete = () => {
              db.close();
              done();
            };
            tx.onerror = () => fail(tx.error);
          };
          request.onerror = () => fail(request.error);
        }),
      sex,
    );
    await page.reload();
    await page.getByRole("button", { name: "Corps", exact: true }).click();
    await page
      .getByRole("button", { name: "Mensurations", exact: true })
      .click();
  }
  await setSex("female");
  const toggle = page.getByRole("button", {
    name: "Afficher les conseils de mesure",
  });
  await toggle.click();
  await expect(page.locator(".measurement-instructions dt")).toHaveCount(11);
  await expect(page.locator(".measurement-instructions")).toContainText(
    "Tour de poitrine",
  );
  await expect(page.locator(".measurement-instructions")).toContainText(
    "Sous-poitrine",
  );
  await expect(page.locator(".measurement-instructions")).toContainText(
    "Bassin / petites hanches",
  );
  await expect(page.locator(".measurement-instructions")).toContainText(
    "Cuisse haute",
  );
  await toggle.click();
  await page
    .getByRole("button", { name: "Sous-poitrine", exact: true })
    .evaluate((button) => button.click());
  await page
    .getByLabel("Sous-poitrine en centimètres", { exact: true })
    .fill("78.5");
  await page.getByLabel("Sous-poitrine en centimètres", { exact: true }).blur();
  await page
    .getByRole("button", { name: "Enregistrer un relevé", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Relevé enregistré");
  await setSex("male");
  await expect(
    page.getByRole("button", { name: "Sous-poitrine", exact: true }),
  ).toHaveCount(0);
  await setSex("female");
  await page
    .getByRole("button", { name: "Sous-poitrine", exact: true })
    .evaluate((button) => button.click());
  await expect(
    page.getByLabel("Sous-poitrine en centimètres", { exact: true }),
  ).toHaveValue("78.5");
  await page
    .getByRole("button", { name: "Page précédente", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Afficher les conseils de mesure" })
    .click();
  await expect(page.locator(".measurement-instructions")).toBeVisible();
  await expect(
    page.locator('.measurement-figure-panel[data-active="true"]'),
  ).toHaveCSS("opacity", "1");
  await expect(
    page.locator('.measurement-figure-panel[data-active="false"]'),
  ).toHaveCSS("visibility", "hidden");
  await page.screenshot({
    path: "qa/female-measurements-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page
    .getByRole("button", { name: "Afficher les conseils de mesure" })
    .click();
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("button", { name: "Page suivante", exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Bas du corps", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Poitrine en détail", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".measurement-bra-size")).toContainText("Deux mesures à renseigner");
  await page.getByLabel("Poitrine en centimètres", { exact: true }).fill("94");
  await page.getByLabel("Poitrine en centimètres", { exact: true }).blur();
  await expect(page.locator(".measurement-bra-size")).toContainText("95B");
  await page
    .getByRole("button", { name: "Sous-poitrine", exact: true })
    .evaluate((button) => button.click());
  await expect(
    page.getByLabel("Sous-poitrine en centimètres", { exact: true }),
  ).toHaveValue("78.5");
  await page
    .getByRole("button", { name: "Afficher les conseils de mesure" })
    .click();
  await expect(page.locator(".measurement-instructions dt")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Afficher les conseils de mesure" })
    .click();
  await expect(
    page.locator('.measurement-figure-panel[data-active="false"]'),
  ).toHaveCSS("visibility", "hidden");
  await page.screenshot({
    path: "qa/female-chest-detail-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Page précédente", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Bas du corps", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "Female measurements: zones, editing, sex changes and persistence verified.",
  );
} finally {
  await browser.close();
}
