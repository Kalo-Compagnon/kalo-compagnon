import { useApp, ValueDialog, Button, ActionRow, Confirm } from "./ui";
import { entriesOn, dailyBudget, consumed, expense, fmt, sub } from "./domain";
import { FoodHub, ExtraEditor } from "./FoodHub";
import {
  Apple,
  Cookie,
  CupSoda,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";

function EntryPictogram({ type }: { type: string }) {
  const { icon: Icon, label } =
    type === "extra"
      ? { icon: Sparkles, label: "Extra" }
      : type === "meal"
        ? { icon: UtensilsCrossed, label: "Repas" }
        : type === "drink"
          ? { icon: CupSoda, label: "Boisson" }
          : type === "snack"
            ? { icon: Cookie, label: "Collation" }
            : { icon: Apple, label: "Aliment" };
  return (
    <span
      className={`category-badge ${type}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
    </span>
  );
}
export function Meals() {
  const { state, day, update, modal } = useApp(),
    entries = entriesOn(state, day),
    food = consumed(state, day),
    budget = dailyBudget(state, day),
    goal = budget?.target ?? 0,
    remaining = budget?.remaining ?? 0,
    spent = expense(state, day),
    delta = sub(spent, food);
  return (
    <>
      <button
        className="card calorie-summary"
        onClick={() =>
          modal(
            <ValueDialog
              title="Objectif de déficit quotidien"
              initial={state.settings.deficitGoal}
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
        <span className="label">CALORIES DU JOUR</span>
        <span className="consumed-row">
          <strong className="pink">{fmt(food)}</strong>
          <b className={remaining >= 0 ? "green" : "pink"}>
            {!budget
              ? "Budget à calculer"
              : !budget.possible
                ? "Déficit à ajuster"
                : remaining >= 0
                  ? `${fmt(remaining)} kcal restantes`
                  : `${fmt(-remaining)} kcal au-dessus du budget`}
          </b>
        </span>
        {budget && budget.possible && (
          <progress
            value={Math.min(
              100,
              Math.max(0, Math.trunc((food * 100) / Math.max(1, goal))),
            )}
            max={100}
          />
        )}
        <span className="target">
          {budget
            ? `Budget dynamique : ${fmt(goal)} kcal`
            : "Renseigne ton métabolisme pour calculer le budget"}
        </span>
        <span className="target">
          Déficit choisi : {fmt(state.settings.deficitGoal)} kcal · modifier
        </span>
        {budget && (
          <span className="target">
            {fmt(spent)} kcal de dépense estimée −{" "}
            {fmt(state.settings.deficitGoal)} kcal de déficit
          </span>
        )}
        {budget && !budget.possible && (
          <span className="target">
            Le déficit choisi dépasse la dépense estimée de cette journée.
          </span>
        )}
        {budget?.partial && (
          <span className="target">
            Estimation partielle · des calories restent à renseigner.
          </span>
        )}
        <b className={`theoretical ${delta >= 0 ? "green" : "pink"}`}>
          {budget
            ? `${delta >= 0 ? "Déficit" : "Surplus"} théorique estimé : ${fmt(Math.abs(delta))} kcal`
            : "Déficit théorique estimé : —"}
        </b>
      </button>
      <Button primary className="add-meal" onClick={() => modal(<FoodHub />)}>
        ＋ Ajouter
      </Button>
      <p className="note centered">
        Repas enregistré, aliment, composition ou extra.
      </p>
      <h2 className="timeline-heading">Chronologie</h2>
      {entries.length === 0 ? (
        <p className="empty">Rien pour l’instant. Ajoute ton premier repas.</p>
      ) : (
        entries.map((e) => (
          <ActionRow
            key={e.id}
            onClick={() => modal(<ExtraEditor entry={e} />)}
            onEdit={() => modal(<ExtraEditor entry={e} />)}
            onDelete={() =>
              modal(
                <Confirm
                  title="Supprimer cette entrée ?"
                  action={() =>
                    update((s) => {
                      s.entries = s.entries.filter((x) => x.id !== e.id);
                    })
                  }
                >
                  {e.foodName}
                </Confirm>,
              )
            }
          >
            <div className="entry">
              <EntryPictogram type={e.type} />
              <div className="entry-text">
                <strong>
                  {e.foodName}
                  {e.quantityGrams != null
                    ? ` · ${fmt(e.quantityGrams)} ${e.quantityUnit ?? "g"}`
                    : ""}{" "}
                  ·{" "}
                  {new Date(e.timestamp).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </strong>
                <b className={e.calories === null ? "yellow" : "pink"}>
                  {e.calories === null
                    ? "À estimer"
                    : `${fmt(e.calories)} kcal`}
                </b>
                <small>
                  {e.proteinGrams != null
                    ? `P ${fmt(e.proteinGrams ?? 0)} g · G ${fmt(e.carbsGrams ?? 0)} g · L ${fmt(e.fatGrams ?? 0)} g · `
                    : ""}
                  {e.note ||
                    (e.type === "extra"
                      ? "Touchez pour compléter"
                      : "Ajouté en 1 clic")}
                </small>
              </div>
              {e.imagePath?.startsWith("data:image/") && (
                <img
                  className="entry-photo"
                  src={e.imagePath}
                  alt="Photo du repas"
                />
              )}
            </div>
          </ActionRow>
        ))
      )}
    </>
  );
}
