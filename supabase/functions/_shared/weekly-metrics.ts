import { localClock } from "./notification-rules.ts";
export const weeklyTimezone = "Europe/Paris";
export function shiftWeekDay(day: string, days: number) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function weekCutoff(start: string): Date {
  const day = shiftWeekDay(start, 6),
    guess = new Date(`${day}T21:00:00Z`);
  return new Date(
    guess.getTime() -
      (localClock(guess, weeklyTimezone).minute - 21 * 60) * 60_000,
  );
}
export function latestRecapWeek(now: Date): string {
  const clock = localClock(now, weeklyTimezone),
    weekday = new Date(`${clock.day}T12:00:00Z`).getUTCDay();
  const monday = shiftWeekDay(clock.day, -((weekday + 6) % 7));
  return weekday === 0 && clock.minute >= 1260
    ? monday
    : shiftWeekDay(monday, -7);
}
export function isRecapWeek(value: unknown, now: Date): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCDay() === 1 &&
    value <= latestRecapWeek(now) &&
    value >= shiftWeekDay(latestRecapWeek(now), -52 * 7)
  );
}
interface RecapDay {
  isDeleted?: boolean;
  basal?: number;
  steps?: number;
  fitSteps?: number;
  fitCalories?: number;
  fitCoveredSteps?: number;
  manualActivityCalories?: number;
  weightKg?: number;
  measurements?: Record<string, number>;
}
export interface RecapEntry {
  timestamp: number;
  calories?: number | null;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
}
export interface WeeklySource {
  settings: { basal?: number; birthDate?: string; deficitGoal?: number };
  days: Record<string, RecapDay>;
  entries: RecapEntry[];
}
export interface WeeklyValue {
  average: number | null;
  days: number;
}
export interface WeekNumbers {
  calories: {
    intake: number | null;
    spent: number | null;
    deficit: number | null;
    intakeDays: number;
    spentDays: number;
    balanceDays: number;
  };
  nutrients: { protein: WeeklyValue; carbs: WeeklyValue; fat: WeeklyValue };
  activity: { steps: number | null; days: number; activeDays: number };
  weight: WeeklyValue;
  measurements: Record<string, number>;
  entries: number;
  missingCalories: number;
  daily: {
    date: string;
    calories: number | null;
    steps: number | null;
    weight: number | null;
  }[];
}
export interface WeeklyMetrics {
  version: 1;
  start: string;
  end: string;
  cutoff: string;
  timezone: string;
  week: WeekNumbers;
  previous: WeekNumbers;
  changes: {
    intake: number | null;
    steps: number | null;
    weight: number | null;
  };
  goalDeficit: number | null;
  hasData: boolean;
}
const number = (value: unknown, max = 1e8): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= max;
const round = (v: number) => Math.round(v * 100) / 100;
const average = (values: number[]) =>
  values.length
    ? round(values.reduce((a, b) => a + b, 0) / values.length)
    : null;
function numbers(source: WeeklySource, start: string): WeekNumbers {
  const intake: number[] = [],
    spent: number[] = [],
    deficits: number[] = [],
    recordedSteps: number[] = [],
    weights: number[] = [];
  const protein: number[] = [],
    carbs: number[] = [],
    fat: number[] = [],
    measurements: Record<string, number> = {};
  let entryCount = 0,
    missingCalories = 0,
    activeDays = 0;
  const cutoff = weekCutoff(start).getTime(),
    byDay = new Map<string, RecapEntry[]>();
  for (const entry of source.entries) {
    if (!number(entry.timestamp, 8.64e15) || entry.timestamp > cutoff) continue;
    const day = localClock(new Date(entry.timestamp), weeklyTimezone).day;
    if (day < start || day > shiftWeekDay(start, 6)) continue;
    const list = byDay.get(day) ?? [];
    list.push(entry);
    byDay.set(day, list);
  }
  const daily: WeekNumbers["daily"] = [];
  for (let i = 0; i < 7; i++) {
    const date = shiftWeekDay(start, i),
      day = source.days[date] ?? {},
      entries = day.isDeleted ? [] : (byDay.get(date) ?? []);
    entryCount += entries.length;
    missingCalories += entries.filter((e) => !number(e.calories, 30000)).length;
    const kcal =
      entries.length && entries.every((e) => number(e.calories, 30000))
        ? Math.fround(entries.reduce((sum, e) => sum + e.calories!, 0))
        : null;
    if (kcal !== null) {
      intake.push(kcal);
      for (const [key, values] of [
        ["proteinGrams", protein],
        ["carbsGrams", carbs],
        ["fatGrams", fat],
      ] as const)
        if (entries.every((e) => number(e[key], 20000)))
          values.push(entries.reduce((sum, e) => sum + e[key]!, 0));
    }
    const hasSteps =
      !day.isDeleted && (number(day.steps) || number(day.fitSteps));
    const steps = hasSteps
      ? 300 +
        (number(day.steps) ? day.steps : 0) +
        (number(day.fitSteps) ? day.fitSteps : 0)
      : null;
    if (steps !== null) recordedSteps.push(steps);
    const base =
      number(day.basal, 20000) && day.basal > 0
        ? day.basal
        : !source.settings.birthDate &&
            number(source.settings.basal, 20000) &&
            source.settings.basal > 0
          ? source.settings.basal
          : null;
    if (base !== null && steps !== null) {
      const f = Math.fround;
      const activity = f(
        f(
          f(
            f(
              Math.max(
                0,
                steps - (number(day.fitCoveredSteps) ? day.fitCoveredSteps : 0),
              ),
            ) * f(0.045),
          ) + f(number(day.fitCalories) ? day.fitCalories : 0),
        ) +
          f(
            number(day.manualActivityCalories) ? day.manualActivityCalories : 0,
          ),
      );
      const expense = f(f(base) + activity);
      spent.push(expense);
      if (kcal !== null) deficits.push(f(f(expense) - f(kcal)));
    }
    if (
      !day.isDeleted &&
      ((number(day.fitCalories) && day.fitCalories > 0) ||
        (number(day.manualActivityCalories) && day.manualActivityCalories > 0))
    )
      activeDays++;
    const weight =
      !day.isDeleted && number(day.weightKg, 1000) && day.weightKg > 0
        ? day.weightKg
        : null;
    if (weight !== null) weights.push(weight);
    if (
      !day.isDeleted &&
      day.measurements &&
      typeof day.measurements === "object"
    )
      for (const [zone, value] of Object.entries(day.measurements).slice(0, 40))
        if (zone.length <= 100 && number(value, 1000))
          measurements[zone] = value;
    daily.push({ date, calories: kcal, steps, weight });
  }
  return {
    calories: {
      intake: average(intake),
      spent: average(spent),
      deficit: average(deficits),
      intakeDays: intake.length,
      spentDays: spent.length,
      balanceDays: deficits.length,
    },
    nutrients: {
      protein: { average: average(protein), days: protein.length },
      carbs: { average: average(carbs), days: carbs.length },
      fat: { average: average(fat), days: fat.length },
    },
    activity: {
      steps: average(recordedSteps),
      days: recordedSteps.length,
      activeDays,
    },
    weight: { average: average(weights), days: weights.length },
    measurements,
    entries: entryCount,
    missingCalories,
    daily,
  };
}
export function computeWeeklyMetrics(
  source: WeeklySource,
  start: string,
): WeeklyMetrics {
  const week = numbers(source, start),
    previous = numbers(source, shiftWeekDay(start, -7));
  const difference = (a: number | null, b: number | null) =>
    a !== null && b !== null ? round(a - b) : null;
  return {
    version: 1,
    start,
    end: shiftWeekDay(start, 6),
    cutoff: weekCutoff(start).toISOString(),
    timezone: weeklyTimezone,
    week,
    previous,
    changes: {
      intake: difference(week.calories.intake, previous.calories.intake),
      steps: difference(week.activity.steps, previous.activity.steps),
      weight:
        week.weight.days >= 3 && previous.weight.days >= 3
          ? difference(week.weight.average, previous.weight.average)
          : null,
    },
    goalDeficit: number(source.settings.deficitGoal, 10000)
      ? source.settings.deficitGoal
      : null,
    hasData:
      week.entries > 0 ||
      week.activity.days > 0 ||
      week.weight.days > 0 ||
      Object.keys(week.measurements).length > 0,
  };
}
