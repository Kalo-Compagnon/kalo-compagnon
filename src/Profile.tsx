import { useState } from "react";
import { useApp, Sheet, Field, NumberField, Button, num } from "./ui";
import { ageOn, calculateBasal, dayKey, rollingWeight } from "./domain";
import { BasalFields } from "./BasalFields";

export function Profile({ inline = false }: { inline?: boolean }) {
  const { state, update, close, notify } = useApp();
  const settings = state.settings;
  const [name, setName] = useState(settings.displayName ?? "");
  const [sex, setSex] = useState(settings.sex);
  const [birthDate, setBirthDate] = useState(settings.birthDate ?? "");
  const [height, setHeight] = useState(String(settings.height || ""));
  const weight = rollingWeight(state);
  const [goal, setGoal] = useState(String(settings.deficitGoal));
  const [busy, setBusy] = useState(false);
  const form = (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          if (!name.trim()) throw new Error("Renseigne ton prénom");
          const age = ageOn(birthDate);
          if (age === null) throw new Error("Vérifie la date de naissance");
          const calculated = calculateBasal(
            sex,
            age,
            num(height),
            weight?.value ?? 30,
          );
          await update((s) => {
            s.settings = {
              ...s.settings,
              displayName: name.trim(),
              profileCompleted: true,
              sex,
              birthDate,
              age,
              height: num(height),
              weight: weight?.value ?? s.settings.weight,
              basal: weight ? calculated : 0,
              deficitGoal: num(goal),
            };
          });
          if (!inline) close();
          notify("Profil enregistré");
        } catch (error) {
          notify((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Ces réglages et ton journal appartiennent uniquement à ton profil. Les
        journées déjà renseignées sont conservées.
      </p>
      <Field
        label="Prénom"
        autoComplete="given-name"
        value={name}
        maxLength={60}
        required
        onChange={(e) => setName(e.target.value)}
      />
      <BasalFields
        birthDate={birthDate}
        setBirthDate={setBirthDate}
        sex={sex}
        setSex={setSex}
        height={height}
        setHeight={setHeight}
        weight={weight}
        day={dayKey()}
      />
      <p className="note">
        Le sexe sélectionné adapte aussi la silhouette et les zones disponibles
        dans les mensurations. Tes anciens relevés sont conservés.
      </p>
      <p className="note">
        Le budget alimentaire est calculé chaque jour : dépense estimée moins
        ton objectif de déficit.
      </p>
      <NumberField
        label="Objectif de déficit (kcal/j)"
        value={goal}
        onChange={setGoal}
        min={1}
        max={3000}
        required
      />
      <p className="note">
        Les objectifs proposés sont modifiables : choisis les tiens avant
        d’enregistrer.
      </p>
      <Button primary type="submit" disabled={busy}>
        {busy ? "Enregistrement…" : "Enregistrer mon profil"}
      </Button>
    </form>
  );
  return inline ? (
    <section className="card padded">
      <h2>Bienvenue · ton profil</h2>
      {form}
    </section>
  ) : (
    <Sheet title="Mon profil">{form}</Sheet>
  );
}
