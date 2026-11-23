import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultNotificationPreferences,
  parseNotificationPreferences,
  dueReminders,
  localClock,
  isMissing,
  mealForEntry,
  type NotificationSnapshot,
} from "../supabase/functions/_shared/notification-rules";
const snapshot = (): NotificationSnapshot => ({ day: {}, entries: [] });
const at = (time: string) => new Date(`2026-11-23T${time}:00+01:00`);

test("désactivé par défaut ; activation et premier rappel seulement à l'heure choisie", () => {
  const p = defaultNotificationPreferences();
  p.weight.enabled = true;
  assert.deepEqual(dueReminders(p, snapshot(), [], at("10:00")), []);
  p.enabled = true;
  assert.deepEqual(dueReminders(p, snapshot(), [], at("08:59")), []);
  assert.equal(dueReminders(p, snapshot(), [], at("09:00"))[0].kind, "weight");
  assert.equal(
    dueReminders(p, snapshot(), [], at("09:01"))[0].key,
    dueReminders(p, snapshot(), [], at("09:00"))[0].key,
  );
});
test("poids et pas : zéro pas saisi compte comme complété, pas les 300 pas automatiques", () => {
  const p = defaultNotificationPreferences(),
    s = snapshot();
  assert.equal(isMissing("steps", p, s, "2026-11-23"), true);
  s.day.steps = 0;
  assert.equal(isMissing("steps", p, s, "2026-11-23"), false);
  delete s.day.steps;
  s.day.fitSteps = 1200;
  assert.equal(isMissing("steps", p, s, "2026-11-23"), false);
  s.day.weightKg = 0;
  assert.equal(isMissing("weight", p, s, "2026-11-23"), true);
  s.day.weightKg = 70;
  assert.equal(isMissing("weight", p, s, "2026-11-23"), false);
});
test("chaque repas a son créneau, les calories manquantes empêchent de le considérer complet", () => {
  const p = defaultNotificationPreferences(),
    s = snapshot();
  const breakfast = {
    timestamp: at("08:10").getTime(),
    type: "food",
    calories: 300,
  };
  assert.equal(mealForEntry(breakfast, p), "breakfast");
  s.entries.push(breakfast);
  assert.equal(isMissing("meal:breakfast", p, s, "2026-11-23"), false);
  assert.equal(isMissing("meal:lunch", p, s, "2026-11-23"), true);
  s.entries.push({ ...breakfast, calories: null });
  assert.equal(isMissing("meal:breakfast", p, s, "2026-11-23"), true);
  s.day.notificationMeals = { breakfast: "skipped" };
  assert.equal(isMissing("meal:breakfast", p, s, "2026-11-23"), false);
  p.meals.snack.expected = false;
  assert.equal(isMissing("meal:snack", p, s, "2026-11-23"), false);
  assert.equal(
    mealForEntry({ ...breakfast, timestamp: at("16:00").getTime() }, p),
    "lunch",
  );
});
test("une boisson ou le petit-déjeuner de la veille ne complète pas le repas du jour", () => {
  const p = defaultNotificationPreferences(),
    s = snapshot();
  s.entries.push(
    { timestamp: at("08:00").getTime(), type: "drink", calories: 0 },
    {
      timestamp: new Date("2026-11-22T08:00:00+01:00").getTime(),
      type: "food",
      calories: 500,
    },
  );
  assert.equal(isMissing("meal:breakfast", p, s, "2026-11-23"), true);
});
test("avant-repas : indépendant des saisies, aucun rattrapage après le repas", () => {
  const p = defaultNotificationPreferences();
  p.enabled = true;
  p.meals.lunch.before = true;
  const s = snapshot();
  s.day.notificationMeals = { lunch: "skipped" };
  assert.equal(dueReminders(p, s, [], at("12:14")).length, 0);
  assert.equal(dueReminders(p, s, [], at("12:15"))[0].kind, "before:lunch");
  assert.equal(dueReminders(p, s, [], at("12:20")).length, 0);
  assert.equal(dueReminders(p, s, [], at("12:30")).length, 0);
});
test("plus tard : 45 minutes, cycles dédupliqués, arrêt après saisie, à 22 h et au changement de jour", () => {
  const p = defaultNotificationPreferences();
  p.enabled = true;
  p.weight.enabled = true;
  const s = snapshot(),
    snooze = [
      {
        kind: "weight" as const,
        day: "2026-11-23",
        started_at: at("09:10").toISOString(),
      },
    ];
  assert.equal(dueReminders(p, s, snooze, at("09:54")).length, 0);
  const first = dueReminders(p, s, snooze, at("09:55"))[0];
  assert.ok(first.key.includes(":later:"));
  assert.equal(first.key, dueReminders(p, s, snooze, at("09:56"))[0].key);
  assert.notEqual(first.key, dueReminders(p, s, snooze, at("10:40"))[0].key);
  s.day.weightKg = 70;
  assert.equal(dueReminders(p, s, snooze, at("10:40")).length, 0);
  delete s.day.weightKg;
  assert.equal(dueReminders(p, s, snooze, at("22:00")).length, 0);
  assert.ok(
    !dueReminders(
      p,
      s,
      snooze,
      new Date("2026-11-24T09:55:00+01:00"),
    )[0].key.includes(":later:"),
  );
});
test("heure de Paris et changement d'heure : le calendrier local reste correct", () => {
  assert.deepEqual(
    localClock(new Date("2026-07-01T06:30:00Z"), "Europe/Paris"),
    { day: "2026-07-01", minute: 510 },
  );
  assert.deepEqual(
    localClock(new Date("2026-11-23T07:30:00Z"), "Europe/Paris"),
    { day: "2026-11-23", minute: 510 },
  );
  assert.deepEqual(
    localClock(new Date("2026-11-22T23:30:00Z"), "Europe/Paris"),
    { day: "2026-11-23", minute: 30 },
  );
});
test("validation stricte des horaires et projection sans propriétés supplémentaires", () => {
  const p = defaultNotificationPreferences();
  assert.equal(parseNotificationPreferences(p).version, 1);
  assert.throws(() => parseNotificationPreferences({ ...p, stopAt: "25:00" }));
  assert.throws(() =>
    parseNotificationPreferences({ ...p, timezone: "invalid" }),
  );
  assert.throws(() => parseNotificationPreferences({ ...p, beforeMinutes: 0 }));
  assert.equal(
    "secret" in parseNotificationPreferences({ ...p, secret: "ignored" }),
    false,
  );
  p.meals.lunch.time = "07:00";
  assert.throws(() => parseNotificationPreferences(p));
});
test("minuit termine la journée ; un rappel après l’heure d’arrêt est refusé", () => {
  const p = defaultNotificationPreferences();
  p.enabled = true;
  p.weight.enabled = true;
  p.weight.time = "23:00";
  assert.throws(() => parseNotificationPreferences(p));
  p.stopAt = "00:00";
  assert.equal(parseNotificationPreferences(p).stopAt, "00:00");
  assert.equal(dueReminders(p, snapshot(), [], at("23:01"))[0].kind, "weight");
});
