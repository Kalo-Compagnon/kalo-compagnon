import { useEffect, useState } from "react";
import { type Settings } from "./domain";
import { Button, Sheet, useApp } from "./ui";
import { accentPalette } from "./accent";

import {
  accentPresets,
  defaultHaloColor,
  isPresetAccent,
} from "./appearance-presets";
import { installationPage, updateApplicationIcons } from "./app-icons";
export { defaultHaloColor } from "./appearance-presets";

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
    const preview = () => {
      applyAppearance({ theme, haloColor: color });
      updateApplicationIcons(repo.scope !== "guest" ? color : defaultHaloColor);
    };
    preview();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", preview);
    return () => {
      media.removeEventListener("change", preview);
      applyAppearance(repo.state.settings);
      updateApplicationIcons(
        repo.scope !== "guest"
          ? repo.state.settings.haloColor
          : defaultHaloColor,
      );
    };
  }, [theme, color, repo]);
  return (
    <Sheet title="Apparence" subtitle="Un espace à ta couleur.">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (!isPresetAccent(color))
              throw new Error(
                "Choisis une couleur proposée pour enregistrer ton apparence.",
              );
            await update((s) => {
              s.settings.theme = theme;
              s.settings.haloColor = color;
            });
            close();
            notify("Apparence enregistrée");
          } catch (error) {
            notify((error as Error).message);
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
        <p className="label">Couleur d’accent</p>
        <div
          className="halo-presets"
          role="group"
          aria-label="Couleurs proposées"
        >
          {accentPresets.map(([name, value]) => (
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
        {!isPresetAccent(color) && (
          <p className="note">
            Ta couleur actuelle est personnalisée. Choisis une des cinq couleurs
            proposées pour l’apparence et l’icône.
          </p>
        )}
        <p className="note">
          Une seule couleur pour toute l’app : halo, boutons, navigation et
          graphiques de poids. Les apports restent rouges et les dépenses
          vertes. Aperçu en direct, en mode clair comme sombre. Ce réglage est
          personnel à ton compte.
        </p>
        <p className="note">
          Sur iPhone, changer de couleur peut nécessiter de supprimer puis de
          réajouter Kalo à l’écran d’accueil.
        </p>
        {repo.scope !== "guest" && (
          <p className="note">
            <a
              className="text-button"
              href={installationPage(state.settings.haloColor)}
            >
              Préparer l’icône pour un nouvel ajout sur iPhone
            </a>
          </p>
        )}
        <Button primary type="submit" disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer l’apparence"}
        </Button>
        <Button onClick={close}>Annuler</Button>
      </form>
    </Sheet>
  );
}
