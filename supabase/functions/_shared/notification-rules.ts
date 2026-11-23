export const mealSlots = ["breakfast", "lunch", "snack", "dinner"] as const;
export type MealSlot = (typeof mealSlots)[number];
export type MissingKind = "weight" | "steps" | `meal:${MealSlot}`;
export const mealLabels: Record<MealSlot, string> = {
  breakfast: "Petit-déjeuner",
  lunch: "Déjeuner",
  snack: "Goûter",
  dinner: "Dîner",
};
export interface NotificationPreferences {
  version: 1;
  enabled: boolean;
  timezone: string;
  stopAt: string;
  weight: { enabled: boolean; time: string };
  steps: { enabled: boolean; time: string };
  mealsMissing: boolean;
  missingAfterMinutes: number;
  beforeMinutes: number;
  meals: Record<MealSlot, { expected: boolean; time: string; before: boolean }>;
}
export const defaultNotificationPreferences = (): NotificationPreferences => ({
  version: 1,
  enabled: false,
  timezone: "Europe/Paris",
  stopAt: "22:00",
  weight: { enabled: false, time: "09:00" },
  steps: { enabled: false, time: "21:00" },
  mealsMissing: false,
  missingAfterMinutes: 45,
  beforeMinutes: 15,
  meals: {
    breakfast: { expected: true, time: "08:00", before: false },
    lunch: { expected: true, time: "12:30", before: false },
    snack: { expected: true, time: "16:30", before: false },
    dinner: { expected: true, time: "20:00", before: false },
  },
});
export function minutes(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}
export const stopMinute = (p: NotificationPreferences) =>
  minutes(p.stopAt) || 1440;
export function localClock(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    minute: Number(part("hour")) * 60 + Number(part("minute")),
  };
}
export function parseNotificationPreferences(
  value: unknown,
): NotificationPreferences {
  const p = value as NotificationPreferences;
  const time = (v: unknown) =>
    typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (
    !p ||
    p.version !== 1 ||
    typeof p.enabled !== "boolean" ||
    typeof p.timezone !== "string" ||
    p.timezone.length > 100 ||
    !time(p.stopAt)
  )
    throw new Error("Réglages de notifications invalides.");
  try {
    localClock(new Date(), p.timezone);
  } catch {
    throw new Error("Fuseau horaire invalide.");
  }
  for (const rule of [p.weight, p.steps])
    if (!rule || typeof rule.enabled !== "boolean" || !time(rule.time))
      throw new Error("Horaire de rappel invalide.");
  if (
    typeof p.mealsMissing !== "boolean" ||
    ![15, 30, 45, 60, 90, 120].includes(p.missingAfterMinutes) ||
    ![5, 10, 15, 20, 30, 45, 60].includes(p.beforeMinutes)
  )
    throw new Error("Délai de rappel invalide.");
  for (const slot of mealSlots) {
    const meal = p.meals?.[slot];
    if (
      !meal ||
      !time(meal.time) ||
      typeof meal.expected !== "boolean" ||
      typeof meal.before !== "boolean"
    )
      throw new Error("Horaire de repas invalide.");
    if (meal.before && minutes(meal.time) < p.beforeMinutes)
      throw new Error(
        "Le rappel avant repas doit rester dans la même journée.",
      );
  }
  for (let i = 1; i < mealSlots.length; i++)
    if (
      minutes(p.meals[mealSlots[i]].time) <=
      minutes(p.meals[mealSlots[i - 1]].time)
    )
      throw new Error(
        "Les repas doivent suivre l’ordre petit-déjeuner, déjeuner, goûter et dîner.",
      );
  for (const [label, rule] of [
    ["pesée", p.weight],
    ["pas", p.steps],
  ] as const) {
    if (rule.enabled && minutes(rule.time) >= stopMinute(p))
      throw new Error(`Le rappel de ${label} doit précéder l’heure d’arrêt.`);
  }
  for (const slot of mealSlots) {
    const meal = p.meals[slot];
    if (
      p.mealsMissing &&
      meal.expected &&
      minutes(meal.time) + p.missingAfterMinutes >= stopMinute(p)
    )
      throw new Error(
        `Le rappel après ${mealLabels[slot].toLocaleLowerCase("fr")} doit précéder l’heure d’arrêt.`,
      );
    if (meal.before && minutes(meal.time) - p.beforeMinutes >= stopMinute(p))
      throw new Error(
        `Le rappel avant ${mealLabels[slot].toLocaleLowerCase("fr")} doit précéder l’heure d’arrêt.`,
      );
  }
  // Explicit projection: do not retain extra user-supplied fields.
  return {
    version: 1,
    enabled: p.enabled,
    timezone: p.timezone,
    stopAt: p.stopAt,
    weight: { enabled: p.weight.enabled, time: p.weight.time },
    steps: { enabled: p.steps.enabled, time: p.steps.time },
    mealsMissing: p.mealsMissing,
    missingAfterMinutes: p.missingAfterMinutes,
    beforeMinutes: p.beforeMinutes,
    meals: Object.fromEntries(
      mealSlots.map((slot) => [
        slot,
        {
          expected: p.meals[slot].expected,
          time: p.meals[slot].time,
          before: p.meals[slot].before,
        },
      ]),
    ) as NotificationPreferences["meals"],
  };
}
export interface NotificationDay {
  weightKg?: number;
  steps?: number;
  fitSteps?: number;
  notificationMeals?: Partial<Record<MealSlot, "skipped">>;
}
export interface NotificationEntry {
  timestamp: number;
  calories: number | null;
  type: string;
  mealSlot?: MealSlot;
}
export interface NotificationSnapshot {
  day: NotificationDay;
  entries: NotificationEntry[];
}
export function mealForEntry(
  entry: NotificationEntry,
  p: NotificationPreferences,
): MealSlot {
  if (entry.mealSlot && mealSlots.includes(entry.mealSlot))
    return entry.mealSlot;
  const minute = localClock(new Date(entry.timestamp), p.timezone).minute;
  const expected = mealSlots.filter((slot) => p.meals[slot].expected);
  const slots = expected.length ? expected : [...mealSlots];
  return slots.reduce((best, slot) =>
    Math.abs(minute - minutes(p.meals[slot].time)) <
    Math.abs(minute - minutes(p.meals[best].time))
      ? slot
      : best,
  );
}
export function isMissing(
  kind: MissingKind,
  p: NotificationPreferences,
  snapshot: NotificationSnapshot,
  day: string,
): boolean {
  if (kind === "weight")
    return !(
      Number.isFinite(snapshot.day.weightKg) && snapshot.day.weightKg! > 0
    );
  if (kind === "steps")
    return ![snapshot.day.steps, snapshot.day.fitSteps].some(
      (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
    );
  const slot = kind.slice(5) as MealSlot;
  if (!mealSlots.includes(slot)) return false;
  if (
    !p.meals[slot].expected ||
    snapshot.day.notificationMeals?.[slot] === "skipped"
  )
    return false;
  const entries = snapshot.entries.filter(
    (e) =>
      Number.isFinite(e.timestamp) &&
      e.type !== "drink" &&
      localClock(new Date(e.timestamp), p.timezone).day === day &&
      mealForEntry(e, p) === slot,
  );
  return (
    entries.length === 0 ||
    entries.some((e) => e.calories === null || !Number.isFinite(e.calories))
  );
}
export const kindLabel = (kind: MissingKind) =>
  kind === "weight"
    ? "Pesée"
    : kind === "steps"
      ? "Pas"
      : mealLabels[kind.slice(5) as MealSlot];
export interface Snooze {
  kind: MissingKind;
  day: string;
  started_at: string;
}
export interface Reminder {
  key: string;
  kind: MissingKind | `before:${MealSlot}` | "weekly";
  day: string;
  title: string;
  body: string;
  ttl: number;
}
export function dueReminders(
  p: NotificationPreferences,
  snapshot: NotificationSnapshot,
  snoozes: Snooze[],
  now: Date,
): Reminder[] {
  if (!p.enabled) return [];
  const clock = localClock(now, p.timezone),
    result: Reminder[] = [];
  if (clock.minute >= stopMinute(p)) return [];
  const missingRules: { kind: MissingKind; enabled: boolean; at: number }[] = [
    { kind: "weight", enabled: p.weight.enabled, at: minutes(p.weight.time) },
    { kind: "steps", enabled: p.steps.enabled, at: minutes(p.steps.time) },
    ...mealSlots.map((slot) => ({
      kind: `meal:${slot}` as MissingKind,
      enabled: p.mealsMissing && p.meals[slot].expected,
      at: minutes(p.meals[slot].time) + p.missingAfterMinutes,
    })),
  ];
  for (const rule of missingRules) {
    if (!rule.enabled || !isMissing(rule.kind, p, snapshot, clock.day))
      continue;
    const snooze = snoozes.find(
      (s) => s.kind === rule.kind && s.day === clock.day,
    );
    if (snooze) {
      const elapsed = now.getTime() - new Date(snooze.started_at).getTime();
      if (elapsed < 45 * 60_000 || !Number.isFinite(elapsed)) continue;
      const cycle = Math.floor(elapsed / (45 * 60_000));
      result.push({
        key: `${clock.day}:${rule.kind}:later:${snooze.started_at}:${cycle}`,
        kind: rule.kind,
        day: clock.day,
        title: `${kindLabel(rule.kind)} à compléter`,
        body: "Tu avais choisi « Plus tard ». Pense à compléter ta saisie.",
        ttl: 300,
      });
    } else if (clock.minute >= rule.at) {
      result.push({
        key: `${clock.day}:${rule.kind}:missing`,
        kind: rule.kind,
        day: clock.day,
        title: `${kindLabel(rule.kind)} à compléter`,
        body: "Ouvre ton journal pour compléter ta saisie.",
        ttl: 300,
      });
    }
  }
  for (const slot of mealSlots) {
    const meal = p.meals[slot],
      at = minutes(meal.time),
      due = at - p.beforeMinutes;
    // No catch-up after the meal, and no burst of stale reminders after downtime.
    if (
      meal.before &&
      clock.minute >= due &&
      clock.minute < Math.min(at, due + 5)
    )
      result.push({
        key: `${clock.day}:before:${slot}`,
        kind: `before:${slot}`,
        day: clock.day,
        title: `Bientôt le ${mealLabels[slot].toLocaleLowerCase("fr")}`,
        body: "Pense à photographier ou peser ton repas avant de commencer.",
        ttl: Math.min(300, (at - clock.minute) * 60),
      });
  }
  return result;
}
