import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  dailyBudget,
  target,
  dayKey,
  timestamp,
} from "../src/domain";

test("Budget dynamique : dépenses moins déficit, puis repas, indépendant de l’ancien objectif fixe", () => {
  const s = initialState(),
    day = dayKey();
  s.settings.basal = 1800;
  s.settings.deficitGoal = 300;
  s.settings.target = 9999;
  s.days[day] = { target: 9999, manualActivityCalories: 100 };
  s.entries.push({
    id: "meal",
    timestamp: timestamp(day),
    type: "meal",
    foodName: "Test",
    calories: 500,
  });
  assert.equal(target(s, day), 1613.5);
  assert.equal(dailyBudget(s, day)!.remaining, 1113.5);
  s.days[day].manualActivityCalories = 250;
  assert.equal(dailyBudget(s, day)!.remaining, 1263.5);
  s.days[day].steps = 1000;
  assert.equal(dailyBudget(s, day)!.remaining, 1308.5);
  s.days[day].fitCalories = 200;
  assert.equal(dailyBudget(s, day)!.remaining, 1508.5);
});

test("Budget dynamique : métabolisme absent, déficit supérieur aux dépenses et repas incomplets", () => {
  const s = initialState(),
    day = dayKey();
  assert.equal(dailyBudget(s, day), null);
  s.settings.basal = 1800;
  s.settings.deficitGoal = 2000;
  assert.equal(dailyBudget(s, day)!.possible, false);
  assert.equal(target(s, day), 0);
  s.settings.deficitGoal = 300;
  s.entries.push({
    id: "unknown",
    timestamp: timestamp(day),
    type: "extra",
    foodName: "Test",
    calories: null,
  });
  assert.equal(dailyBudget(s, day)!.partial, true);
  s.entries[0].calories = 1700;
  assert.equal(dailyBudget(s, day)!.partial, false);
  assert.equal(dailyBudget(s, day)!.remaining, -186.5);
});
