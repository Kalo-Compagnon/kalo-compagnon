import { useState } from "react";
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
} from "./domain";
import { BasalFields } from "./BasalFields";
import { CalorieChart } from "./Charts";
import { WeightTracking } from "./WeightTracking";
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
export function Global({ onExport }: { onExport: () => void }) {
  const { state, day, modal, update, editDay, close } = useApp();
  const b = balance(state, day),
    budget = dailyBudget(state, day),
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
          <section className="card balance-card">
            <p className="section-label">Bilan calorique</p>
            <span className="period-chip">
              Moyenne quotidienne · 7 jours glissants · {b?.count ?? 0}/7
              renseignés
            </span>
            <div
              className={`net ${b ? (b.net < 0 ? "green" : b.net > 0 ? "pink" : "") : ""}`}
            >
              {b ? `${b.net > 0 ? "+" : ""}${fmt(b.net)} kcal` : "—"}
            </div>
            <p className="balance-status">
              {b
                ? b.net < 0
                  ? "Déficit quotidien moyen"
                  : b.net > 0
                    ? "Surplus quotidien moyen"
                    : "Équilibre quotidien moyen"
                : "Données à renseigner"}
            </p>
            <button
              className={`goal-chip ${b ? (b.deficit >= goal ? "green" : "yellow") : ""}`}
              onClick={() =>
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
              {goalText}
            </button>
            <p
              className={`cum-deficit ${b ? (b.cumulative >= 0 ? "green" : "pink") : ""}`}
            >
              Déficit cumulé - {b ? `${fmt(b.cumulative)} kcal` : "—"} -
              objectif {fmt(goal * 7)} kcal
            </p>
          </section>
          <div className="stat-row">
            <section className="card stat-card">
              <p className="label">Apport moyen</p>
              <p className="value pink">{b ? `${fmt(b.food)} kcal` : "—"}</p>
            </section>
            <section className="card stat-card info-card">
              <button
                className="info-dot"
                aria-label="Paramétrer le métabolisme basal"
                onClick={() => modal(<BasalDialog />)}
              >
                ⓘ
              </button>
              <p className="label">Dépense moyenne</p>
              <p className="value green">
                {b ? `${fmt(b.expense)} kcal` : "—"}
              </p>
            </section>
          </div>
          <section className="daily-stats" aria-label="Bilan de la journée">
            <h2>Pour cette journée</h2>
            <p className="note">
              {day === dayKey() ? "Aujourd’hui" : labelDay(day)}
            </p>
            <div className="stat-row">
              <section className="card stat-card">
                <p className="label">Apport du jour</p>
                <p className="value pink">{fmt(consumed(state, day))} kcal</p>
                <p className="note">
                  {missing
                    ? "Partiel · calories à compléter"
                    : entriesOn(state, day).length
                      ? "Repas renseignés"
                      : "Aucun repas renseigné"}
                </p>
              </section>
              <section className="card stat-card">
                <p className="label">Dépense du jour</p>
                <p className="value green">
                  {basal(state, day) > 0
                    ? `${fmt(expense(state, day))} kcal`
                    : "—"}
                </p>
                <p className="note">
                  {basal(state, day) > 0
                    ? "Métabolisme + activités"
                    : "Métabolisme à renseigner"}
                </p>
              </section>
            </div>
            {budget && (
              <p className="note daily-budget">
                {budget.possible
                  ? `Budget alimentaire : ${fmt(budget.target)} kcal · ${budget.remaining >= 0 ? `reste ${fmt(budget.remaining)} kcal pour ton déficit` : `${fmt(-budget.remaining)} kcal au-dessus du budget`}`
                  : "Le déficit choisi dépasse la dépense estimée de cette journée."}
                {budget.partial ? " · Estimation partielle" : ""}
              </p>
            )}
          </section>
        </div>
        <div>
          <h2 className="section-title">Apport et dépense</h2>
          <p className="legend">Apport (violet, base) · Dépense (vert, haut)</p>
          <CalorieChart state={state} />
          <p className="note">
            Glisser pour parcourir les jours · * Données incomplètes
          </p>
          <p className="note">Dépense = métabolisme + activité sportive</p>
          <p className="note untracked">
            {missing
              ? `${missing} entrée${missing > 1 ? "s rapides sans calories ne sont pas comptabilisées." : " rapide sans calories n’est pas comptabilisée."}`
              : "Toutes les entrées du jour sont comptabilisées."}
          </p>
        </div>
      </div>
      <WeightTracking key={day} />
      <p className="section-label history-heading">Journées terminées</p>
      <p className="note">
        Maintiens une journée appuyée pour afficher le bouton de modification.
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
                            Ouvre cette journée pour consulter ou modifier ses
                            données.
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
  );
}
