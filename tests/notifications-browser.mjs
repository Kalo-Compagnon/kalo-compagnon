import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const user = "10000000-0000-4000-8000-000000000001";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
}).format(new Date());
const prefs = {
  version: 1,
  enabled: true,
  timezone: "Europe/Paris",
  stopAt: "22:00",
  weight: { enabled: true, time: "09:00" },
  steps: { enabled: true, time: "21:00" },
  mealsMissing: true,
  missingAfterMinutes: 45,
  beforeMinutes: 15,
  meals: {
    breakfast: { expected: true, time: "08:00", before: true },
    lunch: { expected: true, time: "12:30", before: true },
    snack: { expected: true, time: "16:30", before: false },
    dinner: { expected: true, time: "20:00", before: true },
  },
};
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  for (const width of [390, 1440]) {
    let settings = structuredClone(prefs),
      snoozes = [],
      deviceActive = false;
    const calls = [],
      errors = [],
      docs = new Map([
        [
          "settings/displayName",
          { key: "settings/displayName", value: "Camille", revision: 1 },
        ],
        [
          "settings/profileCompleted",
          { key: "settings/profileCompleted", value: true, revision: 1 },
        ],
      ]);
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      timezoneId: "Europe/Paris",
    });
    await context.addInitScript(
      ({ user }) => {
        localStorage.setItem(
          "sb-rlatjredsjvgjsbrqmtm-auth-token",
          JSON.stringify({
            access_token: user,
            refresh_token: "test",
            token_type: "bearer",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: user,
              email: "test@example.test",
              aud: "authenticated",
              role: "authenticated",
            },
          }),
        );
        Object.defineProperty(navigator, "userAgent", { value: "iPhone test" });
        Object.defineProperty(navigator, "standalone", { value: true });
        let subscription = null;
        const fake = {
          scope: "https://kalo-compagnon.github.io/kalo-compagnon/",
          pushManager: {
            getSubscription: async () => subscription,
            subscribe: async () => {
              subscription = {
                unsubscribe: async () => {
                  subscription = null;
                  return true;
                },
                toJSON: () => ({
                  endpoint: "https://web.push.apple.com/test-endpoint-example",
                  keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
                }),
              };
              return subscription;
            },
          },
        };
        Object.defineProperty(navigator.serviceWorker, "ready", {
          value: Promise.resolve(fake),
        });
        Object.defineProperty(navigator.serviceWorker, "getRegistration", {
          value: async () => fake,
        });
        Object.defineProperty(Notification, "permission", {
          get: () => window.testPermission || "default",
        });
        Notification.requestPermission = async () => {
          window.testPermission = "granted";
          return "granted";
        };
      },
      { user },
    );
    await context.route("https://*.supabase.co/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.pathname.endsWith("/functions/v1/notifications")) {
        const body = req.postDataJSON();
        calls.push(body);
        if (body.action === "status")
          return route.fulfill({
            json: {
              settings,
              publicKey: "A".repeat(87),
              deviceActive,
              snoozes,
            },
          });
        if (body.action === "save") {
          settings = body.settings;
          return route.fulfill({ json: { settings } });
        }
        if (body.action === "subscribe") {
          deviceActive = true;
          return route.fulfill({ json: { subscribed: true } });
        }
        if (body.action === "unsubscribe") {
          deviceActive = false;
          return route.fulfill({ json: { subscribed: false } });
        }
        if (body.action === "test")
          return route.fulfill({ json: { sent: true } });
        if (body.action === "later") {
          snoozes = [
            {
              kind: body.kind,
              day: body.day,
              started_at: new Date().toISOString(),
            },
          ];
          return route.fulfill({
            json: { nextAt: new Date(Date.now() + 45 * 60000).toISOString() },
          });
        }
      }
      if (url.pathname.endsWith("/logger_documents"))
        return route.fulfill({ json: [...docs.values()] });
      if (url.pathname.endsWith("/rpc/logger_put")) {
        const { p_key, p_value } = req.postDataJSON(),
          revision = (docs.get(p_key)?.revision ?? 0) + 1;
        docs.set(p_key, { key: p_key, value: p_value, revision });
        return route.fulfill({ json: { accepted: true, revision } });
      }
      return route.fulfill({ json: [] });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.env.APP_URL || "http://127.0.0.1:5173/");
    await page.locator(".account-access").click();
    await page
      .getByRole("button", {
        name: "Notifications Rappels et horaires",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Notifications", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Heure du rappel Pesée", { exact: true }),
    ).toHaveValue("09:00");
    await page
      .getByLabel("Heure du rappel Pesée", { exact: true })
      .fill("10:15");
    await page.getByLabel("Heure Déjeuner", { exact: true }).fill("12:45");
    await page
      .getByLabel("Délai avant les repas", { exact: true })
      .selectOption("20");
    await page
      .getByRole("button", { name: "Enregistrer les rappels", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Rappels enregistrés" }),
    ).toBeVisible();
    assert.equal(settings.weight.time, "10:15");
    assert.equal(settings.meals.lunch.time, "12:45");
    assert.equal(settings.beforeMinutes, 20);
    await page
      .getByRole("button", { name: "Autoriser sur cet iPhone", exact: true })
      .click();
    await expect(
      page.getByText("Cet iPhone est activé", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Envoyer un test", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Notification de test envoyée" }),
    ).toBeVisible();
    assert.ok(calls.some((c) => c.action === "subscribe"));
    const todayPanel = page.locator(".notification-today");
    await todayPanel.locator("summary").click();
    const weight = todayPanel
      .locator(".notification-pending")
      .filter({ has: page.getByText("Pesée", { exact: true }) });
    await weight
      .getByRole("button", { name: "Plus tard · 45 min", exact: true })
      .click();
    await expect(weight.getByText(/Relance vers/)).toBeVisible();
    assert.ok(
      calls.some(
        (c) => c.action === "later" && c.kind === "weight" && c.day === today,
      ),
    );
    const breakfast = todayPanel
      .locator(".notification-pending")
      .filter({ has: page.getByText("Petit-déjeuner", { exact: true }) });
    await breakfast
      .getByRole("button", {
        name: "Je saute ce repas aujourd’hui",
        exact: true,
      })
      .click();
    await expect(breakfast).toHaveCount(0);
    await todayPanel
      .getByRole("button", { name: "Rétablir ce repas", exact: true })
      .click();
    await expect(breakfast).toHaveCount(1);
    await page
      .locator("dialog[open]")
      .evaluate(async (el) =>
        Promise.all(el.getAnimations().map((a) => a.finished)),
      );
    const box = await page.locator("dialog[open]").evaluate((el) => ({
      width: el.clientWidth,
      scrollWidth: el.scrollWidth,
    }));
    assert.equal(box.width, box.scrollWidth);
    await page.locator("dialog[open]").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({ path: `qa/notifications-${width}.png` });
    await weight
      .getByRole("button", { name: "Compléter", exact: true })
      .click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Poids sur la balance", exact: true }),
    ).toBeVisible();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `Notifications ${width}px : réglages, activation, test, report 45 min, repas sauté et navigation OK`,
    );
  }
} finally {
  await browser.close();
}
