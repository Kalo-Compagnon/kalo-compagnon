import type { Day } from "./domain";
export const categories = {
  weight: "Poids et progression",
  measurements: "Mensurations",
  activity: "Activité physique",
  goals: "Objectifs",
  food: "Calories et alimentation",
} as const;
export type Category = keyof typeof categories;
export type Sharing = Record<Category, boolean>;
export const privateSharing = (): Sharing => ({
  weight: false,
  measurements: false,
  activity: false,
  goals: false,
  food: false,
});
export function relativeWeights(days: Record<string, Day>) {
  const records = Object.entries(days)
    .filter(([, d]) => Number.isFinite(d.weightKg) && d.weightKg! > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const baseline = records[0];
  return records.map(([date, d]) => ({
    date,
    percent: 100 * (d.weightKg! / baseline[1].weightKg! - 1),
  }));
}
