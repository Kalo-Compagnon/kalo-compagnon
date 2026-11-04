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
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:8787");
  await page.getByRole("button", { name: "Activité", exact: true }).click();
  const input = page.getByLabel(
    "Kcal dépensées · total ajouté pour cette journée",
  );
  const save = page.getByRole("button", {
    name: "Enregistrer les kcal",
    exact: true,
  });
  for (const amount of ["150.5", "200"]) {
    await input.fill(amount);
    await save.click();
    await expect(save).toBeEnabled();
    await expect(page.locator(".steps-history").nth(1)).toContainText(
      amount === "150.5" ? "150,5 kcal" : "200 kcal",
    );
  }
  await expect(page.getByLabel("Pas à ajouter", { exact: true })).toHaveValue(
    "",
  );
  await page.reload();
  await page.getByRole("button", { name: "Activité", exact: true }).click();
  await expect(input).toHaveValue("200");
  await page.screenshot({
    path: "qa/kalo-manual-activity-mobile.png",
    fullPage: true,
  });
  await input.fill("0");
  await save.click();
  await expect(
    page.getByText("Aucune dépense ajoutée manuellement.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Activité", exact: true }).click();
  await expect(input).toHaveValue("0");
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Kcal manuelles : saisie, remplacement, conservation des pas, rechargement et retrait OK",
  );
} finally {
  await browser.close();
}
