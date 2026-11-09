import { useEffect, useState, type CSSProperties } from "react";
import { Field } from "./ui";
import { steps, fmt, dayKey, type State } from "./domain";
import type { Sharing } from "./duo-model";
import { defaultHaloColor } from "./Appearance";
import { accentPalette } from "./accent";
import { Global } from "./Global";
import { CalorieChart } from "./Charts";

export interface DuoProfile {
  name: string;
  accent?: string | null;
  state: State;
  permissions: Sharing;
}
const color = (profile: DuoProfile) =>
  profile.accent && /^#[\da-f]{6}$/i.test(profile.accent)
    ? profile.accent
    : defaultHaloColor;

export function DuoComparison({
  profiles,
  initialDay = dayKey(),
}: {
  profiles: [DuoProfile, DuoProfile];
  initialDay?: string;
}) {
  const [date, setDate] = useState(initialDay);
  const [dark, setDark] = useState(
    document.documentElement.dataset.theme === "dark",
  );
  useEffect(() => {
    const refresh = () =>
      setDark(document.documentElement.dataset.theme === "dark");
    window.addEventListener("kalo-appearance-change", refresh);
    return () => window.removeEventListener("kalo-appearance-change", refresh);
  }, []);
  return (
    <div className="duo-dashboard">
      <section className="card duo-overview-controls">
        <div className="duo-identities">
          {profiles.map((profile, index) => (
            <span key={index} className="duo-identity">
              <span
                className="duo-identity-dot"
                style={{ background: color(profile) }}
              />
              {profile.name}
            </span>
          ))}
        </div>
        <div className="duo-date-control">
          <Field
            label="Journée du Duo"
            type="date"
            value={date}
            max={initialDay}
            onChange={(event) => {
              if (event.target.value) setDate(event.target.value);
            }}
          />
        </div>
      </section>
      <div className="duo-columns duo-home-overviews">
        {profiles.map((profile, index) => (
          <section
            key={index}
            className="duo-home-profile"
            aria-label={`Accueil de ${profile.name}`}
            style={accentPalette(color(profile), dark) as CSSProperties}
          >
            <h2>{profile.name}</h2>
            <Global
              readOnly
              showChart={false}
              view={{
                state: profile.state,
                day: date,
                permissions: profile.permissions,
              }}
            />
          </section>
        ))}
      </div>
      <div className="duo-columns duo-steps-cards">
        {profiles.map((profile, index) => {
          const day = profile.state.days[date];
          const available = day && ("steps" in day || "fitSteps" in day);
          return (
            <section
              key={index}
              className="card padded"
              aria-label={profile.name + " · Activité physique"}
              style={accentPalette(color(profile), dark) as CSSProperties}
            >
              <h2>Pas</h2>
              <p className="note">{profile.name}</p>
              {!profile.permissions.activity ? (
                <p>Catégorie non autorisée.</p>
              ) : available ? (
                <p className="value">
                  <strong>{fmt(steps(day))}</strong>
                </p>
              ) : (
                <p>Aucun pas disponible pour cette journée.</p>
              )}
            </section>
          );
        })}
      </div>
      <section className="card padded" aria-label="Apport et dépense du Duo">
        <h2>Apport et dépense</h2>
        <div className="duo-columns">
          {profiles.map((profile, index) => (
            <div
              key={index}
              style={accentPalette(color(profile), dark) as CSSProperties}
            >
              <strong>{profile.name}</strong>
            </div>
          ))}
        </div>
        <CalorieChart
          state={profiles[0].state}
          through={date}
          comparison={profiles.map((profile) => ({
            state: profile.state,
            name: profile.name,
            accent: color(profile),
            intake: accentPalette(color(profile), dark)["--duo-chart-intake"],
            hatch: accentPalette(color(profile), dark)["--duo-chart-hatch"],
            allowed:
              profile.permissions.food &&
              profile.permissions.activity &&
              profile.permissions.goals,
          }))}
        />
        {profiles.some(
          (profile) =>
            !profile.permissions.food ||
            !profile.permissions.activity ||
            !profile.permissions.goals,
        ) && (
          <p className="note">
            Les barres nécessitent le partage de l’alimentation, de l’activité
            et des objectifs de chaque profil.
          </p>
        )}
      </section>
    </div>
  );
}
