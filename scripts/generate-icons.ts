import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { accentPresets, defaultHaloColor } from "../src/appearance-presets";
import {
  iconBackground,
  iconDirectory,
  iconManifest,
  iconSizes,
  iconSvg,
} from "../src/app-icon-model";

const source = await readFile("public/assets/icon.svg", "utf8");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN,
});
try {
  const page = await browser.newPage();
  for (const [, color] of accentPresets) {
    const directory = `public/${iconDirectory(color)}`;
    await mkdir(directory, { recursive: true });
    const svg = iconSvg(source, color);
    await writeFile(`${directory}logo.svg`, svg);
    for (const size of iconSizes) {
      const png = await page.evaluate(
        async ({ svg, size, background }) => {
          const blob = new Blob([svg], { type: "image/svg+xml" }),
            url = URL.createObjectURL(blob);
          try {
            const image = new Image();
            image.src = url;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = size;
            const context = canvas.getContext("2d")!;
            context.fillStyle = background;
            context.fillRect(0, 0, size, size);
            context.drawImage(image, 0, 0, size, size);
            return canvas.toDataURL("image/png").split(",")[1];
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { svg, size, background: iconBackground },
      );
      await writeFile(
        `${directory}icon-${size}.png`,
        Buffer.from(png, "base64"),
      );
    }
    await writeFile(
      `${directory}manifest.webmanifest`,
      JSON.stringify(iconManifest("../../../../", "./"), null, 2) + "\n",
    );
  }
} finally {
  await browser.close();
}
await writeFile(
  "public/manifest.webmanifest",
  JSON.stringify(iconManifest("./", iconDirectory(defaultHaloColor)), null, 2) +
    "\n",
);
await copyFile(
  `public/${iconDirectory(defaultHaloColor)}icon-180.png`,
  "public/apple-touch-icon.png",
);
await writeFile(
  "public/assets/app-icons/v1/catalog.json",
  JSON.stringify(
    accentPresets.map(([name, accent]) => ({
      name,
      accent,
      directory: iconDirectory(accent),
    })),
    null,
    2,
  ) + "\n",
);
console.log("Icônes PNG générées depuis le logo source pour les cinq accents.");
