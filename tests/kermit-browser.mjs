import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
const uid = "10000000-0000-4000-8000-000000000001";
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "fr-FR",
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(
    (uid) =>
      localStorage.setItem(
        "sb-rlatjredsjvgjsbrqmtm-auth-token",
        JSON.stringify({
          access_token: uid,
          refresh_token: "test",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: uid,
            aud: "authenticated",
            role: "authenticated",
            email: "kermit@example.test",
          },
        }),
      ),
    uid,
  );
  const docs = new Map([
    [
      "settings/profileCompleted",
      { key: "settings/profileCompleted", value: true, revision: 1 },
    ],
    ["settings/theme", { key: "settings/theme", value: "system", revision: 1 }],
    [
      "settings/haloColor",
      { key: "settings/haloColor", value: "#80b4e7", revision: 1 },
    ],
  ]);
  const requests = [];
  let mode = "estimate";
  const reply = (kcal = 150) => ({
    type: "estimation",
    message: "Voici mon estimation.",
    meal_id: "10000000-0000-4000-8000-000000000009",
    nom_repas: "Repas Kermit QA",
    ingredients: [
      { nom: "Riz", quantite_g: 100, kcal, source: "Estimation Gemini" },
    ],
    total_kcal: kcal,
    incertitudes: ["Sauce non pesée"],
  });
  await context.route("https://*.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body = [];
    if (path.endsWith("/functions/v1/kermit")) {
      const request = route.request().postDataJSON();
      requests.push(request);
      if (mode === "error")
        return route.fulfill({
          status: 429,
          json: {
            error:
              "Limite quotidienne atteinte. Kermit sera disponible après minuit UTC.",
          },
        });
      if (mode === "unavailable")
        return route.fulfill({
          status: 404,
          json: {
            code: "NOT_FOUND",
            message: "Requested function was not found",
          },
        });
      body =
        mode === "question"
          ? { type: "conversation", message: "Quelle quantité environ ?" }
          : reply(mode === "correction" ? 90 : 150);
    } else if (path.endsWith("/logger_documents")) body = [...docs.values()];
    else if (path.endsWith("/rpc/logger_put")) {
      const input = route.request().postDataJSON();
      const key = input.p_key,
        value = input.p_value;
      const revision = (docs.get(key)?.revision ?? 0) + 1;
      docs.set(key, { key, value, revision });
      body = { accepted: true, revision, value };
    } else if (path.endsWith("/auth/v1/user")) body = { id: uid };
    await route.fulfill({ json: body });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:8787");
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  const open = () =>
    page.getByRole("button", { name: "Kermit Cuisto", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const send = async (text) => {
    await dialog.getByLabel("Ton repas ou ta correction").fill(text);
    await dialog.getByRole("button", { name: "Envoyer", exact: true }).click();
  };
  await open();
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await open();
  mkdirSync("qa", { recursive: true });
  await page.screenshot({
    path: "qa/kermit-chat-welcome.png",
    animations: "disabled",
  });
  await send("100 g de riz avec sauce");
  await expect(dialog.getByText("Total estimé : 150 kcal")).toBeVisible();
  assert.equal(requests[0].history.length, 0);
  mode = "correction";
  await send("En fait, 60 g de riz");
  await expect(dialog.getByText("Total estimé : 90 kcal")).toBeVisible();
  await expect(
    dialog.getByRole("region", { name: "Estimation calorique" }),
  ).toHaveCount(1);
  assert.equal(requests[1].history.length, 2);
  await page.screenshot({
    path: "qa/kermit-chat-conversation.png",
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Ajouter au journal" }).dblclick();
  await expect(
    dialog.getByRole("button", { name: "Ajouté au journal" }),
  ).toBeDisabled();
  await expect(page.locator(".entry")).toHaveCount(1);
  await expect(page.locator('.entry [aria-label="Estimation Gemini"] img')).toHaveCount(1);
  assert(await page.locator('.entry [aria-label="Estimation Gemini"] img').evaluate(img => img.complete && img.naturalWidth > 0));
  mode = "correction";
  await send("La sauce est légère");
  await expect(
    dialog.getByRole("button", { name: "Ajouté au journal" }),
  ).toBeDisabled();
  mode = "question";
  await send("Un autre repas, des pâtes");
  await expect(dialog.getByText("Quelle quantité environ ?")).toBeVisible();
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(
    dialog.getByText(/La conversation et les photos seront perdues/),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(dialog.getByText("Quelle quantité environ ?")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    dialog.getByRole("button", { name: "Fermer la conversation" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.evaluate(() => history.back());
  await expect(
    dialog.getByRole("button", { name: "Fermer la conversation" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await dialog
    .locator('input[type="file"]')
    .last()
    .setInputFiles({
      name: "repas.png",
      mimeType: "image/png",
      buffer: Buffer.from(jpeg, "base64"),
    });
  await expect(dialog.getByAltText("Photo prête à envoyer")).toBeVisible();
  await dialog.getByRole("button", { name: "Retirer la photo" }).click();
  await expect(dialog.getByAltText("Photo prête à envoyer")).toHaveCount(0);
  await dialog
    .locator('input[type="file"]')
    .last()
    .setInputFiles({
      name: "repas.png",
      mimeType: "image/png",
      buffer: Buffer.from(jpeg, "base64"),
    });
  await expect(dialog.getByAltText("Photo prête à envoyer")).toBeVisible();
  mode = "estimate";
  await dialog.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(dialog.getByAltText("Photo du repas envoyée")).toBeVisible();
  await expect(dialog.getByText("Total estimé : 150 kcal")).toBeVisible();
  assert(requests.at(-1).image.startsWith("data:image/jpeg;base64,"));
  mode = "unavailable";
  await send("Analyse mon repas");
  await expect(dialog.getByRole("alert")).toContainText(
    "pas encore activé sur le serveur",
  );
  await expect(dialog.getByLabel("Ton repas ou ta correction")).toHaveValue(
    "Analyse mon repas",
  );
  mode = "error";
  await send("Corrige encore");
  await expect(dialog.getByRole("alert")).toContainText("Limite quotidienne");
  await expect(dialog.getByLabel("Ton repas ou ta correction")).toHaveValue(
    "Corrige encore",
  );
  await expect(dialog.getByText("Total estimé : 150 kcal")).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  mkdirSync("qa", { recursive: true });
  await page.screenshot({ path: "qa/kermit-iphone-light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const accent = await page.evaluate(() => [
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim(),
    getComputedStyle(document.querySelector("dialog"))
      .getPropertyValue("--accent")
      .trim(),
  ]);
  assert.equal(accent[0], accent[1]);
  await page.screenshot({ path: "qa/kermit-iphone-dark.png" });
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await dialog.getByRole("button", { name: "Fermer la conversation" }).click();
  await expect(dialog).not.toBeVisible();
  await open();
  await expect(dialog.locator(".kermit-bubble")).toHaveCount(0);
  mode = "estimate";
  await send("Un nouveau repas");
  await expect(dialog.getByText("Total estimé : 150 kcal")).toBeVisible();
  assert.equal(requests.at(-1).history.length, 0);
  await page.reload();
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await expect(page.locator(".entry")).toHaveCount(1);
  await open();
  await expect(dialog.locator(".kermit-bubble")).toHaveCount(0);
  const storage = await page.evaluate(async () => {
    const request = indexedDB.open("logger-web-v2");
    const db = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction("documents");
    const get = tx.objectStore("documents").getAll();
    return await new Promise((resolve) => {
      get.onsuccess = () => resolve(JSON.stringify(get.result));
    });
  });
  assert(!storage.includes("100 g de riz avec sauce"));
  assert(!storage.includes("data:image/"));
  await dialog
    .locator('input[type="file"]')
    .last()
    .setInputFiles({
      name: "unsafe.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
  await expect(dialog.getByRole("alert")).toContainText("JPEG");
  await context.setOffline(true);
  await send("Un repas hors ligne");
  await expect(dialog.getByRole("alert")).toContainText("Pas de connexion");
  await context.setOffline(false);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // A sign-out broadcast from another tab must destroy an active conversation.
  await page.evaluate(() => {
    localStorage.removeItem("sb-rlatjredsjvgjsbrqmtm-auth-token");
    const channel = new BroadcastChannel("sb-rlatjredsjvgjsbrqmtm-auth-token");
    channel.postMessage({ event: "SIGNED_OUT", session: null });
    channel.close();
  });
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Repas", exact: true }).click();
  await open();
  await expect(dialog.locator(".kermit-bubble")).toHaveCount(0);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "Kermit browser: chat, corrections, photos, quotas, close/back/Escape, persistence and iPhone layout OK",
  );
} finally {
  await browser.close();
}
