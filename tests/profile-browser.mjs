import { chromium, expect } from "@playwright/test";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://localhost:8787");
  await page
    .getByRole("heading", { name: "Aujourd’hui", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Mode local · Se connecter" }).click();
  await expect(
    page.getByRole("heading", { name: "Mon compte", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Un compte chacun", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page
    .getByRole("button", { name: "Exporter toutes mes données", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Mon profil et mes objectifs", exact: true })
    .click();
  await page.getByLabel("Prénom", { exact: true }).fill("Camille");
  await page.getByLabel("Femme", { exact: true }).check();
  await page
    .getByLabel("Date de naissance", { exact: true })
    .fill("1996-01-01");
  await page.getByLabel("Taille (cm)", { exact: true }).fill("165");
  await expect(
    page.getByLabel("Poids moyen utilisé (kg)", { exact: true }),
  ).toHaveValue("Aucune pesée");
  await page
    .getByLabel("Objectif de déficit (kcal/j)", { exact: true })
    .fill("300");
  await page
    .getByRole("button", { name: "Enregistrer mon profil", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Exporter toutes mes données", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Mon profil et mes objectifs", exact: true })
    .click();
  await expect(page.getByLabel("Prénom", { exact: true })).toHaveValue(
    "Camille",
  );
  await expect(page.getByLabel("Femme", { exact: true })).toBeChecked();
  await expect(
    page.getByLabel("Date de naissance", { exact: true }),
  ).toHaveValue("1996-01-01");
  await expect(
    page.getByLabel("Objectif de déficit (kcal/j)", { exact: true }),
  ).toHaveValue("300");
  console.log(
    "Profil mobile : accès au compte, enregistrement et rechargement OK",
  );
} finally {
  await browser.close();
}
