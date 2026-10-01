import seed from "./foods_seed.json";
export const f = Math.fround;
export const add = (a: number, b: number) => f(f(a) + f(b));
export const sub = (a: number, b: number) => f(f(a) - f(b));
export const mul = (a: number, b: number) => f(f(a) * f(b));
export const div = (a: number, b: number) => f(f(a) / f(b));
export const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("fr-FR")
    .trim();
export const fmt = (v: number) =>
  Number.isInteger(v)
    ? String(v)
    : v.toLocaleString("fr-FR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
        useGrouping: false,
      });
export function dayKey(date: Date | number = new Date()): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const parseDay = (s: string) =>
  new Date(
    Number(s.slice(0, 4)),
    Number(s.slice(5, 7)) - 1,
    Number(s.slice(8, 10)),
    12,
  );
export function shiftDay(s: string, amount: number) {
  const d = parseDay(s);
  d.setDate(d.getDate() + amount);
  return dayKey(d);
}
export const labelDay = (s: string) => parseDay(s).toLocaleDateString("fr-FR");
export const titleDay = (s: string) => {
  const v = parseDay(s).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return v[0].toUpperCase() + v.slice(1);
};
export function timestamp(day: string) {
  const d = parseDay(day),
    now = new Date();
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return d.getTime();
}
export interface Entry {
  id: string;
  timestamp: number;
  type: string;
  foodName: string;
  note?: string;
  imagePath?: string;
  tags?: string;
  quantityGrams?: number;
  quantityUnit?: string;
  calories: number | null;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
}
export interface Food {
  id: string;
  name: string;
  category: string;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  referenceUnit: string;
  isFavorite: boolean;
  usageCount: number;
  lastUsedAt?: number;
  isCustom: boolean;
}
export interface Ingredient {
  id: string;
  foodId: string;
  quantity: number;
  isVariable: boolean;
}
export interface Meal {
  id: string;
  name: string;
  ingredients: Ingredient[];
  cachedCalories: number;
  cachedProtein: number;
  cachedCarbs: number;
  cachedFat: number;
  isFavorite: boolean;
  usageCount: number;
  lastUsedAt?: number;
  createdAt: number;
  notes?: string;
  imagePath?: string;
}
export interface Day {
  basal?: number;
  target?: number;
  steps?: number;
  fitSteps?: number;
  fitCalories?: number;
  fitCoveredSteps?: number;
  measurements?: Record<string, number>;
  measurementHistory?: { timestamp: number; values: Record<string, number> }[];
}
export interface Settings {
  legacyRates?: Record<string, number>;
  legacyQuantities?: Record<string, number>;
  first: string;
  basal: number;
  target: number;
  deficitGoal: number;
  sex: "male" | "female";
  age: number;
  height: number;
  weight: number;
}
export interface Physical {
  id: string;
  timestamp: number;
  waistCm: number;
  weightKg?: number;
  imagePath?: string;
}
export interface FitImport {
  id: string;
  timestamp: number;
  name: string;
  size: number;
  hash: string;
  fingerprints: string[];
  days: string[];
  steps: number;
  calories: number;
  coveredSteps: number;
}
export interface State {
  settings: Settings;
  days: Record<string, Day>;
  entries: Entry[];
  foods: Food[];
  meals: Meal[];
  physical: Physical[];
  imports: FitImport[];
}
export const defaultSettings = (): Settings => ({
  first: dayKey(),
  basal: 0,
  target: 2000,
  deficitGoal: 800,
  sex: "male",
  age: 0,
  height: 0,
  weight: 0,
});
export const seedFoods: Food[] = seed.map((s, i) => ({
  id: `seed-${i + 1}`,
  name: s.name,
  category: s.category,
  kcalPer100: f(s.kcal),
  proteinPer100: f(s.protein),
  carbsPer100: f(s.carbs),
  fatPer100: f(s.fat),
  referenceUnit: s.unit,
  isFavorite: false,
  usageCount: 0,
  isCustom: false,
}));
export function initialState(): State {
  return {
    settings: defaultSettings(),
    days: {},
    entries: [],
    foods: seedFoods.map((food) => ({ ...food })),
    meals: [],
    physical: [],
    imports: [],
  };
}
export const zones = [
  "Épaules",
  "Poitrine",
  "Bras",
  "Taille",
  "Ventre",
  "Hanches",
  "Cuisse",
  "Mollet",
];
export const groups = [
  zones,
  zones.slice(0, 3),
  zones.slice(3, 6),
  zones.slice(6),
  ["Longueur", "Circonférence"],
];
export const basal = (s: State, d: string) =>
  (s.days[d]?.basal ?? 0) > 0 ? s.days[d].basal! : s.settings.basal;
export const target = (s: State, d: string) =>
  s.days[d]?.target ?? s.settings.target;
export const steps = (d: Day) =>
  300 + Math.max(0, d.steps ?? 0) + Math.max(0, d.fitSteps ?? 0);
export const activity = (d: Day) =>
  add(
    mul(Math.max(0, steps(d) - Math.max(0, d.fitCoveredSteps ?? 0)), f(0.045)),
    Math.max(0, d.fitCalories ?? 0),
  );
export const expense = (s: State, d: string) =>
  add(basal(s, d), activity(s.days[d] ?? {}));
export const entriesOn = (s: State, d: string) =>
  s.entries
    .filter((e) => dayKey(e.timestamp) === d)
    .sort((a, b) => b.timestamp - a.timestamp);
export const consumed = (s: State, d: string) =>
  f(entriesOn(s, d).reduce((a, e) => a + (e.calories ?? 0), 0));
export const complete = (s: State, d: string) => {
  const es = entriesOn(s, d);
  return (
    es.length > 0 && es.every((e) => e.calories !== null) && basal(s, d) > 0
  );
};
export function allDays(s: State, end = dayKey()) {
  const first = [
    s.settings.first,
    ...Object.keys(s.days),
    ...s.entries.map((e) => dayKey(e.timestamp)),
  ].sort()[0];
  const result: string[] = [];
  for (let d = end; d >= first; d = shiftDay(d, -1)) result.push(d);
  return result;
}
export function balance(s: State, end: string) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(end, -i)).filter(
    (d) => complete(s, d),
  );
  if (!days.length) return null;
  const food = div(
    f(
      days.reduce(
        (sum, d) =>
          sum + entriesOn(s, d).reduce((a, e) => a + (e.calories ?? 0), 0),
        0,
      ),
    ),
    days.length,
  );
  const spent = div(
      f(days.reduce((a, d) => a + expense(s, d), 0)),
      days.length,
    ),
    net = sub(food, spent);
  return {
    count: days.length,
    food,
    expense: spent,
    net,
    deficit: -net,
    cumulative: mul(-net, days.length),
  };
}
export function calculateBasal(
  sex: string,
  age: number,
  height: number,
  weight: number,
) {
  if (
    !Number.isInteger(age) ||
    age < 13 ||
    age > 120 ||
    height < 100 ||
    height > 250 ||
    weight < 30 ||
    weight > 350 ||
    ![age, height, weight].every(Number.isFinite)
  )
    throw new Error("Vérifie l’âge, la taille et le poids");
  return add(
    sub(add(mul(10, weight), mul(6.25, height)), mul(5, age)),
    sex === "male" ? 5 : -161,
  );
}
export function nutrients(food: Food, quantity: number): number[] {
  const factor = div(quantity, 100);
  return [
    food.kcalPer100,
    food.proteinPer100,
    food.carbsPer100,
    food.fatPer100,
  ].map((v) => mul(v, factor));
}
export function mealTotals(parts: Ingredient[], foods: Food[]): number[] {
  const totals = [0, 0, 0, 0];
  for (const part of parts) {
    const food = foods.find((x) => x.id === part.foodId);
    if (!food) throw new Error("Aliment introuvable dans le repas");
    nutrients(food, part.quantity).forEach(
      (v, i) => (totals[i] = add(totals[i], v)),
    );
  }
  return totals;
}
export function mealEntry(
  meal: Meal,
  foods: Food[],
  day: string,
  overrides: Record<string, number> = {},
): Entry {
  const parts = meal.ingredients.map((p) => ({
    ...p,
    quantity: overrides[p.id] ?? p.quantity,
  }));
  const v = parts.length
    ? mealTotals(parts, foods)
    : [
        meal.cachedCalories,
        meal.cachedProtein,
        meal.cachedCarbs,
        meal.cachedFat,
      ];
  return {
    id: crypto.randomUUID(),
    timestamp: timestamp(day),
    type: "meal",
    foodName: meal.name,
    imagePath: meal.imagePath,
    note: parts.length
      ? parts
          .map((p) => {
            const food = foods.find((x) => x.id === p.foodId)!;
            return `${food.name} ${fmt(p.quantity)} ${food.referenceUnit}`;
          })
          .join(" · ")
      : meal.notes,
    calories: v[0],
    proteinGrams: v[1],
    carbsGrams: v[2],
    fatGrams: v[3],
  };
}
export function estimateSteps(
  cadence: number,
  duration: number,
  distance: number,
) {
  if (cadence <= 0 || duration <= 0) return 0;
  const one = div(mul(cadence, duration), 60),
    two = mul(one, 2);
  const est =
    distance > 0
      ? Math.abs(sub(div(distance, Math.max(one, 1)), 1)) <=
        Math.abs(sub(div(distance, Math.max(two, 1)), 1))
        ? one
        : two
      : cadence < 120
        ? two
        : one;
  return Math.floor(Math.min(2147483647, Math.max(0, est)) + 0.5);
}
