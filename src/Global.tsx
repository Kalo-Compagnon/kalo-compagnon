import { useLayoutEffect, useRef, useState } from "react";
import {
  useApp,
  Sheet,
  Button,
  ValueDialog,
  HistoryList,
  num,
  HoldButton,
} from "./ui";
import {
  balance,
  fmt,
  allDays,
  entriesOn,
  basal,
  expense,
  consumed,
  labelDay,
  calculateBasal,
  dayKey,
  sub,
  dailyBudget,
  ageOn,
  rollingWeight,
  type State,
} from "./domain";
import type { Sharing } from "./duo-model";
import { BasalFields } from "./BasalFields";
import { CalorieChart } from "./Charts";
import { WeightTracking } from "./WeightTracking";

function BalanceAmount({
  value,
  className,
  compact,
}: {
  value: string;
  className: string;
  compact: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!compact) return;
    const element = ref.current!;
    const fit = () => {
      element.style.fontSize = "";
      const style = getComputedStyle(element);
      const maximum = parseFloat(style.fontSize);
      const available =
        element.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      const context = document.createElement("canvas").getContext("2d")!;
      context.font = `${style.fontWeight} ${maximum}px ${style.fontFamily}`;
      const width = context.measureText(value).width;
      if (available > 0 && width > 0)
        element.style.fontSize = `${Math.min(maximum, ((maximum * available) / width) * 0.98)}px`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    void document.fonts.ready.then(() => {
      if (ref.current === element) fit();
    });
    return () => observer.disconnect();
  }, [value, compact]);
  return (
    <div ref={ref} className={className}>
      {value}
    </div>
  );
}
export function BasalDialog() {
  const { state, day, update, close, notify } = useApp();
  const [sex, setSex] = useState(state.settings.sex),
    [birthDate, setBirthDate] = useState(state.settings.birthDate ?? ""),
    [height, setHeight] = useState(String(state.settings.height || ""));
  const weight = rollingWeight(state, day);
  return (
    <Sheet title="Calcul du métabolisme basal">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const age = ageOn(birthDate, day);
            if (age === null) throw new Error("Vérifie la date de naissance");
            if (!weight)
              throw new Error(
                "Enregistre une première pesée dans « Poids sur la balance »",
              );
            const value = calculateBasal(sex, age, num(height), weight.value);
            await update((s) => {
              s.settings = {
                ...s.settings,
                sex,
                birthDate,
                age,
                height: num(height),
                weight: weight.value,
                basal: day === dayKey() ? value : s.settings.basal,
              };
              s.days[day] = { ...s.days[day], basal: value };
            });
            close();
          } catch (e) {
            notify((e as Error).message);
          }
        }}
      >
        <BasalFields
          birthDate={birthDate}
          setBirthDate={setBirthDate}
          sex={sex}
          setSex={setSex}
          height={height}
          setHeight={setHeight}
          weight={weight}
          day={day}
        />
        <Button primary type="submit">
          Calculer
        </Button>
      </form>
    </Sheet>
  );
}
export function Global({
  onExport,
  readOnly = false,
  view,
  showChart = true,
}: {
  onExport?: () => void;
  readOnly?: boolean;
  showChart?: boolean;
  view?: { state: State; day: string; permissions: Sharing };
}) {
  const {
    state: personalState,
    day: personalDay,
    modal,
    update,
    editDay,
    close,
  } = useApp();
  const state = view?.state ?? personalState,
    day = view?.day ?? personalDay;
  const canFood = !view || view.permissions.food;
  const canExpense =
    !view || (view.permissions.activity && view.permissions.goals);
  const canBalance = canFood && canExpense;
  const GoalTag = readOnly ? "p" : "button";
  const b = canBalance ? balance(state, day) : null,
    budget = canBalance ? dailyBudget(state, day) : null,
    goal = state.settings.deficitGoal,
    missing = entriesOn(state, day).filter((e) => e.calories === null).length;
  const goalText = !b
    ? `Objectif : ${goal} kcal/j · modifier`
    : b.deficit >= goal
      ? `Objectif ${goal} kcal/j atteint · +${fmt(-sub(goal, b.deficit))} kcal · modifier`
      : b.deficit > 0
        ? `Objectif ${goal} kcal/j · reste ${fmt(sub(goal, b.deficit))} kcal · modifier`
        : `Objectif ${goal} kcal/j · surplus ${fmt(Math.max(0, b.net))} kcal · modifier`;
  return (
    <>
      <div className="global-grid">
        <div>
          <section
            className="card balance-card"
            aria-label={
              readOnly ? "Bilan calorique moyen sur 7 jours" : undefined
            }
          >
            <p className="section-label">Bilan calorique</p>
            {!readOnly && (
              <span className="period-chip">
                Moyenne quotidienne · 7 jours glissants · {b?.count ?? 0}/7
                renseignés
              </span>
            )}
            <BalanceAmount
              compact={readOnly}
              className={`net ${b ? (b.net < 0 ? "green" : b.net > 0 ? "pink" : "") : ""}`}
              value={b ? `${b.net > 0 ? "+" : ""}${fmt(b.net)} kcal` : "—"}
            />
            <p className="balance-status">
              {b
                ? b.net < 0
                  ? "Déficit quotidien moyen"
                  : b.net > 0
                    ? "Surplus quotidien moyen"
                    : "Équilibre quotidien moyen"
                : !canBalance
                  ? "Bilan non partagé"
                  : "Données à renseigner"}
            </p>
            <GoalTag
              className={`goal-chip ${b ? (b.deficit >= goal ? "green" : "yellow") : ""}`}
              onClick={
                readOnly
                  ? undefined
                  : () =>
                      modal(
                        <ValueDialog
                          title="Objectif de déficit quotidien"
                          initial={goal}
                          min={1}
                          max={3000}
                          onSave={(v) =>
                            update((s) => {
                              s.settings.deficitGoal = v;
                            })
                          }
                        />,
                      )
              }
            >
              {view && !view.permissions.goals
                ? "Objectifs non partagés"
                : readOnly
                  ? goalText.replace(" · modifier", "")
                  : goalText}
            </GoalTag>
            {!readOnly && (
              <p
                className={`cum-deficit ${b ? (b.cumulative >= 0 ? "green" : "pink") : ""}`}
              >
                Déficit cumulé - {b ? `${fmt(b.cumulative)} kcal` : "—"}
                {(!view || view.permissions.goals) && (
                  <> - objectif {fmt(goal * 7)} kcal</>
                )}
              </p>
            )}
          </section>
          <div className="stat-row">
            <section className="card stat-card">
              <div className="average-stat">
                <p className="label">Apport moyen</p>
                <p className="value pink">{b ? `${fmt(b.food)} kcal` : "—"}</p>
              </div>
              <div className="daily-band" aria-label="Apport du jour">
                <span>{day === dayKey() ? "Aujourd’hui" : labelDay(day)}</span>
                <strong className="daily-value pink">
                  {canFood
                    ? `${fmt(consumed(state, day))} kcal`
                    : "Non partagé"}
                </strong>
                {(!readOnly ||
                  !canFood ||
                  missing > 0 ||
                  !entriesOn(state, day).length) && (
                  <small>
                    {!canFood
                      ? "Catégorie non autorisée."
                      : missing
                        ? "Partiel · calories à compléter"
                        : entriesOn(state, day).length
                          ? "Repas renseignés"
                          : "Aucun repas renseigné"}
                  </small>
                )}
              </div>
            </section>
            <section className="card stat-card info-card">
              {!readOnly && (
                <button
                  className="info-dot"
                  aria-label="Paramétrer le métabolisme basal"
                  onClick={() => modal(<BasalDialog />)}
                >
                  ⓘ
                </button>
              )}
              <div className="average-stat">
                <p className="label">Dépense moyenne</p>
                <p className="value green">
                  {b ? `${fmt(b.expense)} kcal` : "—"}
                </p>
              </div>
              <div className="daily-band" aria-label="Dépense du jour">
                <span>{day === dayKey() ? "Aujourd’hui" : labelDay(day)}</span>
                <strong className="daily-value green">
                  {!canExpense
                    ? "Non partagé"
                    : basal(state, day) > 0
                      ? `${fmt(expense(state, day))} kcal`
                      : "—"}
                </strong>
                {(!readOnly || !canExpense || basal(state, day) <= 0) && (
                  <small>
                    {!canExpense
                      ? "Catégorie non autorisée."
                      : basal(state, day) > 0
                        ? "Métabolisme + activités"
                        : "Métabolisme à renseigner"}
                  </small>
                )}
              </div>
            </section>
          </div>
          {budget && !readOnly && (
            <p className="note daily-budget">
              {budget.possible
                ? `Budget alimentaire : ${fmt(budget.target)} kcal · ${budget.remaining >= 0 ? `reste ${fmt(budget.remaining)} kcal pour ton déficit` : `${fmt(-budget.remaining)} kcal au-dessus du budget`}`
                : "Le déficit choisi dépasse la dépense estimée de cette journée."}
              {budget.partial ? " · Estimation partielle" : ""}
            </p>
          )}
        </div>
        {showChart && (
          <div>
            <h2 className="section-title">Apport et dépense</h2>
            {canBalance && (
              <p className="legend">
                <span className="pink">Apport (rouge, bas)</span> ·{" "}
                <span className="green">Dépense (vert, haut)</span>
              </p>
            )}
            {canBalance ? (
              <CalorieChart
                state={state}
                through={readOnly ? day : undefined}
              />
            ) : (
              <p className="note">
                Bilan indisponible sans partage de l’alimentation, de l’activité
                et des objectifs.
              </p>
            )}
            {canBalance && (
              <>
                <p className="note">
                  Glisser pour parcourir les jours · * Données incomplètes
                </p>
                <p className="note">
                  Dépense = métabolisme + activité sportive
                </p>
                <p className="note untracked">
                  {missing
                    ? `${missing} entrée${missing > 1 ? "s rapides sans calories ne sont pas comptabilisées." : " rapide sans calories n’est pas comptabilisée."}`
                    : "Toutes les entrées du jour sont comptabilisées."}
                </p>
              </>
            )}
          </div>
        )}
      </div>
      {!readOnly && (
        <>
          <WeightTracking key={day} />
          <p className="section-label history-heading">Journées terminées</p>
          <p className="note">
            Maintiens une journée appuyée pour afficher le bouton de
            modification.
          </p>
          <section className="card history-card">
            {allDays(state).filter((d) => d < dayKey()).length === 0 ? (
              "La journée apparaîtra ici une fois terminée."
            ) : (
              <HistoryList>
                {allDays(state)
                  .filter((d) => d < dayKey())
                  .map((d) => {
                    const es = entriesOn(state, d),
                      delta = sub(expense(state, d), consumed(state, d)),
                      why = [
                        !es.length ? "repas absents" : "",
                        es.some((e) => e.calories === null)
                          ? "calories à estimer"
                          : "",
                        basal(state, d) <= 0 ? "métabolisme absent" : "",
                      ].filter(Boolean);
                    return (
                      <HoldButton
                        key={d}
                        label={`Journée du ${labelDay(d)} · maintenir pour les options`}
                        onHold={() =>
                          modal(
                            <Sheet title={`Journée du ${labelDay(d)}`}>
                              <p>
                                Ouvre cette journée pour consulter ou modifier
                                ses données.
                              </p>
                              <Button
                                primary
                                onClick={() => {
                                  editDay(d);
                                  close();
                                }}
                              >
                                Modifier cette journée
                              </Button>
                            </Sheet>,
                          )
                        }
                      >
                        <time className="history-date" dateTime={d}>
                          {labelDay(d)}
                        </time>
                        <span className="history-result">
                          <span className="history-result-label">
                            {basal(state, d) <= 0 || !es.length
                              ? "Bilan indisponible"
                              : `${delta >= 0 ? "Déficit" : "Surplus"} estimé`}
                          </span>
                          {basal(state, d) > 0 && es.length > 0 && (
                            <strong
                              className={`history-result-value ${why.length ? "yellow" : delta >= 0 ? "green" : "pink"}`}
                            >
                              {fmt(Math.abs(delta))} <span>kcal</span>
                            </strong>
                          )}
                        </span>
                        {why.length > 0 && (
                          <small>À compléter : {why.join(", ")}</small>
                        )}
                      </HoldButton>
                    );
                  })}
              </HistoryList>
            )}
          </section>
          <Button className="export-btn" onClick={onExport}>
            Exporter toutes mes données (.csv)
          </Button>
        </>
      )}
    </>
  );
}
