import { useState } from "react";
import { useApp, Sheet, NumberField, Button, ValueDialog, num } from "./ui";
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
} from "./domain";
import { CalorieChart } from "./Charts";
export function BasalDialog() {
  const { state, day, update, close, notify } = useApp();
  const [sex, setSex] = useState(state.settings.sex),
    [age, setAge] = useState(String(state.settings.age || "")),
    [height, setHeight] = useState(String(state.settings.height || "")),
    [weight, setWeight] = useState(String(state.settings.weight || ""));
  return (
    <Sheet title="Calcul du métabolisme basal">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const value = calculateBasal(
              sex,
              num(age),
              num(height),
              num(weight),
            );
            await update((s) => {
              s.settings = {
                ...s.settings,
                sex,
                age: num(age),
                height: num(height),
                weight: num(weight),
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
        <div className="radio-row">
          <label>
            <input
              type="radio"
              checked={sex === "male"}
              onChange={() => setSex("male")}
            />
            Homme
          </label>
          <label>
            <input
              type="radio"
              checked={sex === "female"}
              onChange={() => setSex("female")}
            />
            Femme
          </label>
        </div>
        <NumberField
          label="Âge"
          value={age}
          onChange={setAge}
          min={13}
          max={120}
          required
          step={1}
        />
        <NumberField
          label="Taille (cm)"
          value={height}
          onChange={setHeight}
          min={100}
          max={250}
          required
        />
        <NumberField
          label="Poids (kg)"
          value={weight}
          onChange={setWeight}
          min={30}
          max={350}
          required
        />
        <Button primary type="submit">
          Calculer
        </Button>
      </form>
    </Sheet>
  );
}
export function Global({ onExport }: { onExport: () => void }) {
  const { state, day, modal, update, editDay } = useApp();
  const b = balance(state, day),
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
        </div>
        <div>
          <h2 className="section-title">Apport et dépense</h2>
          <p className="legend">Apport (rose, base) · Dépense (vert, haut)</p>
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
      <p className="section-label history-heading">Journées terminées</p>
      <p className="note">Appui long sur une journée pour la modifier</p>
      <section className="card history-card">
        {allDays(state).filter((d) => d < dayKey()).length === 0
          ? "La journée apparaîtra ici une fois terminée."
          : allDays(state)
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
                  <button
                    key={d}
                    className="history-day"
                    onClick={() => editDay(d)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      editDay(d);
                    }}
                  >
                    {labelDay(d)} ·{" "}
                    {basal(state, d) <= 0 || !es.length
                      ? "Bilan indisponible"
                      : `${delta >= 0 ? "Déficit" : "Surplus"} estimé : ${fmt(Math.abs(delta))} kcal`}
                    {why.length > 0 && (
                      <small>À compléter : {why.join(", ")}</small>
                    )}
                  </button>
                );
              })}
      </section>
      <Button className="export-btn" onClick={onExport}>
        Exporter toutes mes données (.csv)
      </Button>
    </>
  );
}
