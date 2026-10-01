import { useApp, ValueDialog, Button, ActionRow, Confirm } from "./ui";
import { entriesOn, target, expense, fmt, dayKey } from "./domain";
import { FoodHub, ExtraEditor } from "./FoodHub";
export function Meals() {
  const { state, day, update, modal } = useApp(),
    entries = entriesOn(state, day),
    food = Math.trunc(entries.reduce((a, e) => a + (e.calories ?? 0), 0)),
    goal = target(state, day),
    remaining = goal - food,
    spent = expense(state, day),
    delta = Math.trunc(spent) - food;
  return (
    <>
      <button
        className="card calorie-summary"
        onClick={() =>
          modal(
            <ValueDialog
              title="Objectif calorique journalier"
              initial={goal}
              min={1}
              onSave={(v) =>
                update((s) => {
                  s.days[day] = { ...s.days[day], target: v };
                  if (day === dayKey()) s.settings.target = v;
                })
              }
            />,
          )
        }
      >
        <span className="label">CALORIES DU JOUR</span>
        <span className="consumed-row">
          <strong>{food.toLocaleString("fr-FR")}</strong>
          <b className={remaining >= 0 ? "light-pink" : "yellow"}>
            {remaining >= 0
              ? `${remaining.toLocaleString("fr-FR")} restantes`
              : `+${(-remaining).toLocaleString("fr-FR")} dépassées`}
          </b>
        </span>
        <progress
          value={Math.min(
            100,
            Math.max(0, Math.trunc((food * 100) / Math.max(1, goal))),
          )}
          max={100}
        />
        <span className="target">
          Objectif {goal.toLocaleString("fr-FR")} kcal · modifier
        </span>
        <b className="theoretical">
          {spent > 0
            ? `${delta >= 0 ? "Déficit" : "Surplus"} théorique estimé : ${Math.abs(delta).toLocaleString("fr-FR")} kcal`
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
              <span className={`category-badge ${e.type}`}>
                {e.type === "extra"
                  ? "E"
                  : e.type === "meal"
                    ? "R"
                    : e.type === "drink"
                      ? "B"
                      : e.type === "snack"
                        ? "S"
                        : "A"}
              </span>
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
                <b className={e.calories === null ? "yellow" : "light-pink"}>
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
