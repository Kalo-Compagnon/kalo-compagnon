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
  const open = async () => {
    await page
      .getByRole("button", { name: "Mode local · Se connecter" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Apparence", exact: true })
      .click();
  };
  const halo = () =>
    page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--halo-color"),
    );
  await page.goto("http://localhost:8787");
  await expect(page).toHaveTitle("Kalo");
  await expect(page.locator(".mobile-brand")).toHaveText("Kalo.");
  await open();
  await page.getByLabel("Mode d’affichage").selectOption("dark");
  await page.getByRole("button", { name: "Rose", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(halo).toBe("#dc92b7");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(halo).toBe("#a89ae5");
  await open();
  await page.getByLabel("Mode d’affichage").selectOption("dark");
  await page.getByLabel("Couleur du halo").evaluate((input) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, "#128abc");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(halo).toBe("#128abc");
  await page
    .getByRole("button", { name: "Enregistrer l’apparence", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(halo).toBe("#128abc");
  await page.screenshot({ path: "qa/kalo-dark-mobile.png", fullPage: true });
  await open();
  await page.getByLabel("Mode d’affichage").selectOption("light");
  await expect.poll(halo).toBe("#128abc");
  await page
    .getByRole("button", { name: "Enregistrer l’apparence", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.screenshot({ path: "qa/kalo-light-mobile.png", fullPage: true });
  await open();
  await page.getByLabel("Mode d’affichage").selectOption("system");
  await page
    .getByRole("button", { name: "Enregistrer l’apparence", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(halo).toBe("#128abc");
  console.log(
    "Kalo : nom, halo personnalisé, annulation, persistance et thèmes indépendants OK",
  );
} finally {
  await browser.close();
}
