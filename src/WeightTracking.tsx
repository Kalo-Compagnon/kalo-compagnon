import { useState } from "react";
import { useApp, Button, HistoryList } from "./ui";
import { fmt, labelDay, dayKey } from "./domain";

export function WeightTracking() {
  const { state, day, update, notify } = useApp();
  const [draft, setDraft] = useState(String(state.days[day]?.weightKg ?? ""));
  const [date, setDate] = useState(day);
  const records = Object.entries(state.days)
    .filter(([, value]) => (value.weightKg ?? 0) > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, weight: value.weightKg! }));
  const first = records[0],
    last = records.at(-1);
  const low = Math.min(...records.map((r) => r.weight)) - 0.5;
  const high = Math.max(...records.map((r) => r.weight)) + 0.5;
  const points = records.map((r) => ({
    x:
      records.length === 1
        ? 160
        : 52 +
          (256 *
            (new Date(`${r.date}T12:00:00`).getTime() -
              new Date(`${first.date}T12:00:00`).getTime())) /
            (new Date(`${last!.date}T12:00:00`).getTime() -
              new Date(`${first.date}T12:00:00`).getTime()),
    y: 100 - (80 * (r.weight - low)) / (high - low),
    ...r,
  }));
  return (
    <section
      className="card padded weight-tracking"
      aria-label="Suivi du poids"
    >
      <h2>Poids sur la balance</h2>
      <p>
        Une pesée par jour · choisis une date pour ajouter ou corriger un
        relevé.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const weight = Number(draft.replace(",", "."));
          if (!Number.isFinite(weight) || weight <= 0) {
            notify("Saisis un poids supérieur à zéro");
            return;
          }
          if (!date || date > dayKey()) {
            notify("Choisis une date de pesée jusqu’à aujourd’hui");
            return;
          }
          try {
            await update((s) => {
              s.days[date] = { ...s.days[date], weightKg: weight };
            });
            notify("Pesée enregistrée");
          } catch (error) {
            notify(String(error));
          }
        }}
      >
        <label className="field">
          Date de la pesée
          <input
            type="date"
            required
            max={dayKey()}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setDraft(String(state.days[e.target.value]?.weightKg ?? ""));
            }}
          />
        </label>
        <label className="field">
          Poids sur la balance (kg)
          <input
            type="text"
            inputMode="decimal"
            required
            value={draft}
            onChange={(e) => {
              if (/^\d*(?:[.,]\d*)?$/.test(e.target.value))
                setDraft(e.target.value);
            }}
          />
        </label>
        <Button primary type="submit">
          Enregistrer la pesée
        </Button>
      </form>
      {last ? (
        <>
          <p>
            Dernière pesée : <strong>{fmt(last.weight)} kg</strong> ·{" "}
            {labelDay(last.date)}
            {records.length > 1 && (
              <>
                {" "}
                · Évolution : {last.weight > first.weight ? "+" : ""}
                {fmt(last.weight - first.weight)} kg depuis le{" "}
                {labelDay(first.date)}
              </>
            )}
          </p>
          <svg
            viewBox="0 0 320 120"
            role="img"
            aria-label="Courbe d’évolution du poids"
            style={{ width: "100%", maxHeight: 180 }}
          >
            <text x="4" y="22" fill="currentColor" fontSize="10">
              {fmt(high)} kg
            </text>
            <text x="4" y="104" fill="currentColor" fontSize="10">
              {fmt(low)} kg
            </text>
            <text x="52" y="118" fill="currentColor" fontSize="10">
              {labelDay(first.date)}
            </text>
            {records.length > 1 && (
              <text
                x="308"
                y="118"
                textAnchor="end"
                fill="currentColor"
                fontSize="10"
              >
                {labelDay(last.date)}
              </text>
            )}
            <polyline
              points={points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#FFD54F"
              strokeWidth="2"
            />
            {points.map((p) => (
              <circle key={p.date} cx={p.x} cy={p.y} r="3" fill="#FFD54F">
                <title>
                  {labelDay(p.date)} : {fmt(p.weight)} kg
                </title>
              </circle>
            ))}
          </svg>
          <h3>Historique des pesées ({records.length})</h3>
          <div className="weight-history">
            <HistoryList>
              {records
                .slice()
                .reverse()
                .map((r) => (
                  <div key={r.date}>
                    <p>
                      {labelDay(r.date)} · {fmt(r.weight)} kg
                    </p>
                    <Button
                      onClick={() => {
                        setDate(r.date);
                        setDraft(String(r.weight));
                      }}
                    >
                      Modifier la pesée du {labelDay(r.date)}
                    </Button>
                    <Button
                      onClick={() =>
                        void update((s) => {
                          delete s.days[r.date].weightKg;
                        })
                          .then(() => {
                            if (r.date === date) setDraft("");
                          })
                          .catch((error) => notify(String(error)))
                      }
                    >
                      Supprimer la pesée du {labelDay(r.date)}
                    </Button>
                  </div>
                ))}
            </HistoryList>
          </div>
        </>
      ) : (
        <p>Aucune pesée enregistrée.</p>
      )}
    </section>
  );
}
