import { Field, NumberField } from "./ui";
import { ageOn, fmt, type Settings, type rollingWeight } from "./domain";

export function BasalFields({
  birthDate,
  setBirthDate,
  sex,
  setSex,
  height,
  setHeight,
  weight,
  day,
}: {
  birthDate: string;
  setBirthDate: (value: string) => void;
  sex: Settings["sex"];
  setSex: (value: Settings["sex"]) => void;
  height: string;
  setHeight: (value: string) => void;
  weight: ReturnType<typeof rollingWeight>;
  day: string;
}) {
  const age = ageOn(birthDate, day);
  return (
    <>
      <div role="group" aria-label="Sexe">
        <p className="field-label">Sexe</p>
        <div className="radio-row">
          <label>
            <input
              type="radio"
              name="basal-sex"
              checked={sex === "male"}
              onChange={() => setSex("male")}
            />
            Homme
          </label>
          <label>
            <input
              type="radio"
              name="basal-sex"
              checked={sex === "female"}
              onChange={() => setSex("female")}
            />
            Femme
          </label>
        </div>
      </div>
      <Field
        label="Date de naissance"
        type="date"
        autoComplete="bday"
        value={birthDate}
        max={day}
        required
        onChange={(e) => setBirthDate(e.target.value)}
      />
      <p className="note">
        {age === null
          ? "L’âge sera calculé automatiquement."
          : `Âge calculé : ${age} ans`}
      </p>
      <NumberField
        label="Taille (cm)"
        value={height}
        onChange={setHeight}
        min={100}
        max={250}
        required
      />
      <Field
        label="Poids moyen utilisé (kg)"
        readOnly
        value={weight ? fmt(weight.value) : "Aucune pesée"}
      />
      <p className="note">
        {weight
          ? `Moyenne des ${weight.count} dernières journées avec une pesée (7 maximum), jusqu’à cette journée. Les jours sans pesée ne comptent pas.`
          : "Enregistre une première pesée dans « Poids sur la balance » pour calculer ton métabolisme. Aucun poids n’est inventé."}
      </p>
    </>
  );
}
