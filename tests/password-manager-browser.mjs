import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.goto("http://localhost:8787");
  const opener = page.getByRole("button", {
    name: "Mode local · Se connecter",
  });
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  assert.equal(await dialog.evaluate((el) => el.matches(":modal")), false);
  await expect(page.locator(".app")).toHaveAttribute("inert", "");
  await expect(dialog.getByLabel("Adresse e-mail")).toHaveAttribute(
    "autocomplete",
    "username",
  );
  await expect(
    dialog.getByLabel("Mot de passe", { exact: true }),
  ).toHaveAttribute("autocomplete", "current-password");
  // Simulate a password manager injecting its own panel outside the React root.
  await page.evaluate(() => {
    const panel = document.createElement("button");
    panel.id = "password-manager-panel";
    panel.textContent = "Remplir les identifiants";
    panel.style.cssText =
      "position:fixed;top:250px;left:400px;z-index:2147483647;background:white;padding:30px";
    panel.onclick = () => {
      panel.dataset.clicked = "true";
      panel.focus();
    };
    document.body.append(panel);
  });
  const panel = page.locator("#password-manager-panel");
  await panel.click();
  await expect(panel).toHaveAttribute("data-clicked", "true");
  await expect(panel).toBeFocused();
  await panel.evaluate((el) => el.remove());
  await dialog.getByLabel("Adresse e-mail").focus();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await opener.click();
  await dialog.getByRole("button", { name: "Apparence", exact: true }).click();
  assert.equal(await dialog.evaluate((el) => el.matches(":modal")), true);
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await opener.click();
  await page
    .locator(".account-sheet-backdrop")
    .click({ position: { x: 10, y: 10 } });
  await expect(dialog).not.toBeVisible();
  console.log(
    "Password manager panel: clickable and focusable; background blocked, Escape and modal transitions OK",
  );
} finally {
  await browser.close();
}
