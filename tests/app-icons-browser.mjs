import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const catalog = JSON.parse(
  readFileSync("public/assets/app-icons/v1/catalog.json", "utf8"),
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
const origin = "http://localhost:8787",
  base = origin + "/kalo-compagnon/";
const user = (letter) => ({
  id: `10000000-0000-4000-8000-00000000000${letter === "a" ? "1" : "2"}`,
  aud: "authenticated",
  role: "authenticated",
  email: `icons-${letter}@example.test`,
});
const session = (letter) => ({
  access_token: `icons-${letter}`,
  refresh_token: `refresh-${letter}`,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: user(letter),
});
const records = new Map(
  ["a", "b"].map((letter) => [
    letter,
    new Map([
      [
        "settings/displayName",
        {
          key: "settings/displayName",
          value: letter === "a" ? "Alix" : "Brice",
          revision: 1,
        },
      ],
      [
        "settings/profileCompleted",
        { key: "settings/profileCompleted", value: true, revision: 1 },
      ],
      [
        "settings/haloColor",
        {
          key: "settings/haloColor",
          value: letter === "a" ? "#dc92b7" : "#80b4e7",
          revision: 1,
        },
      ],
      [
        "settings/theme",
        { key: "settings/theme", value: "light", revision: 1 },
      ],
    ]),
  ]),
);
async function prefixRoutes(context) {
  // Exercise a project-site URL locally without adding a production server.
  await context.route(base + "**", async (route) => {
    const response = await route.fetch({
      url: route
        .request()
        .url()
        .replace(base, origin + "/"),
    });
    await route.fulfill({ response });
  });
}
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await prefixRoutes(context);
  await context.addInitScript((initial) => {
    if (!localStorage.getItem("icons-test-initialized")) {
      localStorage.setItem(
        "sb-rlatjredsjvgjsbrqmtm-auth-token",
        JSON.stringify(initial),
      );
      localStorage.setItem("icons-test-initialized", "true");
    }
  }, session("a"));
  await context.route("https://*.supabase.co/**", async (route) => {
    const request = route.request(),
      url = request.url();
    if (url.includes("/auth/v1/token")) {
      const letter =
        request.postDataJSON().email === "icons-b@example.test" ? "b" : "a";
      return route.fulfill({ json: session(letter) });
    }
    const letter = request.headers().authorization?.includes("icons-b")
      ? "b"
      : "a";
    const store = records.get(letter);
    if (url.includes("/logger_documents"))
      return route.fulfill({ json: [...store.values()] });
    if (url.includes("/rpc/logger_put")) {
      const { p_key, p_value } = request.postDataJSON();
      const revision = (store.get(p_key)?.revision ?? 0) + 1;
      store.set(p_key, { key: p_key, value: p_value, revision });
      return route.fulfill({ json: { accepted: true, revision } });
    }
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const icons = async (color) => {
    for (const [rel, file] of [
      ["icon", "icon-32.png"],
      ["apple-touch-icon", "icon-180.png"],
      ["manifest", "manifest.webmanifest"],
    ]) {
      const link = page.locator(`head link[rel="${rel}"]`);
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute("data-accent", color);
      assert.equal(
        await link.evaluate((element) => element.href),
        base + `assets/app-icons/v1/${color.slice(1)}/${file}`,
      );
    }
  };
  const open = async (name) => {
    await page
      .getByRole("button", { name: `${name} · Compte`, exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Apparence", exact: true })
      .click();
  };
  await page.goto(base);
  await expect(
    page.getByRole("button", { name: "Alix · Compte", exact: true }),
  ).toBeVisible();
  await icons("#dc92b7");
  await open("Alix");
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Couleurs proposées" }).getByRole("button"),
  ).toHaveCount(5);
  for (const variant of catalog) {
    await page.getByRole("button", { name: variant.name, exact: true }).click();
    await icons(variant.accent);
    const manifest = await page.evaluate(async () => {
      const url = document.querySelector('link[rel="manifest"]').href;
      const response = await fetch(url);
      return { url, status: response.status, data: await response.json() };
    });
    assert.equal(manifest.status, 200);
    for (const key of ["id", "scope", "start_url"])
      assert.equal(new URL(manifest.data[key], manifest.url).href, base);
    const images = await page.evaluate(async (directory) => {
      return Promise.all(
        [32, 180, 192, 512].map(async (size) => {
          const image = new Image();
          image.src = new URL(`icon-${size}.png`, directory).href;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = size;
          const c = canvas.getContext("2d");
          c.drawImage(image, 0, 0);
          return {
            size,
            width: image.naturalWidth,
            height: image.naturalHeight,
            background: [...c.getImageData(0, 0, 1, 1).data],
            accent: [
              ...c.getImageData(
                Math.floor(size / 2),
                Math.floor((size * 74) / 192),
                1,
                1,
              ).data,
            ],
          };
        }),
      );
    }, base + variant.directory);
    const rgb = [1, 3, 5].map((i) =>
      parseInt(variant.accent.slice(i, i + 2), 16),
    );
    for (const image of images) {
      assert.equal(image.width, image.size);
      assert.equal(image.height, image.size);
      assert.deepEqual(image.background, [23, 24, 30, 255]);
      if (image.size >= 180) assert.deepEqual(image.accent, [...rgb, 255]);
    }
    for (const icon of manifest.data.icons) {
      assert.ok(
        new URL(icon.src, manifest.url).href.startsWith(
          base + variant.directory,
        ),
      );
    }
  }
  await page.getByLabel("Mode d’affichage").selectOption("dark");
  await icons("#dc92b7");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await icons("#dc92b7");
  await open("Alix");
  await page.getByRole("button", { name: "Pêche", exact: true }).click();
  await icons("#e7a580");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await icons("#dc92b7");
  await open("Alix");
  await page.getByRole("button", { name: "Sauge", exact: true }).click();
  await page
    .getByRole("button", { name: "Enregistrer l’apparence", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await icons("#98bd93");
  await open("Alix");
  const install = page.getByRole("link", {
    name: "Préparer l’icône pour un nouvel ajout sur iPhone",
  });
  await expect(install).toHaveAttribute(
    "href",
    base + "install/98bd93/index.html",
  );
  await install.click();
  await icons("#98bd93");
  await expect(page.locator(".liquid-nav button")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Alix · Compte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mode local · Se connecter" }),
  ).toBeVisible();
  await icons("#a89ae5");
  await page.getByRole("button", { name: "Mode local · Se connecter" }).click();
  await page.getByLabel("Adresse e-mail").fill("icons-b@example.test");
  await page.getByLabel("Mot de passe", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Brice · Compte", exact: true }),
  ).toBeVisible();
  await icons("#80b4e7");
  await page.reload();
  await icons("#80b4e7");
  assert.deepEqual(errors, []);
  await context.close();

  // Static installation metadata must be correct with JavaScript disabled.
  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  await prefixRoutes(staticContext);
  const staticPage = await staticContext.newPage();
  for (const variant of catalog) {
    await staticPage.goto(
      base + `install/${variant.accent.slice(1)}/index.html`,
    );
    assert.equal(
      await staticPage
        .locator('link[rel="apple-touch-icon"]')
        .getAttribute("href"),
      "./" + variant.directory + "icon-180.png",
    );
    assert.equal(
      await staticPage.locator('link[rel="manifest"]').getAttribute("href"),
      "./" + variant.directory + "manifest.webmanifest",
    );
    assert.equal(
      await staticPage.locator("base").getAttribute("href"),
      "../../",
    );
  }
  await staticContext.close();
  console.log(
    "Icônes : cinq PNG, fond sombre, palette limitée, aperçu/annulation, persistance, comptes, déconnexion et pages iOS sans JS sous /kalo-compagnon/ OK.",
  );
} finally {
  await browser.close();
}
