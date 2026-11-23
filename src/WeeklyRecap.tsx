import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarRange,
  Sparkles,
  Footprints,
  Scale,
  RefreshCw,
} from "lucide-react";
import { Button, Sheet, useApp } from "./ui";
import { notificationApi } from "./notifications-client";
import {
  latestRecapWeek,
  shiftWeekDay,
  type WeeklyMetrics,
} from "../supabase/functions/_shared/weekly-metrics";
import type { WeeklyReport } from "../supabase/functions/_shared/weekly-service";
import "./weekly-recap.css";

interface WeeklyList {
  enabled: boolean;
  latestWeek: string;
  reports: Pick<WeeklyReport, "week_start" | "status" | "generated_at">[];
}
export function recapPeriod(start: string) {
  const format = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Europe/Paris",
    });
  return `${format(start)} – ${format(shiftWeekDay(start, 6))}`;
}
export function WeeklyRecapCard({
  onOpen,
}: {
  onOpen: (week?: string) => void;
}) {
  const { repo } = useApp(),
    scope = repo.scope;
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void notificationApi<WeeklyList>("weekly-list", {}, scope)
      .then((result) => {
        if (active)
          setLatest(
            result.reports?.find((r) => r.status === "ready")?.week_start ??
              null,
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [scope]);
  return (
    <section className="account-recap-section" aria-label="Récap de la semaine">
      <div className="account-section-heading">
        <CalendarRange size={19} />
        <h3>Récap de la semaine</h3>
        <span className="recap-ai-badge">Gemini</span>
      </div>
      <p>
        {latest
          ? recapPeriod(latest)
          : "Chaque dimanche à 21 h, un bilan de tes sept derniers jours."}
      </p>
      <button
        className="account-recap-open"
        onClick={() => onOpen(latest ?? undefined)}
      >
        <BookOpen size={18} />
        <span>{latest ? "Lire mon dernier récap" : "Ouvrir mes récaps"}</span>
      </button>
      <small>
        Calories, protéines, glucides, lipides, activité et évolution.
      </small>
    </section>
  );
}
const display = (value: number | null, digits = 0) =>
  value === null
    ? "—"
    : value.toLocaleString("fr-FR", { maximumFractionDigits: digits });
const signed = (value: number | null, digits = 0) =>
  value === null
    ? "Comparaison indisponible"
    : `${value > 0 ? "+" : ""}${display(value, digits)}`;
function WeeklyNumbers({ metrics: m }: { metrics: WeeklyMetrics }) {
  const week = m.week,
    max = Math.max(1, ...week.daily.map((d) => d.calories ?? 0));
  return (
    <>
      <section className="recap-section">
        <h3>Calories au quotidien</h3>
        <div className="recap-stats">
          <div>
            <small>Consommées</small>
            <strong>
              {display(week.calories.intake)}
              <span> kcal</span>
            </strong>
            <small>{week.calories.intakeDays}/7 jours renseignés</small>
          </div>
          <div>
            <small>Dépensées · estimation</small>
            <strong>
              {display(week.calories.spent)}
              <span> kcal</span>
            </strong>
            <small>{week.calories.spentDays}/7 jours exploitables</small>
          </div>
          <div>
            <small>
              {(week.calories.deficit ?? 0) >= 0
                ? "Déficit estimé"
                : "Surplus estimé"}
            </small>
            <strong>
              {display(
                week.calories.deficit === null
                  ? null
                  : Math.abs(week.calories.deficit),
              )}
              <span> kcal</span>
            </strong>
            <small>{week.calories.balanceDays}/7 jours comparables</small>
          </div>
        </div>
        <div
          className="recap-chart"
          role="img"
          aria-label={`Calories enregistrées par jour : ${week.daily.map((d) => `${d.date} : ${d.calories === null ? "non renseigné" : Math.round(d.calories) + " kcal"}`).join(" ; ")}`}
        >
          {week.daily.map((d) => (
            <div key={d.date} className="recap-chart-day">
              <small>{display(d.calories)}</small>
              <span className="recap-chart-track">
                <span
                  style={{
                    height:
                      d.calories === null
                        ? "0%"
                        : `${Math.max(2, (d.calories / max) * 100)}%`,
                  }}
                />
              </span>
              <small>
                {new Date(`${d.date}T12:00:00Z`).toLocaleDateString("fr-FR", {
                  weekday: "short",
                  timeZone: "Europe/Paris",
                })}
              </small>
            </div>
          ))}
        </div>
        <p className="recap-note">
          Moyennes des journées renseignées. Les journées absentes ou avec
          calories manquantes sont exclues.
        </p>
        {m.goalDeficit !== null && (
          <p className="recap-note">
            Objectif de déficit enregistré : {display(m.goalDeficit)} kcal/j.
          </p>
        )}
      </section>
      <section className="recap-section">
        <h3>Protéines, glucides et lipides</h3>
        <div className="recap-nutrients">
          {(
            [
              ["protein", "Protéines"],
              ["carbs", "Glucides"],
              ["fat", "Lipides"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <span>{label}</span>
              <strong>{display(week.nutrients[key].average, 1)} g/j</strong>
              <small>{week.nutrients[key].days}/7 jours connus</small>
            </div>
          ))}
        </div>
        <p className="recap-note">
          Un apport non renseigné reste inconnu. Il n’est pas remplacé par zéro.
        </p>
      </section>
      <section className="recap-section">
        <h3>Activité et évolution</h3>
        <div className="recap-evolution">
          <div>
            <Footprints size={21} />
            <span>Pas par jour</span>
            <strong>{display(week.activity.steps)}</strong>
            <small>
              {week.activity.days}/7 jours · {signed(m.changes.steps)} vs
              semaine précédente
            </small>
          </div>
          <div>
            <Scale size={21} />
            <span>Poids moyen</span>
            <strong>{display(week.weight.average, 1)} kg</strong>
            <small>
              {week.weight.days} pesée{week.weight.days > 1 ? "s" : ""} ·{" "}
              {m.changes.weight === null
                ? "Pas assez de pesées pour comparer"
                : `${signed(m.changes.weight, 2)} kg vs semaine précédente`}
            </small>
          </div>
        </div>
        <p className="recap-note">
          {week.activity.activeDays} jour
          {week.activity.activeDays > 1 ? "s" : ""} avec activité sportive ou
          kcal manuelles renseignées. Les pas incluent les 300 pas de base
          utilisés dans Kalo.
        </p>
        {Object.keys(week.measurements).length > 0 && (
          <details>
            <summary>Mensurations enregistrées</summary>
            <dl className="recap-measurements">
              {Object.entries(week.measurements).map(([zone, value]) => (
                <div key={zone}>
                  <dt>{zone}</dt>
                  <dd>
                    {display(value, 1)} cm
                    {m.previous.measurements[zone] !== undefined
                      ? ` (${signed(value - m.previous.measurements[zone], 1)} cm)`
                      : ""}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </section>
      <details className="recap-quality">
        <summary>Sur quelles données repose ce bilan ?</summary>
        <p>
          {week.entries} entrée{week.entries > 1 ? "s" : ""} alimentaire
          {week.entries > 1 ? "s" : ""}, dont {week.missingCalories} aux
          calories inconnues ; {week.weight.days} pesées et {week.activity.days}{" "}
          journées de pas renseignées.
        </p>
        <p>
          La semaine va du lundi au dimanche, jusqu’à 21 h pour les entrées
          alimentaires. Le bilan utilise les données synchronisées lors de sa
          génération. Au moins trois pesées dans chacune des deux semaines sont
          nécessaires pour comparer les moyennes.
        </p>
      </details>
    </>
  );
}
export function WeeklyRecap({
  onBack,
  initialWeek,
}: {
  onBack: () => void;
  initialWeek?: string;
}) {
  const { repo, notify } = useApp(),
    scope = repo.scope;
  const [list, setList] = useState<WeeklyList | null>(null),
    [week, setWeek] = useState(initialWeek ?? latestRecapWeek(new Date()));
  const [report, setReport] = useState<WeeklyReport | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const loadList = async () => {
    const result = await notificationApi<WeeklyList>("weekly-list", {}, scope);
    if (!Array.isArray(result.reports))
      throw Error("Le service de récap est indisponible.");
    setList(result);
    return result;
  };
  useEffect(() => {
    let active = true;
    void notificationApi<WeeklyList>("weekly-list", {}, scope)
      .then((result) => {
        if (active) {
          if (!Array.isArray(result.reports))
            throw Error("Le service de récap est indisponible.");
          setList(result);
          if (!initialWeek) setWeek(result.latestWeek);
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [scope, initialWeek]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setReport(null);
    setError("");
    void notificationApi<{ report: WeeklyReport | null }>(
      "weekly-get",
      { week },
      scope,
    )
      .then((result) => {
        if (active) setReport(result.report);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, week]);
  useEffect(() => {
    if (report?.status !== "generating") return;
    let active = true;
    const timer = setInterval(() => {
      void notificationApi<{ report: WeeklyReport | null }>(
        "weekly-get",
        { week },
        scope,
      )
        .then((result) => {
          if (active) setReport(result.report);
        })
        .catch(() => {});
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [report?.status, scope, week]);
  const run = async (action: () => Promise<void>) => {
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
  const latest = list?.latestWeek ?? latestRecapWeek(new Date());
  const weeks = [
    ...new Set([
      week,
      ...Array.from({ length: 53 }, (_, i) => shiftWeekDay(latest, -7 * i)),
    ]),
  ]
    .sort()
    .reverse();
  const inProgress =
    report?.status === "generating" &&
    (!report.lease_until || Date.parse(report.lease_until) > Date.now());
  const exhausted = report?.status === "failed" && (report.attempts ?? 0) >= 3;
  const cooling =
    report?.status === "failed" &&
    !!report.lease_until &&
    Date.parse(report.lease_until) > Date.now();
  useEffect(() => {
    if (report?.status !== "failed" || !report.lease_until) return;
    const delay = Date.parse(report.lease_until) - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(
      () => setReport((p) => (p ? { ...p } : p)),
      delay + 50,
    );
    return () => clearTimeout(timer);
  }, [report?.status, report?.lease_until]);
  const generate = () =>
    void run(async () => {
      await repo.sync();
      const result = await notificationApi<{ report: WeeklyReport | null }>(
        "weekly-generate",
        { week },
        scope,
      );
      setReport(result.report);
      await loadList();
      if (result.report?.status === "ready") notify("Ton récap est prêt");
    });
  return (
    <Sheet
      title="Récap hebdomadaire"
      subtitle="Une semaine à la fois."
      back={onBack}
    >
      <div className="weekly-recap">
        <section className="recap-schedule">
          <CalendarRange size={23} />
          <div>
            <strong>Le dimanche à 21 h</strong>
            <p>Un nouveau bilan, les anciennes semaines conservées.</p>
          </div>
          <label>
            <input
              type="checkbox"
              disabled={busy || !list}
              checked={list?.enabled ?? false}
              onChange={(e) => {
                const enabled = e.target.checked,
                  previous = list?.enabled ?? false;
                setList((p) => (p ? { ...p, enabled } : p));
                void run(async () => {
                  try {
                    await notificationApi("weekly-enable", { enabled }, scope);
                  } catch (error) {
                    setList((p) => (p ? { ...p, enabled: previous } : p));
                    throw error;
                  }
                  notify(
                    enabled
                      ? "Récap automatique activé"
                      : "Récap automatique désactivé",
                  );
                });
              }}
            />
            Activer mon récap automatique
          </label>
          <small>
            Gemini analyse uniquement les statistiques de ton journal, sans
            photos ni messages. Les notifications doivent être autorisées sur
            ton iPhone pour être prévenu.
          </small>
        </section>
        <label className="recap-week-select">
          Semaine
          <select
            aria-label="Semaine du récap"
            value={week}
            disabled={busy}
            onChange={(e) => setWeek(e.target.value)}
          >
            {weeks.map((start) => (
              <option key={start} value={start}>
                {recapPeriod(start)}
                {list?.reports.some(
                  (r) => r.week_start === start && r.status === "ready",
                )
                  ? " · Disponible"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="recap-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Chargement du récap…</p>
        ) : report?.status === "ready" && report.metrics && report.narrative ? (
          <>
            <section className="recap-intro">
              <span className="recap-ai-badge">
                <Sparkles size={13} />
                Synthèse Gemini
              </span>
              <h3>{recapPeriod(week)}</h3>
              <p>{report.narrative.summary}</p>
              {report.generated_at && (
                <small>
                  Généré le{" "}
                  {new Date(report.generated_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "Europe/Paris",
                  })}
                </small>
              )}
            </section>
            <WeeklyNumbers metrics={report.metrics} />
            {report.narrative.observations.length > 0 && (
              <section className="recap-section">
                <h3>À retenir</h3>
                <ul>
                  {report.narrative.observations.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              </section>
            )}
            <section className="recap-actions">
              <h3>Pour la semaine prochaine</h3>
              <ol>
                {report.narrative.actions.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ol>
            </section>
          </>
        ) : (
          <section className="recap-empty">
            <BookOpen size={30} />
            <h3>
              {inProgress || busy
                ? "Ton bilan se prépare…"
                : report?.status === "empty"
                  ? "Pas de données pour cette semaine"
                  : report?.status === "failed"
                    ? "Le récap n’a pas pu être préparé"
                    : "Ton récap n’est pas encore généré"}
            </h3>
            <p>
              {report?.error_code === "access"
                ? "Ce compte n’a pas accès à l’analyse Gemini."
                : report?.error_code === "quota"
                  ? "La limite Gemini a été atteinte. Réessaie plus tard."
                  : report?.status === "empty"
                    ? "Aucune saisie exploitable n’était synchronisée pour cette période."
                    : "Calories, apports détaillés, activité et évolution seront regroupés ici, avec quelques pistes pour la semaine suivante."}
            </p>
            {exhausted ? (
              <p>
                Trois tentatives ont échoué pour cette semaine. Le bilan reste
                indisponible pour le moment.
              </p>
            ) : (
              cooling && (
                <p>
                  Nouvelle tentative possible à{" "}
                  {new Date(report!.lease_until!).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Europe/Paris",
                  })}
                  .
                </p>
              )
            )}
            {report?.status !== "empty" && (
              <Button
                primary
                disabled={busy || loading || inProgress || cooling || exhausted}
                onClick={generate}
              >
                {busy || inProgress ? (
                  <>
                    <RefreshCw size={16} />
                    Génération en cours…
                  </>
                ) : (
                  "Générer ce récap"
                )}
              </Button>
            )}
          </section>
        )}
      </div>
    </Sheet>
  );
}
