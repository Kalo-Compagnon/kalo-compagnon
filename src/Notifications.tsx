import { useEffect, useState } from "react";
import {
  Bell,
  Scale,
  Footprints,
  Utensils,
  Camera,
  Clock3,
  Check,
  Smartphone,
} from "lucide-react";
import { Sheet, Button, useApp } from "./ui";
import {
  activateIphoneNotifications,
  detachDevicePush,
  getNotificationStatus,
  iphonePushSupport,
  notificationApi,
  installationId,
  saveNotificationPreferences,
} from "./notifications-client";
import {
  defaultNotificationPreferences,
  mealSlots,
  mealLabels,
  localClock,
  stopMinute,
  isMissing,
  kindLabel,
  type NotificationPreferences,
  type MissingKind,
  type Snooze,
} from "../supabase/functions/_shared/notification-rules";
import "./notifications.css";

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="notification-switch">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span aria-hidden="true" />
    </label>
  );
}
export function Notifications({
  onBack,
  initialReminder,
}: {
  onBack: () => void;
  initialReminder?: string;
}) {
  const { repo, state, update, notify } = useApp();
  const scope = repo.scope;
  const [settings, setSettings] = useState(defaultNotificationPreferences);
  const [saved, setSaved] = useState(defaultNotificationPreferences);
  const [snoozes, setSnoozes] = useState<Snooze[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deviceActive, setDeviceActive] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const connected = repo.scope !== "guest",
    support = iphonePushSupport();
  const refresh = async () => {
    const status = await getNotificationStatus(repo.scope);
    setSettings(status.settings);
    setSaved(status.settings);
    setSnoozes(status.snoozes);
    setDeviceActive(status.deviceActive);
  };
  useEffect(() => {
    let active = true;
    if (!connected) {
      setLoading(false);
      return;
    }
    getNotificationStatus(repo.scope)
      .then((status) => {
        if (!active) return;
        setSettings(status.settings);
        setSaved(status.settings);
        setSnoozes(status.snoozes);
        setDeviceActive(status.deviceActive);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const timer = setInterval(() => setClock(new Date()), 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [repo.scope, connected]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const day = localClock(clock, saved.timezone).day;
  const snapshot = { day: state.days[day] ?? {}, entries: state.entries };
  const missingKinds: MissingKind[] = [
    ...(saved.weight.enabled ? ["weight" as const] : []),
    ...(saved.steps.enabled ? ["steps" as const] : []),
    ...(saved.mealsMissing
      ? mealSlots
          .filter((slot) => saved.meals[slot].expected)
          .map((slot) => `meal:${slot}` as MissingKind)
      : []),
  ];
  const missing = missingKinds.filter((kind) =>
    isMissing(kind, saved, snapshot, day),
  );
  return (
    <Sheet
      title="Notifications"
      subtitle="Tes rappels, à ton rythme."
      back={onBack}
    >
      <div className="notification-settings">
        {!connected ? (
          <p className="notification-info">
            Connecte-toi pour enregistrer tes rappels et les recevoir sur ton
            iPhone.
          </p>
        ) : loading ? (
          <p role="status">Chargement de tes rappels…</p>
        ) : (
          <>
            <section className="notification-device">
              <span className="notification-icon">
                <Smartphone size={22} />
              </span>
              <div>
                <strong>
                  {deviceActive && support.permission === "granted"
                    ? "Cet iPhone est activé"
                    : "Recevoir sur cet iPhone"}
                </strong>
                <p>
                  {!support.ios || !support.installed
                    ? "Sur iPhone : Safari → Partager → Sur l’écran d’accueil. Ouvre ensuite Kalo depuis son icône pour autoriser les notifications."
                    : support.permission === "denied"
                      ? "Autorise Kalo dans Réglages → Notifications sur ton iPhone."
                      : "Les rappels arrivent aussi quand Kalo est fermé."}
                </p>
              </div>
              {support.ios && support.installed && support.supported && (
                <Button
                  className="notification-device-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const status = await activateIphoneNotifications(
                        settings,
                        scope,
                      );
                      setSettings(status.settings);
                      setSaved(status.settings);
                      setDeviceActive(status.deviceActive);
                      notify("Notifications activées sur cet iPhone");
                    })
                  }
                >
                  {deviceActive ? "Réactiver" : "Autoriser sur cet iPhone"}
                </Button>
              )}
              {deviceActive && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await notificationApi(
                        "test",
                        { installation: installationId() },
                        scope,
                      );
                      notify("Notification de test envoyée");
                    })
                  }
                >
                  Envoyer un test
                </Button>
              )}
            </section>
            {saved.enabled && missingKinds.length > 0 && (
              <details
                className="notification-today"
                open={initialReminder ? true : undefined}
              >
                <summary>
                  <Bell size={17} />
                  Aujourd’hui{" "}
                  <span>
                    {missing.length
                      ? `${missing.length} à compléter`
                      : "Tout est complété"}
                  </span>
                </summary>
                <p className="notification-help">
                  « Plus tard » lance une relance toutes les 45 min, jusqu’à la
                  saisie ou à l’heure d’arrêt.
                </p>
                {missing.length === 0 ? (
                  <p className="notification-done">
                    <Check size={17} />
                    Ton journal est à jour.
                  </p>
                ) : (
                  missing.map((kind) => {
                    const snooze = snoozes.find(
                      (s) => s.day === day && s.kind === kind,
                    );
                    const next = snooze
                      ? new Date(
                          new Date(snooze.started_at).getTime() +
                            (Math.floor(
                              Math.max(
                                0,
                                clock.getTime() -
                                  new Date(snooze.started_at).getTime(),
                              ) /
                                (45 * 60_000),
                            ) +
                              1) *
                              45 *
                              60_000,
                        )
                      : null;
                    return (
                      <div className="notification-pending" key={kind}>
                        <strong>{kindLabel(kind)}</strong>
                        {next && (
                          <small>
                            {localClock(next, saved.timezone).day === day &&
                            localClock(next, saved.timezone).minute <
                              stopMinute(saved)
                              ? `Relance vers ${next.toLocaleTimeString(
                                  "fr-FR",
                                  {
                                    timeZone: saved.timezone,
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}`
                              : "Plus de relance aujourd’hui."}
                          </small>
                        )}
                        <div>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              window.dispatchEvent(
                                new CustomEvent("kalo:complete-reminder", {
                                  detail: { kind, day },
                                }),
                              )
                            }
                          >
                            Compléter
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await repo.sync();
                                const response = await notificationApi<{
                                  completed?: boolean;
                                  nextAt?: string;
                                  stoppedToday?: boolean;
                                }>("later", { kind, day }, scope);
                                setSnoozes(
                                  (await getNotificationStatus(repo.scope))
                                    .snoozes,
                                );
                                notify(
                                  response.completed
                                    ? "Cette saisie est déjà complète"
                                    : response.stoppedToday
                                      ? "C’est noté. Aucun autre rappel après l’heure d’arrêt."
                                      : "D’accord, rappel dans 45 minutes",
                                );
                              })
                            }
                          >
                            Plus tard · 45 min
                          </Button>
                        </div>
                        {kind.startsWith("meal:") && (
                          <button
                            className="notification-skip"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const slot = kind.slice(
                                  5,
                                ) as (typeof mealSlots)[number];
                                await update((s) => {
                                  s.days[day] ??= {};
                                  s.days[day].notificationMeals ??= {};
                                  s.days[day].notificationMeals![slot] =
                                    "skipped";
                                });
                                await repo.sync();
                                notify(
                                  "Repas indiqué comme sauté pour aujourd’hui",
                                );
                              })
                            }
                          >
                            Je saute ce repas aujourd’hui
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
                {mealSlots
                  .filter(
                    (slot) =>
                      snapshot.day.notificationMeals?.[slot] === "skipped",
                  )
                  .map((slot) => (
                    <div
                      className="notification-pending"
                      key={`skipped:${slot}`}
                    >
                      <strong>{mealLabels[slot]} sauté aujourd’hui</strong>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await update((s) => {
                              delete s.days[day]?.notificationMeals?.[slot];
                            });
                            await repo.sync();
                            notify("Repas rétabli pour aujourd’hui");
                          })
                        }
                      >
                        Rétablir ce repas
                      </Button>
                    </div>
                  ))}
              </details>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const result = await saveNotificationPreferences(
                    settings,
                    scope,
                  );
                  if (!result.settings.enabled) {
                    await detachDevicePush();
                    setDeviceActive(false);
                  }
                  setSettings(result.settings);
                  setSaved(result.settings);
                  notify("Rappels enregistrés");
                });
              }}
            >
              <div className="notification-master">
                <div>
                  <strong>Activer mes rappels</strong>
                  <small>Ces réglages appartiennent à ton compte.</small>
                </div>
                <Toggle
                  label="Activer mes rappels"
                  checked={settings.enabled}
                  onChange={(enabled) =>
                    setSettings((p) => ({ ...p, enabled }))
                  }
                />
              </div>
              <section className="notification-group">
                <h3>
                  <Bell size={19} />
                  Si une saisie manque
                </h3>
                <p className="notification-help">
                  Un premier rappel à l’heure prévue. Les relances démarrent
                  seulement après ton choix « Plus tard » dans Kalo.
                </p>
                {(
                  [
                    ["weight", "Pesée", Scale],
                    ["steps", "Pas de la journée", Footprints],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <div className="notification-rule" key={key}>
                    <Icon size={20} />
                    <strong>{label}</strong>
                    <Toggle
                      label={`Rappel ${label}`}
                      checked={settings[key].enabled}
                      onChange={(enabled) =>
                        setSettings((p) => ({
                          ...p,
                          [key]: { ...p[key], enabled },
                        }))
                      }
                    />
                    <label className="notification-time">
                      Heure
                      <input
                        type="time"
                        aria-label={`Heure du rappel ${label}`}
                        required
                        value={settings[key].time}
                        onChange={(e) =>
                          setSettings((p) => ({
                            ...p,
                            [key]: { ...p[key], time: e.target.value },
                          }))
                        }
                      />
                    </label>
                  </div>
                ))}
                <div className="notification-rule">
                  <Utensils size={20} />
                  <strong>Repas non renseignés</strong>
                  <Toggle
                    label="Rappels repas non renseignés"
                    checked={settings.mealsMissing}
                    onChange={(mealsMissing) =>
                      setSettings((p) => ({ ...p, mealsMissing }))
                    }
                  />
                  <label className="notification-wide-label">
                    Après chaque repas prévu
                    <select
                      aria-label="Délai après un repas non renseigné"
                      value={settings.missingAfterMinutes}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          missingAfterMinutes: Number(e.target.value),
                        }))
                      }
                    >
                      {[15, 30, 45, 60, 90, 120].map((n) => (
                        <option key={n} value={n}>
                          {n} minutes après
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
              <section className="notification-group">
                <h3>
                  <Camera size={19} />
                  Avant de passer à table
                </h3>
                <p className="notification-help">
                  Un rappel pour photographier ou peser ton repas, même si tu
                  l’as déjà renseigné.
                </p>
                <label className="notification-wide-label">
                  Me prévenir
                  <select
                    aria-label="Délai avant les repas"
                    value={settings.beforeMinutes}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        beforeMinutes: Number(e.target.value),
                      }))
                    }
                  >
                    {[5, 10, 15, 20, 30, 45, 60].map((n) => (
                      <option key={n} value={n}>
                        {n} minutes avant
                      </option>
                    ))}
                  </select>
                </label>
                <div className="notification-meal-head">
                  <span>Repas et horaire</span>
                  <span>Avant</span>
                  <span>À saisir</span>
                </div>
                {mealSlots.map((slot) => (
                  <div className="notification-meal" key={slot}>
                    <label>
                      <strong>{mealLabels[slot]}</strong>
                      <input
                        type="time"
                        required
                        aria-label={`Heure ${mealLabels[slot]}`}
                        value={settings.meals[slot].time}
                        onChange={(e) =>
                          setSettings((p) => ({
                            ...p,
                            meals: {
                              ...p.meals,
                              [slot]: {
                                ...p.meals[slot],
                                time: e.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                    <Toggle
                      label={`Rappel avant ${mealLabels[slot]}`}
                      checked={settings.meals[slot].before}
                      onChange={(before) =>
                        setSettings((p) => ({
                          ...p,
                          meals: {
                            ...p.meals,
                            [slot]: { ...p.meals[slot], before },
                          },
                        }))
                      }
                    />
                    <Toggle
                      label={`${mealLabels[slot]} prévu à saisir`}
                      checked={settings.meals[slot].expected}
                      onChange={(expected) =>
                        setSettings((p) => ({
                          ...p,
                          meals: {
                            ...p.meals,
                            [slot]: { ...p.meals[slot], expected },
                          },
                        }))
                      }
                    />
                  </div>
                ))}
                <p className="notification-help">
                  « À saisir » indique les repas que tu prends habituellement.
                  Les entrées avec calories sont rattachées à l’horaire de repas
                  le plus proche. Un repas sauté peut être signalé dans «
                  Aujourd’hui ».
                </p>
              </section>
              <section className="notification-group notification-finish">
                <h3>
                  <Clock3 size={19} />
                  Fin des rappels
                </h3>
                <label className="notification-wide-label">
                  Ne plus me rappeler après
                  <input
                    type="time"
                    required
                    aria-label="Heure d’arrêt des rappels"
                    value={settings.stopAt}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, stopAt: e.target.value }))
                    }
                  />
                </label>
                <p className="notification-help">
                  Horaires :{" "}
                  {settings.timezone === "Europe/Paris"
                    ? "heure de Paris, été et hiver"
                    : settings.timezone}
                  . Les rappels concernent uniquement la journée en cours.
                </p>
              </section>
              <p className="notification-help">
                L’arrêt des rappels suit les données synchronisées. Une saisie
                faite hors ligne sera prise en compte dès la reconnexion.
              </p>
              <div className="notification-save">
                <Button primary type="submit" disabled={busy}>
                  {busy ? "Enregistrement…" : "Enregistrer les rappels"}
                </Button>
              </div>
            </form>
          </>
        )}
        {error && (
          <p className="notification-error" role="alert">
            {error}
          </p>
        )}
        {!loading && connected && error && (
          <Button disabled={busy} onClick={() => void run(refresh)}>
            Réessayer
          </Button>
        )}
      </div>
    </Sheet>
  );
}
