import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import {
  computeWeeklyMetrics,
  latestRecapWeek,
  shiftWeekDay,
} from "../supabase/functions/_shared/weekly-metrics.ts";
const user = "10000000-0000-4000-8000-000000000001",
  latest = latestRecapWeek(new Date()),
  older = shiftWeekDay(latest, -7);
function fixture(start, label) {
  const source = {
    settings: { basal: 1700, deficitGoal: 300 },
    days: {},
    entries: [],
  };
  for (let i = -7; i < 7; i++) {
    const day = shiftWeekDay(start, i);
    source.days[day] = {
      basal: 1700,
      steps: 7000 + i * 200,
      weightKg: i < 0 ? 78.4 : 78.1,
      measurements: i === 5 ? { Taille: 85 } : undefined,
    };
    source.entries.push({
      timestamp: Date.parse(day + "T12:00:00+01:00"),
      calories: 2050,
      proteinGrams: 120,
      carbsGrams: 235,
      fatGrams: 70,
    });
  }
  return {
    week_start: start,
    status: "ready",
    generated_at: new Date().toISOString(),
    metrics: computeWeeklyMetrics(source, start),
    narrative: {
      summary: label,
      observations: ["Une activité régulière et un journal bien renseigné."],
      actions: [
        "Garde ton rythme de suivi.",
        "Poursuis tes habitudes de marche.",
      ],
    },
  };
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  for (const width of [390, 1440]) {
    let enabled = false;
    const reports = new Map([
        [latest, fixture(latest, "Le bilan le plus récent est disponible.")],
        [older, fixture(older, "Voici le bilan de la semaine précédente.")],
      ]),
      calls = [],
      errors = [];
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    await context.addInitScript(
      (user) =>
        localStorage.setItem(
          "sb-rlatjredsjvgjsbrqmtm-auth-token",
          JSON.stringify({
            access_token: user,
            refresh_token: "test",
            token_type: "bearer",
            expires_at: Date.now() / 1000 + 3600,
            user: {
              id: user,
              email: "recap@example.test",
              aud: "authenticated",
              role: "authenticated",
            },
          }),
        ),
      user,
    );
    await context.route("https://*.supabase.co/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.pathname.endsWith("/functions/v1/notifications")) {
        const body = req.postDataJSON();
        calls.push(body);
        if (body.action === "weekly-list")
          return route.fulfill({
            json: {
              enabled,
              latestWeek: latest,
              reports: [...reports.values()]
                .map(({ week_start, status, generated_at }) => ({
                  week_start,
                  status,
                  generated_at,
                }))
                .sort((a, b) => b.week_start.localeCompare(a.week_start)),
            },
          });
        if (body.action === "weekly-get")
          return route.fulfill({
            json: { report: reports.get(body.week) ?? null },
          });
        if (body.action === "weekly-enable") {
          enabled = body.enabled;
          return route.fulfill({ json: { enabled } });
        }
        if (body.action === "weekly-generate") {
          const report = fixture(
            body.week,
            "Un nouveau bilan archivé, sans modifier les autres.",
          );
          reports.set(body.week, report);
          return route.fulfill({ json: { report } });
        }
        return route.fulfill({ json: {} });
      }
      if (url.pathname.endsWith("/logger_documents"))
        return route.fulfill({
          json: [
            { key: "settings/displayName", value: "Camille", revision: 1 },
            { key: "settings/profileCompleted", value: true, revision: 1 },
          ],
        });
      if (url.pathname.endsWith("/rpc/logger_put"))
        return route.fulfill({ json: { accepted: true, revision: 1 } });
      return route.fulfill({ json: [] });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.env.APP_URL || "http://127.0.0.1:5173/");
    await page.locator(".account-access").click();
    const card = page.getByRole("region", { name: "Récap de la semaine" });
    await expect(card).toBeVisible();
    assert.equal(
      await card.evaluate((el) =>
        el.previousElementSibling.classList.contains("account-sync"),
      ),
      true,
    );
    await card.getByRole("button").click();
    await expect(
      page.getByRole("dialog", { name: "Récap hebdomadaire" }),
    ).toBeVisible();
    await expect(
      page.getByText("Le bilan le plus récent est disponible.", {
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(calls.filter((c) => c.action === "weekly-generate").length, 0);
    await page
      .getByLabel("Activer mon récap automatique", { exact: true })
      .check();
    await expect(
      page.getByRole("status").filter({ hasText: "Récap automatique activé" }),
    ).toBeVisible();
    assert.equal(enabled, true);
    const dialog = page.getByRole("dialog", { name: "Récap hebdomadaire" });
    await dialog.evaluate(async (el) =>
      Promise.all(el.getAnimations().map((a) => a.finished)),
    );
    await dialog.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({ path: `qa/weekly-recap-${width}.png` });
    assert.equal(
      await dialog.evaluate((el) => el.scrollWidth === el.clientWidth),
      true,
    );
    await page
      .getByLabel("Semaine du récap", { exact: true })
      .selectOption(older);
    await expect(
      page.getByText("Voici le bilan de la semaine précédente.", {
        exact: true,
      }),
    ).toBeVisible();
    const missing = shiftWeekDay(latest, -14);
    await page
      .getByLabel("Semaine du récap", { exact: true })
      .selectOption(missing);
    await page
      .getByRole("button", { name: "Générer ce récap", exact: true })
      .click();
    await expect(
      page.getByText("Un nouveau bilan archivé, sans modifier les autres.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Semaine du récap", { exact: true })
      .selectOption(latest);
    await expect(
      page.getByText("Le bilan le plus récent est disponible.", {
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(calls.filter((c) => c.action === "weekly-generate").length, 1);
    await page.goto(
      (process.env.APP_URL || "http://127.0.0.1:5173/") +
        `?kaloReminder=weekly&account=${user}&reminderDay=${older}`,
    );
    await expect(
      page.getByText("Voici le bilan de la semaine précédente.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `Récap ${width}px : zone sous synchro, lecture, historique, activation, génération et notification OK`,
    );
  }
} finally {
  await browser.close();
}
