import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageOn,
  rollingWeight,
  profileBasal,
  basal,
  initialState,
  dayKey,
  shiftDay,
} from "../src/domain";
import { exportJSON, importJSON } from "../src/transfer";

test("Âge : anniversaire exact, année bissextile et dates invalides", () => {
  assert.equal(ageOn("1996-11-05", "2026-11-04"), 29);
  assert.equal(ageOn("1996-11-05", "2026-11-05"), 30);
  assert.equal(ageOn("2000-02-29", "2025-02-28"), 24);
  assert.equal(ageOn("2000-02-29", "2025-03-01"), 25);
  assert.equal(ageOn("2026-02-30", "2026-11-04"), null);
  assert.equal(ageOn("2027-01-01", "2026-11-04"), null);
  assert.equal(ageOn("", "2026-11-04"), null);
});

test("Poids : sept dernières journées enregistrées, sans compter les jours vides ni futurs", () => {
  const s = initialState();
  assert.equal(rollingWeight(s, "2026-11-04"), null);
  s.days = Object.fromEntries(
    [
      "2026-10-02",
      "2026-10-08",
      "2026-10-11",
      "2026-10-15",
      "2026-10-22",
      "2026-10-30",
      "2026-11-04",
    ].map((day, i) => [day, { weightKg: 70 + 2 * i }]),
  );
  s.days["2026-10-01"] = { weightKg: 200 };
  s.days["2026-11-05"] = { weightKg: 300 };
  s.days["2026-11-03"] = {};
  assert.deepEqual(rollingWeight(s, "2026-11-04"), { value: 76, count: 7 });
  const empty = initialState();
  empty.days["2026-11-01"] = { weightKg: 80 };
  empty.days["2026-11-04"] = { weightKg: 84 };
  assert.deepEqual(rollingWeight(empty, "2026-11-04"), { value: 82, count: 2 });
});

test("Métabolisme : moyenne mise à jour automatiquement, historique conservé, ancien profil compatible", () => {
  const s = initialState(),
    today = dayKey(),
    past = shiftDay(today, -1);
  s.settings.basal = 1800;
  s.days[past] = { basal: 1500, weightKg: 80 };
  assert.equal(basal(s, today), 1800);
  s.settings.birthDate = "1990-01-01";
  s.settings.height = 180;
  const first = profileBasal(s, today);
  assert.equal(basal(s, today), first);
  s.days[today] = { basal: 9999, weightKg: 90 };
  assert.equal(basal(s, today), first + 50);
  assert.equal(basal(s, past), 1500);
  delete s.days[today].weightKg;
  assert.equal(basal(s, today), first);
  delete s.days[past].weightKg;
  assert.equal(basal(s, today), 0);
  assert.equal(basal(s, past), 1500);
});

test("Date de naissance : sauvegardée et validée sans inventer celle d’un ancien profil", () => {
  const s = initialState();
  assert.equal(importJSON(exportJSON(s)).settings.birthDate, undefined);
  s.settings.birthDate = "1990-01-01";
  assert.deepEqual(importJSON(exportJSON(s)), s);
  s.settings.birthDate = "1990-02-30";
  assert.throws(() => importJSON(exportJSON(s)), /date de naissance/);
});
