import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  calculateBasal,
  steps,
  activity,
  balance,
  basal,
  expense,
  consumed,
  nutrients,
  mealTotals,
  normalize,
  shiftDay,
  dayKey,
  seedFoods,
  type Entry,
  type Food,
  estimateSteps,
} from "../src/domain";
import { sessionMetrics } from "../src/fit";
import {
  exportJSON,
  importJSON,
  exportCSV,
  importCSV,
  parseCSV,
  validateState,
} from "../src/transfer";
const entry = (date: string, calories: number | null, id = date): Entry => ({
  id,
  timestamp: new Date(`${date}T12:00:00`).getTime(),
  type: "meal",
  foodName: "Test",
  calories,
});
test("Basal : formule et validation Android", () => {
  assert.equal(calculateBasal("male", 30, 180, 80), 1780);
  assert.equal(calculateBasal("female", 30, 180, 80), 1614);
  assert.throws(() => calculateBasal("male", 12, 180, 80));
  assert.throws(() => calculateBasal("male", 30.5, 180, 80));
  assert.throws(() => calculateBasal("male", 30, NaN, 80));
});
test("300 pas de base, coefficient 0,045f et pas FIT couverts", () => {
  assert.equal(steps({}), 300);
  assert.equal(activity({}), 13.500000953674316);
  assert.equal(steps({ steps: 1000, fitSteps: 2000 }), 3300);
  assert.equal(
    activity({
      steps: 1000,
      fitSteps: 2000,
      fitCoveredSteps: 2000,
      fitCalories: 400,
    }),
    458.5,
  );
  assert.equal(
    activity({ steps: 1000, fitCoveredSteps: 9999, fitCalories: 400 }),
    400,
  );
});
test("Moyenne glissante : exclut jours vides, partiels, sans basal, hors période", () => {
  const s = initialState();
  s.settings.basal = 1800;
  s.entries = [
    entry("2026-09-25", 1000),
    entry("2026-09-26", 1200),
    entry("2026-09-27", null),
    entry("2026-09-24", 9000),
  ];
  const b = balance(s, "2026-10-01")!;
  assert.equal(b.count, 2);
  assert.equal(b.food, 1100);
  assert.equal(b.expense, 1813.5);
  assert.equal(b.net, -713.5);
  assert.equal(b.cumulative, 1427);
  s.settings.basal = 0;
  assert.equal(balance(s, "2026-10-01"), null);
});
test("Une entrée sans calories invalide toute sa journée, zéro est renseigné", () => {
  const s = initialState();
  s.settings.basal = 1800;
  s.entries = [entry("2026-10-01", 0), entry("2026-10-01", null, "second")];
  assert.equal(balance(s, "2026-10-01"), null);
  s.entries.pop();
  assert.equal(balance(s, "2026-10-01")!.count, 1);
});
test("Les références historiques ne changent pas avec le basal courant", () => {
  const s = initialState();
  s.settings.basal = 1900;
  s.days["2026-09-30"] = { basal: 1600, target: 1800 };
  assert.equal(basal(s, "2026-09-30"), 1600);
  assert.equal(expense(s, "2026-09-30"), 1613.5);
  assert.equal(basal(s, "2026-10-01"), 1900);
});
test("Float32 : quantités et cumul comme Kotlin, pas d’arrondi entier prématuré", () => {
  const food: Food = {
    ...seedFoods[0],
    kcalPer100: 89,
    proteinPer100: 1.09,
    carbsPer100: 22.8,
    fatPer100: 0.33,
  };
  const values = nutrients(food, 123.4);
  assert.equal(values[0], 109.82599639892578);
  const totals = mealTotals(
    [
      { id: "a", foodId: food.id, quantity: 123.4, isVariable: false },
      { id: "b", foodId: food.id, quantity: 123.4, isVariable: true },
    ],
    [food],
  );
  assert.equal(totals[0], Math.fround(values[0] + values[0]));
});
test("La base alimentaire ne se modifie pas entre snapshots", () => {
  const a = initialState();
  a.foods[0].usageCount = 99;
  assert.equal(initialState().foods[0].usageCount, 0);
});
test("Dates locales, changement d’heure et recherche sans accents", () => {
  assert.equal(shiftDay("2026-03-29", -1), "2026-03-28");
  assert.equal(shiftDay("2026-10-25", 1), "2026-10-26");
  assert.equal(normalize("  CRÈME Épaisse "), "creme epaisse");
});
test("FIT : priorité session, regroupement journalier et cadence", () => {
  const metrics = sessionMetrics(
    [
      {
        startTime: new Date("2026-10-01T12:00:00"),
        sport: "running",
        totalCycles: 1200,
        totalCalories: 300,
      },
      {
        startTime: new Date("2026-10-01T15:00:00"),
        sport: "cycling",
        totalCycles: 900,
        totalCalories: 450,
      },
    ],
    "2026-10-01",
  );
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].steps, 1200);
  assert.equal(metrics[0].coveredSteps, 1200);
  assert.equal(metrics[0].calories, 750);
  assert.equal(estimateSteps(80, 600, 1600), 1600);
  assert.equal(estimateSteps(80, 600, 800), 800);
});
test("Aller-retour JSON et CSV web complet, photos et mensurations incluses", () => {
  const s = initialState();
  const today = dayKey();
  s.settings.first = today;
  s.entries = [
    {
      ...entry(today, null),
      note: 'guillemets " ;\nligne',
      imagePath: "data:image/png;base64,abc",
    },
  ];
  s.days[today] = {
    weightKg: 80.5,
    basal: 1800,
    steps: 1200,
    measurements: { Taille: 83.5 },
    measurementHistory: [],
  };
  assert.deepEqual(importJSON(exportJSON(s)), s);
  assert.deepEqual(importCSV(exportCSV(s)).state, s);
});
test("CSV Android : calories null, zéro, pas et dépense préservés", () => {
  const csv =
    '"record_type";"date";"id";"name";"calories";"steps";"basal_kcal";"target_kcal";"fit_activity_kcal";"fit_covered_steps"\n"DAY_SUMMARY";"2026-10-01";;;;"3300";"1800";"2000";"400";"2000"\n"FOOD_LOG";"2026-10-01";"1";"Extra";"";;;;;\n"FOOD_LOG";"2026-10-01";"2";"Eau";"0";;;;;';
  const { state, warnings } = importCSV(csv);
  assert.equal(state.entries[0].calories, null);
  assert.equal(state.entries[1].calories, 0);
  assert.equal(expense(state, "2026-10-01"), 2258.5);
  assert.ok(warnings.length);
});
test("CSV Android : accepte DAILY_SUMMARY et conserve la date initiale", () => {
  const { state, warnings } = importCSV(
    "record_type;date;basal_kcal;target_kcal;steps;fit_activity_kcal;fit_covered_steps\nDAILY_SUMMARY;2026-01-02;1700;2000;1300;100;1000",
  );
  assert.equal(state.settings.first, "2026-01-02");
  assert.equal(state.settings.basal, 1700);
  assert.equal(steps(state.days["2026-01-02"]), 1300);
  assert.equal(expense(state, "2026-01-02"), 1813.5);
  assert.ok(!warnings.some((w) => w.includes("Type non pris en charge")));
});
test("Import invalide rejeté avant mutation", () => {
  assert.throws(() =>
    importJSON('{"format":"logger-web","version":2,"state":{}}'),
  );
  const s = initialState();
  s.entries = [entry("2026-10-01", -1)];
  assert.throws(() => validateState(s));
  assert.throws(() => parseCSV('record_type;name\n"FOOD_LOG;inachevé'));
});
