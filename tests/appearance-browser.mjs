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
  const expectAccent = async (color) => {
    const balanceAccent = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--balance-accent")
        .trim(),
    );
    const balanceRgb = `rgb(${[1, 3, 5].map((i) => parseInt(balanceAccent.slice(i, i + 2), 16)).join(", ")})`;
    await expect(page.locator(".balance-card .goal-chip")).toHaveCSS(
      "color",
      balanceRgb,
    );
    await expect(page.locator(".balance-card .cum-deficit")).toHaveCSS(
      "color",
      balanceRgb,
    );
    const semantic = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return [
        style.getPropertyValue("--pink").trim(),
        style.getPropertyValue("--green").trim(),
      ];
    });
    for (let i = 0; i < 2; i++) {
      const expected = `rgb(${[1, 3, 5].map((offset) => parseInt(semantic[i].slice(offset, offset + 2), 16)).join(", ")})`;
      await expect(page.locator(".daily-band .daily-value").nth(i)).toHaveCSS(
        "color",
        expected,
      );
    }
    const rgb = `rgb(${[1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)).join(", ")})`;
    await expect(page.locator(".balance-card")).toHaveCSS(
      "background-color",
      rgb,
    );
    await expect(page.locator(".weight-tracking .primary")).toHaveCSS(
      "background-color",
      rgb,
    );
    if (await page.getByRole("dialog").isVisible()) {
      await expect(page.getByRole("dialog").locator(".primary")).toHaveCSS(
        "background-color",
        rgb,
      );
      const accents = await page.evaluate(() =>
        [document.documentElement, document.querySelector("dialog")].map((el) =>
          getComputedStyle(el).getPropertyValue("--accent").trim(),
        ),
      );
      expect(accents[0]).toBe(accents[1]);
    }
  };
  await page.goto("http://localhost:8787");
  await expect(page).toHaveTitle("Kalo");
  await expect(page.locator(".mobile-brand")).toHaveText("Kalo.");
  await open();
  await page.getByLabel("Mode d’affichage").selectOption("dark");
  await page.getByRole("button", { name: "Rose", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(halo).toBe("#dc92b7");
  await expectAccent("#dc92b7");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(halo).toBe("#a89ae5");
  await expectAccent("#a89ae5");
  await open();
  await page.getByLabel("Mode d’affichage").selectOption("dark");
  await page.getByRole("button", { name: "Bleu", exact: true }).click();
  await expect.poll(halo).toBe("#80b4e7");
  await expectAccent("#80b4e7");
  await page
    .getByRole("button", { name: "Enregistrer l’apparence", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(halo).toBe("#80b4e7");
  await page.screenshot({ path: "qa/kalo-dark-mobile.png", fullPage: true });
  await open();
  await page.getByLabel("Mode d’affichage").selectOption("light");
  await expect.poll(halo).toBe("#80b4e7");
  await page
    .getByRole("button", { name: "Enregistrer l’apparence", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.screenshot({ path: "qa/kalo-light-mobile.png", fullPage: true });
  await expectAccent("#80b4e7");
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
  await expect.poll(halo).toBe("#80b4e7");
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  for (const mode of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: mode });
    await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
    const surface = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--summary-surface")
        .trim(),
    );
    const surfaceRgb = `rgb(${[1, 3, 5].map((i) => parseInt(surface.slice(i, i + 2), 16)).join(", ")})`;
    await expect(page.locator(".calorie-summary")).toHaveCSS(
      "background-color",
      surfaceRgb,
    );
    await page.screenshot({
      path: `qa/kalo-meals-accent-${mode}.png`,
      fullPage: true,
    });
  }
  console.log(
    "Kalo : nom, halo personnalisé, annulation, persistance et thèmes indépendants OK",
  );
} finally {
  await browser.close();
}
