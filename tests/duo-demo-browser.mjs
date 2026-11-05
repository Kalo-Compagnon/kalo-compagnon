import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    locale: "fr-FR",
    colorScheme: "light",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem(
      "sb-rlatjredsjvgjsbrqmtm-auth-token",
      JSON.stringify({
        access_token: "demo-session",
        refresh_token: "demo-refresh",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: "10000000-0000-4000-8000-000000000001",
          aud: "authenticated",
          role: "authenticated",
          email: "demo@example.test",
        },
      }),
    );
  });
  let duoCalls = 0;
  await page.route("https://*.supabase.co/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/rpc/logger_duo")) {
      duoCalls++;
      return route.fulfill({
        status: 403,
        json: { message: "Demo must not access real Duo" },
      });
    }
    if (url.includes("/rpc/logger_put"))
      return route.fulfill({ json: { accepted: true, revision: 1 } });
    if (url.includes("/logger_documents"))
      return route.fulfill({
        json: [
          { key: "settings/displayName", value: "Compte de test", revision: 1 },
          { key: "settings/profileCompleted", value: true, revision: 1 },
          { key: "settings/duoDemo", value: true, revision: 1 },
          { key: "settings/haloColor", value: "#98bd93", revision: 1 },
          { key: "settings/theme", value: "system", revision: 1 },
        ],
      });
    return route.fulfill({ json: {} });
  });
  await page.goto("http://localhost:8787");
  const tab = (name) => page.getByRole("button", { name, exact: true }).click();
  await tab("Duo");
  await expect(
    page.getByRole("heading", { name: "Exemple de Duo" }),
  ).toBeVisible();
  await expect(
    page.getByText("Données entièrement fictives · Lecture seule.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Profil A", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Profil B", exact: true }),
  ).toBeVisible();
  const leftHome = page.getByRole("region", {
    name: "Accueil de Profil A",
    exact: true,
  });
  const rightHome = page.getByRole("region", {
    name: "Accueil de Profil B",
    exact: true,
  });
  for (const home of [leftHome, rightHome]) {
    await expect(
      home.getByText("Bilan calorique", { exact: true }),
    ).toBeVisible();
    await expect(home.getByText("Apport moyen", { exact: true })).toBeVisible();
    await expect(
      home.getByText("Dépense moyenne", { exact: true }),
    ).toBeVisible();
    await expect(
      home.getByRole("heading", { name: "Apport et dépense", exact: true }),
    ).toHaveCount(0);
    await expect(home.locator("button, input, select, textarea")).toHaveCount(
      0,
    );
    await expect(home.locator("canvas")).toHaveCount(0);
  }
  await expect(leftHome.locator(".balance-card")).toHaveCSS(
    "background-color",
    "rgb(220, 146, 183)",
  );
  await expect(rightHome.locator(".balance-card")).toHaveCSS(
    "background-color",
    "rgb(128, 180, 231)",
  );
  await expect(
    page.getByRole("img", {
      name: "Évolution relative du poids, pesées enregistrées",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("img", {
      name: "Pas des deux profils sur une même échelle",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("img", {
      name: "Dépenses d’activité des deux profils sur une même échelle",
    }),
  ).toHaveCount(0);
  await expect(
    page.locator('main input:not([type="date"]), main select, main textarea'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Gérer mon partage Duo", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Révoquer la liaison", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".ambient-halo")).toHaveCSS(
    "background-image",
    /rgb\(220, 146, 183\) 50%, rgb\(128, 180, 231\) 50%/,
  );
  await expect(page.locator(".duo-steps-cards > .card")).toHaveCount(2);
  await expect(page.locator(".duo-steps-cards > .card").nth(0)).toHaveCSS(
    "background-color",
    "rgb(220, 146, 183)",
  );
  await expect(page.locator(".duo-steps-cards > .card").nth(1)).toHaveCSS(
    "background-color",
    "rgb(128, 180, 231)",
  );
  const commonChart = page
    .getByRole("region", { name: "Apport et dépense du Duo", exact: true })
    .locator("canvas");
  await expect(commonChart).toHaveCount(1);
  await expect(commonChart).toHaveAttribute(
    "aria-label",
    /Profil A, apport.*Profil B, apport/,
  );
  await expect
    .poll(() =>
      commonChart.evaluate((canvas) => {
        const width = parseFloat(canvas.style.width),
          ratio = canvas.width / width;
        const center = 12 + ((width - 24) / 28) * 27.5,
          context = canvas.getContext("2d");
        return [-36, 36].map((offset, index) => {
          const accent = index === 0 ? [220, 146, 183] : [128, 180, 231];
          let upper = [];
          for (let y = 28; y < 182; y++) {
            const pixel = Array.from(
              context.getImageData(
                Math.floor((center + offset) * ratio),
                Math.floor(y * ratio),
                1,
                1,
              ).data,
            );
            if (pixel[3] === 255 && accent.every((v, j) => pixel[j] === v)) {
              upper = pixel.slice(0, 3);
              break;
            }
          }
          const base = index === 0 ? [99, 66, 82] : [58, 81, 104];
          const region = context.getImageData(
            Math.floor((center + offset - 15) * ratio),
            Math.floor(150 * ratio),
            Math.floor(30 * ratio),
            Math.floor(25 * ratio),
          ).data;
          let hasBase = false,
            hasHatch = false;
          for (let i = 0; i < region.length; i += 4) {
            if (base.every((v, j) => region[i + j] === v)) hasBase = true;
            if (
              base.every((v, j) => region[i + j] >= v) &&
              base.some((v, j) => region[i + j] > v + 10)
            )
              hasHatch = true;
          }
          return { upper, hasBase, hasHatch };
        });
      }),
    )
    .toEqual([
      { upper: [220, 146, 183], hasBase: true, hasHatch: true },
      { upper: [128, 180, 231], hasBase: true, hasHatch: true },
    ]);
  const references = await commonChart.evaluate((canvas) => {
    const ratio = canvas.width / parseFloat(canvas.style.width),
      context = canvas.getContext("2d");
    let runs = 0,
      inside = false,
      maximumAlpha = 0;
    for (let y = 28; y < 179; y++) {
      const alpha = context.getImageData(
        Math.floor(102 * ratio),
        Math.floor(y * ratio),
        1,
        1,
      ).data[3];
      if (alpha > 0 && !inside) runs++;
      inside = alpha > 0;
      maximumAlpha = Math.max(maximumAlpha, alpha);
    }
    return { runs, maximumAlpha };
  });
  assert.equal(references.runs, 2, "two distinct horizontal reference lines");
  assert.ok(
    references.maximumAlpha > 0 && references.maximumAlpha <= 100,
    "reference lines remain translucent",
  );
  await expect(
    page.getByRole("region", { name: "Mensurations", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Journée du Duo").fill("2026-10-09");
  await expect(
    page.getByRole("region", { name: "Profil A · Activité physique" }),
  ).toContainText("6956");
  await expect(
    page.getByRole("region", { name: "Profil B · Activité physique" }),
  ).toContainText("6272");
  await page.getByLabel("Journée du Duo").fill("2026-11-05");
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    for (const label of await page.locator(".duo-steps-cards > .card p").all())
      await expect(label).not.toHaveCSS("color", "rgb(0, 0, 0)");
    for (const width of [320, 390, 768, 844, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator(".duo-dashboard")).toHaveCSS("row-gap", "18px");
      await expect(page.locator(".duo-columns").first()).toHaveCSS(
        "column-gap",
        "18px",
      );
      await expect(
        page.locator(".duo-home-profile .balance-card").first(),
      ).toHaveCSS("padding-top", "16px");
      await expect(page.locator(".duo-steps-cards > .card").first()).toHaveCSS(
        "padding-top",
        "12px",
      );
      for (const amount of await page.locator(".duo-home-profile .net").all()) {
        await expect(amount).toHaveCSS("white-space", "nowrap");
        await expect
          .poll(() =>
            amount.evaluate(
              (element) => element.scrollWidth <= element.clientWidth,
            ),
          )
          .toBe(true);
        assert.ok(
          await amount.evaluate(
            (element) => parseFloat(getComputedStyle(element).fontSize) <= 24,
          ),
        );
      }
      assert.equal(
        await page
          .locator(".duo-home-profile .daily-band")
          .evaluateAll((elements) =>
            elements.some(
              (element) => element.scrollWidth > element.clientWidth,
            ),
          ),
        false,
        "daily values fit inside both columns",
      );
      for (const columns of await page.locator(".duo-columns").all()) {
        const cells = columns.locator(":scope > *");
        await expect(cells).toHaveCount(2);
        const left = await cells.nth(0).boundingBox(),
          right = await cells.nth(1).boundingBox();
        assert.equal(left.y, right.y, "both halves must align vertically");
        assert.ok(
          right.x >= left.x + left.width,
          "second profile must stay on the right",
        );
        assert.ok(
          Math.abs(left.width - right.width) < 1,
          "halves must have equal widths",
        );
      }
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${theme} ${width} overflow`,
      );
      if (width === 390)
        await page.screenshot({
          path: `qa/duo-demo-${theme}-mobile.png`,
          fullPage: true,
        });
    }
  }
  await tab("Accueil");
  await expect(page.locator(".balance-card .net")).toHaveCSS(
    "font-size",
    "38px",
  );
  await expect(page.locator(".ambient-halo")).toHaveCSS(
    "background-image",
    "none",
  );
  await expect(page.locator(".ambient-halo")).toHaveCSS(
    "background-color",
    "rgb(152, 189, 147)",
  );
  await expect(page.locator(".weight-record")).toHaveCount(0);
  await tab("Compte de test · Compte");
  await tab("Partage Duo");
  await expect(
    page.getByRole("heading", { name: "Duo de démonstration" }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  assert.equal(duoCalls, 0);
  assert.deepEqual(errors, []);
  console.log(
    "Duo fictif : lecture seule, aucune requête Duo réelle, isolation, halo et cinq largeurs en clair/sombre OK.",
  );
} finally {
  await browser.close();
}
