import { readFile, writeFile } from "node:fs/promises";
import { calculateBasal, type State } from "../src/domain";
import { validateState } from "../src/transfer";

const source: State = JSON.parse(
  await readFile("demo/kalo-demo.json", "utf8"),
).state;
const profiles = [
  {
    name: "Coralie",
    accent: "#dc92b7",
    sex: "female" as const,
    height: 166,
    age: 30,
    birthDate: "1996-03-14",
    baseWeight: 65.4,
  },
  {
    name: "Loric",
    accent: "#80b4e7",
    sex: "male" as const,
    height: 178,
    age: 32,
    birthDate: "1994-04-12",
    baseWeight: 80.2,
  },
].map((person, index) => {
  const state = structuredClone(source);
  state.settings = {
    ...state.settings,
    displayName: person.name,
    haloColor: person.accent,
    sex: person.sex,
    height: person.height,
    age: person.age,
    birthDate: person.birthDate,
    weight: person.baseWeight,
    deficitGoal: index === 0 ? 200 : 300,
  };
  delete state.settings.duoDemo;
  state.foods = [];
  state.meals = [];
  Object.entries(state.days).forEach(([date, day], i) => {
    const weight =
      Math.round(
        (person.baseWeight -
          i * (index === 0 ? 0.025 : 0.045) +
          [0, 0.1, -0.1][i % 3]) *
          10,
      ) / 10;
    if (day.weightKg !== undefined) day.weightKg = weight;
    day.basal = calculateBasal(person.sex, person.age, person.height, weight);
    day.steps = Math.round((day.steps ?? 0) * (index === 0 ? 1.12 : 0.94));
    const original = source.days[date];
    const measurements = (values: Record<string, number>) =>
      Object.fromEntries(
        Object.entries(values).map(([k, v]) => [
          k,
          Math.round(v * (index === 0 ? 0.88 : 1) * 10) / 10,
        ]),
      );
    if (original.measurements)
      day.measurements = measurements(original.measurements);
    if (original.measurementHistory)
      day.measurementHistory = original.measurementHistory.map((r) => ({
        ...r,
        values: measurements(r.values),
      }));
  });
  state.entries = state.entries.map((e) => ({
    ...e,
    id: `duo-demo-${index}-${e.id}`,
    calories:
      e.calories === null
        ? null
        : Math.round(e.calories * (index === 0 ? 0.87 : 1.05)),
  }));
  state.physical = state.physical.map((p, i) => ({
    ...p,
    id: `duo-demo-${index}-${p.id}`,
    waistCm: Math.round(p.waistCm * (index === 0 ? 0.88 : 1) * 10) / 10,
    weightKg: Math.round((person.baseWeight - i * 0.18) * 10) / 10,
  }));
  state.imports = state.imports.map((p) => ({
    ...p,
    id: `duo-demo-${index}-${p.id}`,
  }));
  state.settings.basal = calculateBasal(
    person.sex,
    person.age,
    person.height,
    person.baseWeight,
  );
  return validateState(state);
});
const dates = Object.keys(source.days).sort();
await writeFile(
  "demo/duo-demo.json",
  JSON.stringify(
    {
      version: 1,
      fictional: true,
      from: dates[0],
      through: dates.at(-1),
      profiles,
    },
    null,
    2,
  ),
);
console.log(
  "Duo fictif validé : deux profils, aucun accès à des comptes réels.",
);
