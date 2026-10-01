import { chromium, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
mkdirSync("qa", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const button = (name) => page.getByRole("button", { name, exact: true });
  const tab = async (name) => {
    await button(name).click();
    await expect(button(name)).toHaveAttribute("aria-current", "page");
  };
  const close = async () => {
    await button("Fermer").click();
    await expect(page.locator("dialog")).not.toBeVisible();
  };
  const add = async () => {
    await tab("Repas");
    await button("＋ Ajouter").click();
  };
  const data = async () => {
    await tab("Global");
    await button("Exporter toutes mes données (.csv)").click();
    await page.getByRole("heading", { name: "Données", exact: true }).waitFor();
  };
  const download = async (label) => {
    const wait = page.waitForEvent("download");
    await button(label).click();
    const file = await wait;
    return readFileSync(await file.path(), "utf8");
  };
  await page.goto("http://localhost:8787");
  await page.locator(".liquid-nav").waitFor();
  await add();
  await button("Aliment Recherche instantanée et quantité libre").click();
  await button("＋ Créer un aliment personnalisé").click();
  await page.getByLabel("Nom", { exact: true }).fill("Aliment QA");
  for (const [label, value] of [
    ["kcal", "120"],
    ["g protéines", "4"],
    ["g glucides", "20"],
    ["g lipides", "2"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await button("Enregistrer l’aliment").click();
  await page.getByLabel("Rechercher", { exact: true }).fill("Aliment QA");
  await expect(page.locator("dialog .row-main")).toHaveCount(1);
  await page.locator("dialog .row-main").click();
  await page.getByLabel("Quantité (g)", { exact: true }).fill("125");
  await button("Ajouter").click();
  await expect(page.locator(".entry")).toHaveCount(1);
  await expect(page.locator(".entry")).toContainText("150 kcal");
  await add();
  await button(
    "Composer un repas Plusieurs aliments, puis réutilisable",
  ).click();
  await page
    .getByLabel("Nom du repas", { exact: true })
    .fill("Repas variable QA");
  await button("＋ Ajouter un ingrédient").click();
  await page.getByLabel("Rechercher", { exact: true }).fill("Aliment QA");
  await expect(page.locator("dialog .row-main")).toHaveCount(1);
  await page.locator("dialog .row-main").click();
  await page.getByLabel("Quantité (g)", { exact: true }).fill("100");
  await page.getByLabel("Quantité variable lors de chaque ajout").check();
  await button("Ajouter").click();
  await button("Enregistrer sans ajouter").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await add();
  await button("Repas enregistrés Favoris, fréquents et récents").click();
  await page
    .locator("dialog .row-main")
    .filter({ hasText: "Repas variable QA" })
    .click();
  await page.getByLabel("Aliment QA (g)", { exact: true }).fill("200");
  await button("Ajouter à la journée").click();
  await expect(page.locator(".entry")).toHaveCount(2);
  await expect(
    page.locator(".entry").filter({ hasText: "Repas variable QA" }),
  ).toContainText("240 kcal");
  await add();
  await button(
    "Extra / Photo Restaurant, imprévu ou estimation ultérieure",
  ).click();
  await page.getByLabel("Nom", { exact: true }).fill("Photo QA");
  await page.getByLabel("Calories estimées (facultatif)").fill("90");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(page.locator("dialog img")).toBeVisible();
  await button("Ajouter").click();
  await expect(page.locator(".entry")).toHaveCount(3);
  await data();
  const backup = await download("Sauvegarde complète (.json)");
  const parsed = JSON.parse(backup);
  assert.ok(backup.includes("data:image/png"));
  assert.ok(backup.includes("Repas variable QA"));
  await download("Exporter toutes mes données (.csv)");
  await tab("Repas");
  const photoRow = page.locator(".action-row").filter({ hasText: "Photo QA" });
  await photoRow.getByRole("button", { name: "Actions", exact: true }).click();
  await photoRow
    .getByRole("button", { name: "Supprimer", exact: true })
    .click();
  await button("Confirmer").click();
  await expect(page.locator(".entry")).toHaveCount(2);
  await data();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup),
    });
  await button("Importer après vérification").click();
  await button("Confirmer").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await tab("Repas");
  await expect(page.locator(".entry")).toHaveCount(3);
  await expect(page.locator(".entry img")).toBeVisible();
  await data();
  await button("Repas · outils historiques").click();
  await button("Assistant de repas").click();
  await button("Collation").click();
  await button("Banane").click();
  await expect(page.locator("dialog")).toContainText("106 kcal");
  await page.getByRole("button", { name: /^Ajouter au / }).click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await data();
  await button("Progression physique · poids et photos").click();
  await button("Ajouter un repère").click();
  await page.getByLabel("Tour de taille (cm)", { exact: true }).fill("82");
  await page.getByLabel("Poids (kg), facultatif", { exact: true }).fill("78");
  await button("Enregistrer").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await tab("Mensuration");
  await button("Page suivante").click();
  await page.getByLabel("Poitrine en centimètres", { exact: true }).fill("95");
  await button("Augmenter de 0,5 centimètre").dblclick();
  await expect(
    page.getByLabel("Poitrine en centimètres", { exact: true }),
  ).toHaveValue("96");
  await button("Page suivante").click();
  await button("Page suivante").click();
  await button("Bas du corps").click();
  await page.getByLabel("Longueur en centimètres", { exact: true }).fill("10");
  await closeToast(page);
  await page.screenshot({
    path: "qa/secret-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await data();
  const finalBackup = await download("Sauvegarde complète (.json)");
  const saved = JSON.parse(finalBackup);
  const state = saved.state ?? saved.data ?? saved;
  assert.equal(state.entries.length, 4);
  assert.equal(state.physical.length, 1);
  // Import a past day into this isolated browser to exercise historical editing.
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const key = yesterday.toLocaleDateString("sv-SE");
  state.settings.first = key;
  state.days[key] = { basal: 1700, steps: 100 };
  state.entries.push({
    ...state.entries[0],
    id: "past-qa",
    timestamp: yesterday.getTime(),
    foodName: "Historique QA",
  });
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "history.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved)),
    });
  await button("Importer après vérification").click();
  await button("Confirmer").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await tab("Global");
  await page.locator(".history-day").first().click();
  await expect(page.locator(".edit-banner")).toBeVisible();
  await tab("Repas");
  await expect(page.locator(".entry")).toContainText("Historique QA");
  await button("Terminer ✓").click();
  await expect(page.locator(".entry")).toHaveCount(4);
  await page.reload();
  await page.locator(".liquid-nav").waitFor();
  await tab("Repas");
  await expect(page.locator(".entry")).toHaveCount(4);
  const storage = await context.storageState({ indexedDB: true });
  for (const [width, height, mobile] of [
    [390, 844, true],
    [844, 390, true],
    [1920, 1080, false],
    [2560, 1440, false],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      locale: "fr-FR",
      timezoneId: "Europe/Paris",
      isMobile: mobile,
      hasTouch: mobile,
      storageState: storage,
    });
    const p = await ctx.newPage();
    p.setDefaultTimeout(15000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("http://localhost:8787");
    await p.locator(".liquid-nav").waitFor();
    for (const name of ["Global", "Repas", "Mensuration", "Activité"]) {
      const b = p.getByRole("button", { name, exact: true });
      await b.click();
      await expect(b).toHaveAttribute("aria-current", "page");
      await p.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
      });
      await p.screenshot({
        path: `qa/verified-${name}-${width}x${height}.png`,
        fullPage: true,
        animations: "disabled",
      });
      if (name === "Repas" && width === 844) {
        const add = await p.locator('.add-meal').boundingBox();
        const nav = await p.locator('.liquid-nav').boundingBox();
        assert.ok(add.y + add.height <= nav.y, 'Le bouton Ajouter doit rester au-dessus de la navigation en paysage');
        await p.getByRole('button', { name: '＋ Ajouter', exact: true }).click();
        await expect(p.getByRole('dialog')).toBeVisible();
        await p.getByRole('button', { name: 'Fermer', exact: true }).click();
      }
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    "qa/extended-results.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "custom food and exact calories",
          "variable meal",
          "photo",
          "JSON/CSV download",
          "delete and restore",
          "legacy wizard",
          "physical progress",
          "rapid measurement increments",
          "secret measurements",
          "past day edit",
          "reload",
          "mobile and desktop contexts",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  // Put the available source and rendered implementation together without altering either image.
  const comparison = await browser.newPage({
    viewport: { width: 800, height: 1450 },
  });
  await comparison.setContent(
    `<style>body{margin:0;background:#333;color:white;font:14px sans-serif}main{display:flex;gap:20px}figure{margin:0;width:390px}img{width:390px;display:block}figcaption{height:48px}</style><main><figure><figcaption>Android : capture ancienne (13 septembre), assombrie</figcaption><img src="data:image/png;base64,${readFileSync("../screen-global.png").toString("base64")}"></figure><figure><figcaption>Web : code actuel, données QA (états différents)</figcaption><img src="data:image/png;base64,${readFileSync("qa/verified-Global-390x844.png").toString("base64")}"></figure></main>`,
  );
  await comparison
    .locator("img")
    .evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode())));
  await comparison.screenshot({
    path: "qa/comparison-global.png",
    fullPage: true,
    animations: "disabled",
  });
  console.log(
    "Parcours étendus, photos, sauvegardes, historique et contextes PC/mobile : OK",
  );
} finally {
  await browser.close();
}
async function closeToast(page) {
  if (await page.locator(".toast").isVisible())
    await page.locator(".toast").click();
}
