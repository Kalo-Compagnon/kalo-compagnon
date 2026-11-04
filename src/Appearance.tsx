import { useEffect, useState } from "react";
import { type Settings } from "./domain";
import { Button, Field, Sheet, useApp } from "./ui";
import { accentPalette } from "./accent";

export const defaultHaloColor = "#a89ae5";

export function applyAppearance(
  settings: Pick<Settings, "theme" | "haloColor">,
) {
  const dark =
    settings.theme === "dark" ||
    (settings.theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.setProperty(
    "--halo-color",
    settings.haloColor ?? defaultHaloColor,
  );
  for (const [name, value] of Object.entries(
    accentPalette(settings.haloColor ?? defaultHaloColor, dark),
  )) {
    document.documentElement.style.setProperty(name, value);
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#17181e" : "#f6f5f0");
  window.dispatchEvent(new Event("kalo-appearance-change"));
}

export function Appearance() {
  const { repo, state, update, close, notify } = useApp();
  const [theme, setTheme] = useState<NonNullable<Settings["theme"]>>(
    state.settings.theme ?? "light",
  );
  const [color, setColor] = useState(
    state.settings.haloColor ?? defaultHaloColor,
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const preview = () => applyAppearance({ theme, haloColor: color });
    preview();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", preview);
    return () => {
      media.removeEventListener("change", preview);
      applyAppearance(repo.state.settings);
    };
  }, [theme, color, repo]);
  return (
    <Sheet title="Apparence" subtitle="Un espace à ta couleur.">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await update((s) => {
              s.settings.theme = theme;
              s.settings.haloColor = color;
            });
            close();
            notify("Apparence enregistrée");
          } catch {
            /* update already reports persistence errors. */
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Mode d’affichage
          <select
            value={theme}
            onChange={(e) =>
              setTheme(e.target.value as NonNullable<Settings["theme"]>)
            }
          >
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
            <option value="system">Suivre l’appareil</option>
          </select>
        </label>
        <div className="halo-picker">
          <Field
            label="Couleur d’accent"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <span className="halo-color-value">{color.toUpperCase()}</span>
        </div>
        <div
          className="halo-presets"
          role="group"
          aria-label="Couleurs proposées"
        >
          {[
            ["Lavande", defaultHaloColor],
            ["Pêche", "#e7a580"],
            ["Sauge", "#98bd93"],
            ["Bleu", "#80b4e7"],
            ["Rose", "#dc92b7"],
          ].map(([name, value]) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              aria-pressed={color.toLowerCase() === value}
              style={{ "--swatch": value } as React.CSSProperties}
              onClick={() => setColor(value)}
            >
              <span />
              {name}
            </button>
          ))}
        </div>
        <p className="note">
          Une seule couleur pour toute l’app : halo, boutons, navigation et
          graphiques de poids. Les apports restent rouges et les dépenses
          vertes. Aperçu en direct, en mode clair comme sombre. Ce réglage est
          personnel à ton compte.
        </p>
        <Button primary type="submit" disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer l’apparence"}
        </Button>
        <Button onClick={close}>Annuler</Button>
      </form>
    </Sheet>
  );
}
