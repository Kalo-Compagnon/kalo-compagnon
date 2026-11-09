import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
mkdirSync("qa", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  await page.goto("http://localhost:8787");
  await expect(page.locator(".liquid-nav")).toBeVisible();
  const dates = await page.evaluate(async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
    }).format(new Date());
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    const yesterday = date.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() - 1);
    const older = date.toISOString().slice(0, 10);
    const rows = [
      { key: "settings/first", value: older, revision: 0, pending: true },
    ];
    for (const day of [yesterday, older]) {
      rows.push({
        key: `day/${day}`,
        value: { basal: 1500, steps: 1000, weightKg: 80 },
        revision: 0,
        pending: true,
      });
      rows.push({
        key: `measurement/${day}/Poitrine`,
        value: 95,
        revision: 0,
        pending: true,
      });
      rows.push({
        key: `entry/${day}`,
        value: {
          id: day,
          timestamp: new Date(`${day}T12:00:00Z`).getTime(),
          type: "food",
          foodName: "Historique",
          calories: 200,
        },
        revision: 0,
        pending: true,
      });
    }
    const db = await new Promise((resolve) => {
      const r = indexedDB.open("logger-web-v2");
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction("documents", "readwrite");
    tx.objectStore("documents").put(rows, "guest");
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { yesterday, older };
  });
  await page.reload();
  const row = page
    .locator(".swipe-card")
    .filter({ has: page.locator(`time[datetime="${dates.yesterday}"]`) });
  async function drag(distance) {
    await row.scrollIntoViewIfNeeded();
    const box = await row.boundingBox();
    const start = distance > 0 ? box.x + 15 : box.x + box.width - 15;
    await page.mouse.move(start, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(start + distance, box.y + box.height / 2, {
      steps: 10,
    });
  }
  const offset = () =>
    row
      .locator(".swipe-content")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
  await drag(-35);
  await expect.poll(offset).toBeLessThan(-25);
  await page.mouse.up();
  await expect.poll(offset).toBe(0);
  await expect(page.locator(".edit-banner")).not.toBeVisible();
  await drag(-100);
  await page.mouse.up();
  await expect(page.locator(".edit-banner")).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const [width, height] of [
      [390, 844],
      [844, 390],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const frame = await page.locator(".app.editing").evaluate((el) => {
        const banner = document.querySelector(".edit-banner"),
          rect = banner.getBoundingClientRect();
        const border = getComputedStyle(el, "::before"),
          button = getComputedStyle(banner.querySelector("button"));
        const nav = getComputedStyle(document.querySelector(".liquid-nav"));
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: innerWidth,
          inset: [border.top, border.right, border.bottom, border.left],
          z: Number(border.zIndex),
          navZ: Number(nav.zIndex),
          radius: border.borderRadius,
          foreground: button.color,
          background: button.backgroundColor,
        };
      });
      assert.equal(frame.left, 0);
      assert.equal(frame.right, frame.width);
      assert.equal(frame.top, 0);
      assert.deepEqual(frame.inset, ["0px", "0px", "0px", "0px"]);
      assert.ok(frame.z > frame.navZ);
      assert.equal(frame.radius, "0px");
      assert.equal(frame.foreground, "rgb(255, 255, 255)");
      assert.equal(frame.background, "rgb(48, 37, 20)");
      if (width === 390)
        await page.screenshot({ path: `qa/editing-ui-${theme}.png` });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Terminer ✓", exact: true }).click();
  await drag(100);
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toContainText("Supprimer la journée");
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(row).toHaveCount(1);
  await drag(100);
  await page.mouse.up();
  await page.getByRole("button", { name: "Confirmer", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(row).toHaveCount(0);
  await expect(
    page.locator(`.history-day time[datetime="${dates.older}"]`),
  ).toHaveCount(1);
  const records = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open("logger-web-v2");
      r.onsuccess = () => resolve(r.result);
    });
    const rows = await new Promise((resolve) => {
      const r = db
        .transaction("documents")
        .objectStore("documents")
        .get("guest");
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return rows;
  });
  assert.equal(
    records.find((d) => d.key === `day/${dates.yesterday}`).value.isDeleted,
    true,
  );
  assert.equal(
    records.find((d) => d.key === `entry/${dates.yesterday}`).value,
    null,
  );
  assert.equal(
    records.find((d) => d.key === `measurement/${dates.yesterday}/Poitrine`)
      .value,
    null,
  );
  assert.equal(
    records.find((d) => d.key === `entry/${dates.older}`).value.calories,
    200,
  );
  console.log(
    "History swipe: animated drag, edit, delete confirmation, cancel, persistence and other days preserved OK",
  );
} finally {
  await browser.close();
}
