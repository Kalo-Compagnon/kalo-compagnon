import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
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
            value: { measurements: { Poitrine: 103, Taille: 93 } },
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
  await page.getByRole("button", { name: "Corps", exact: true }).click();
  await page.getByRole("button", { name: "Mensurations", exact: true }).click();
  const details = page.locator(".measurement-day").first(),
    summary = details.locator("summary");
  const closed = await details.evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  await summary.click();
  await expect(details).toHaveAttribute("data-disclosure-animating", "");
  await details.evaluate((el) => {
    const animation = el.getAnimations()[0];
    animation.pause();
    animation.currentTime = 120;
  });
  expect(
    await details.evaluate((el) => el.getBoundingClientRect().height),
  ).toBeGreaterThan(closed);
  await summary.click();
  await expect(details).not.toHaveAttribute("open");
  await expect(details).not.toHaveAttribute("data-disclosure-animating");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open");
  await expect(details).not.toHaveAttribute("data-disclosure-animating");
  expect(
    await details.evaluate((el) => el.getBoundingClientRect().height),
  ).toBeGreaterThan(closed);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await summary.click();
  await expect(details).not.toHaveAttribute("open");
  expect(await details.evaluate((el) => el.getAnimations().length)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: /Mode local/ }).click();
  await page.getByRole("button", { name: "Apparence", exact: true }).click();
  const select = page.getByLabel("Mode d’affichage");
  await select.click();
  await page.getByRole("option", { name: "Sombre", exact: true }).click();
  await expect(select).toHaveValue("dark");
  expect(errors).toEqual([]);
  console.log(
    "Disclosures: animated opening, reversal, closing, keyboard and reduced motion verified.",
  );
} finally {
  await browser.close();
}
