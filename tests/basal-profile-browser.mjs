import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await page.goto("http://localhost:8787");
  await page.locator(".daily-stats").waitFor();
  const age = await page.evaluate(async () => {
    const today = new Date();
    const key = (offset) => {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const docs = [
      ["settings/birthDate", "1990-01-01"],
      ["settings/height", 180],
      ["settings/sex", "male"],
      ["settings/first", key(-2)],
      ["day/" + key(-2), { basal: 1500, weightKg: 60 }],
      ["day/" + key(-1), { basal: 1500, weightKg: 66 }],
      ["day/" + key(0), { weightKg: 72 }],
    ].map(([key, value]) => ({ key, value, revision: 0, pending: true }));
    await new Promise((resolve, reject) => {
      const req = indexedDB.open("logger-web-v2");
      req.onsuccess = () => {
        const db = req.result,
          tx = db.transaction("documents", "readwrite");
        tx.objectStore("documents").put(docs, "guest");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    return today.getFullYear() - 1990;
  });
  const expense = (weight) =>
    `${(10 * weight + 6.25 * 180 - 5 * age + 5 + 13.5).toLocaleString("fr-FR", { useGrouping: false, maximumFractionDigits: 1 })} kcal`;
  await page.reload();
  await expect(page.locator(".daily-stats .value").nth(1)).toHaveText(
    expense(66),
  );
  await page
    .getByRole("button", { name: "Paramétrer le métabolisme basal" })
    .click();
  await expect(
    page.getByLabel("Date de naissance", { exact: true }),
  ).toHaveValue("1990-01-01");
  await expect(
    page.getByLabel("Poids moyen utilisé (kg)", { exact: true }),
  ).toHaveValue("66");
  await expect(
    page.getByLabel("Poids moyen utilisé (kg)", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await page.screenshot({
    path: "qa/kalo-basal-birthdate-average.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.locator(".weight-tracking input[type=text]").fill("78");
  await page.locator(".weight-tracking button[type=submit]").click();
  await expect(page.locator(".daily-stats .value").nth(1)).toHaveText(
    expense(68),
  );
  await page.locator(".weight-record").first().click();
  await page
    .getByRole("button", { name: "Supprimer cette pesée", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".daily-stats .value").nth(1)).toHaveText(
    expense(63),
  );
  await page.reload();
  await expect(page.locator(".daily-stats .value").nth(1)).toHaveText(
    expense(63),
  );
  console.log(
    "Métabolisme : date de naissance, moyenne, correction et suppression de pesée, rechargement OK",
  );
} finally {
  await browser.close();
}
