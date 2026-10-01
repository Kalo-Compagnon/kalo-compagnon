import { useState } from "react";
import { useApp, Button } from "./ui";
import { allDays, steps, labelDay, fmt } from "./domain";
import { readFit } from "./fit";
export function Activity() {
  const { state, day, update, notify } = useApp();
  const [value, setValue] = useState(String(state.days[day]?.steps || "")),
    [status, setStatus] = useState("Aucun fichier importé"),
    [busy, setBusy] = useState(false);
  return (
    <>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await update((s) => {
            s.days[day] = { ...s.days[day], steps: Number(value) };
          });
          notify(
            `${(300 + Number(value) + (state.days[day]?.fitSteps ?? 0)).toLocaleString("fr-FR")} pas enregistrés`,
          );
        }}
      >
        <h2 className="activity-heading">Pas à ajouter aujourd’hui</h2>
        <div className="card steps-input">
          <input
            aria-label="Pas à ajouter"
            type="number"
            inputMode="numeric"
            min={0}
            max={9999999}
            step={1}
            placeholder="0"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <b>pas</b>
        </div>
        <Button primary type="submit">
          Enregistrer les pas
        </Button>
      </form>
      <h2 className="section-title regular">Historique des pas enregistrés</h2>
      <div className="steps-history">
        {allDays(state).map((d) => (
          <div className="card" key={d}>
            {labelDay(d)}
            <strong>
              {steps(state.days[d] ?? {}).toLocaleString("fr-FR")} pas
            </strong>
          </div>
        ))}
      </div>
      <h2 className="activity-heading">Importer une activité</h2>
      <label className={`card fit-drop ${busy ? "busy" : ""}`}>
        <b className="fit-symbol">FIT</b>
        <strong>{busy ? "Import en cours…" : "Choisir un fichier .fit"}</strong>
        <span>Garmin, COROS ou autre montre compatible</span>
        <input
          disabled={busy}
          type="file"
          accept=".fit"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            try {
              const result = await readFit(file, day, state);
              await update(result.apply);
              setStatus(
                `${fmt(result.record.calories)} kcal FIT · ${result.record.coveredSteps.toLocaleString("fr-FR")} pas déjà couverts`,
              );
            } catch (e) {
              setStatus((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <p className="subtitle" role="status">
        {status}
      </p>
      <h2 className="section-title">Derniers imports</h2>
      <div className="card padded fit-history">
        {state.imports.length
          ? state.imports
              .slice(-5)
              .reverse()
              .map((i) => (
                <p key={i.id}>
                  {i.name}
                  <br />
                  {new Date(i.timestamp).toLocaleString("fr-FR")} ·{" "}
                  {Math.round(i.size / 1000)} Ko · {fmt(i.calories)} kcal ·{" "}
                  {i.coveredSteps} pas couverts
                </p>
              ))
          : "Aucun fichier .fit importé"}
      </div>
    </>
  );
}
