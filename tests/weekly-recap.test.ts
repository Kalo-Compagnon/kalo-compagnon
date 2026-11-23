import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeWeeklyMetrics,
  latestRecapWeek,
  weekCutoff,
  isRecapWeek,
  shiftWeekDay,
  type WeeklySource,
} from "../supabase/functions/_shared/weekly-metrics";
import {
  createWeeklyService,
  googleFailureReason,
  type WeeklyBackend,
  type WeeklyReport,
} from "../supabase/functions/_shared/weekly-service";
const start = "2026-11-16";
test("diagnostic Google : catégorie fixe sans conserver la réponse du fournisseur", () => {
  assert.equal(
    googleFailureReason(
      503,
      "The model is overloaded. Please try again later.",
    ),
    "google_503_overloaded",
  );
  assert.equal(
    googleFailureReason(503, "This model is experiencing high demand."),
    "google_503_high_demand",
  );
  assert.equal(
    googleFailureReason(503, "private content"),
    "google_503_unknown",
  );
  assert.equal(googleFailureReason(429, "quota"), "google_429");
});
const source = (): WeeklySource => ({
  settings: { basal: 1500, deficitGoal: 300 },
  days: {},
  entries: [],
});
test("récap : dimanche 21 h à Paris, été/hiver, semaines complètes et historique borné", () => {
  assert.equal(latestRecapWeek(new Date("2026-11-22T19:59:00Z")), "2026-11-09");
  assert.equal(latestRecapWeek(new Date("2026-11-22T20:00:00Z")), start);
  assert.equal(latestRecapWeek(new Date("2026-11-23T08:00:00Z")), start);
  assert.equal(weekCutoff(start).toISOString(), "2026-11-22T20:00:00.000Z");
  assert.equal(
    weekCutoff("2026-06-29").toISOString(),
    "2026-07-05T19:00:00.000Z",
  );
  assert.equal(isRecapWeek("2026-11-23", new Date("2026-11-23")), false);
  assert.equal(isRecapWeek("2026-11-17", new Date("2026-11-23")), false);
  assert.equal(isRecapWeek(start, new Date("2026-11-23")), true);
});
test("récap : calcul exact, inconnus distincts de zéro et déficit sur les mêmes journées", () => {
  const s = source();
  s.days[start] = { steps: 0, basal: 1500, weightKg: 70 };
  s.days["2026-11-17"] = { steps: 1000, basal: 1500, weightKg: 71 };
  s.days["2026-11-18"] = { basal: 1500 };
  s.entries = [
    {
      timestamp: Date.parse(start + "T08:00:00+01:00"),
      calories: 1000,
      proteinGrams: 0,
      carbsGrams: 100,
      fatGrams: 20,
    },
    { timestamp: Date.parse("2026-11-17T12:00:00+01:00"), calories: null },
    { timestamp: Date.parse("2026-11-18T12:00:00+01:00"), calories: 2000 },
    { timestamp: Date.parse("2026-11-22T22:00:00+01:00"), calories: 9000 },
  ];
  const m = computeWeeklyMetrics(s, start);
  assert.equal(m.week.calories.intake, 1500);
  assert.equal(m.week.calories.intakeDays, 2);
  assert.equal(m.week.calories.spent, 1536);
  assert.equal(m.week.calories.deficit, 513.5);
  assert.equal(m.week.calories.balanceDays, 1);
  assert.equal(m.week.nutrients.protein.average, 0);
  assert.equal(m.week.nutrients.protein.days, 1);
  assert.equal(m.week.nutrients.carbs.average, 100);
  assert.equal(m.week.activity.steps, 800);
  assert.equal(m.week.activity.days, 2);
  assert.equal(m.week.missingCalories, 1);
  assert.equal(m.week.entries, 3);
  assert.equal(m.week.weight.average, 70.5);
  assert.equal(m.changes.weight, null);
});
test("récap : poids comparé sur au moins trois pesées ; jours supprimés et métabolisme absent exclus", () => {
  const s = source();
  for (let i = 0; i < 3; i++) {
    s.days[shiftWeekDay(start, i)] = { weightKg: 70, steps: 1000 };
    s.days[shiftWeekDay(start, i - 7)] = { weightKg: 71, steps: 2000 };
  }
  s.days[shiftWeekDay(start, 3)] = {
    isDeleted: true,
    weightKg: 999,
    steps: 999,
  };
  let m = computeWeeklyMetrics(s, start);
  assert.equal(m.changes.weight, -1);
  assert.equal(m.week.weight.days, 3);
  assert.equal(m.changes.steps, -1000);
  s.settings.birthDate = "1990-01-01";
  m = computeWeeklyMetrics(s, start);
  assert.equal(m.week.calories.spent, null);
  assert.equal(computeWeeklyMetrics(source(), start).hasData, false);
});
function serviceSetup() {
  let enabled = false,
    fail = false,
    claims = 0,
    calls = 0;
  const reports = new Map<string, WeeklyReport>();
  const s = source();
  s.days[start] = { weightKg: 70 };
  const backend: WeeklyBackend = {
    now: () => new Date("2026-11-23T10:00:00+01:00"),
    enabled: async () => enabled,
    scheduleDelay: async () => 0,
    setEnabled: async (_, v) => {
      enabled = v;
    },
    list: async (user) =>
      [...reports.entries()]
        .filter(([key]) => key.startsWith(user + ":"))
        .map(([, r]) => r),
    report: async (user, week) => reports.get(user + ":" + week) ?? null,
    claim: async (user, week) => {
      const key = user + ":" + week;
      if (reports.get(key)?.status === "generating") return null;
      claims++;
      reports.set(key, {
        week_start: week,
        status: "generating",
        metrics: null,
        narrative: null,
        generated_at: null,
      });
      return "lease";
    },
    source: async () => s,
    reserve: async () => "ok",
    generate: async () => {
      calls++;
      if (fail) throw Error();
      return {
        summary: "Une semaine régulière.",
        observations: ["Le poids est renseigné."],
        actions: ["Poursuis le suivi.", "Garde une activité régulière."],
      };
    },
    finish: async (user, week, metrics, narrative) => {
      reports.set(user + ":" + week, {
        week_start: week,
        status: metrics.hasData ? "ready" : "empty",
        metrics,
        narrative,
        generated_at: new Date().toISOString(),
      });
    },
    fail: async (user, week, code) => {
      reports.set(user + ":" + week, {
        week_start: week,
        status: "failed",
        error_code: code,
        metrics: null,
        narrative: null,
        generated_at: null,
      });
    },
    users: async () => (enabled ? ["a", "b"] : []),
    notify: async () => {},
  };
  return {
    backend,
    service: createWeeklyService(backend),
    reports,
    source: s,
    claims: () => claims,
    calls: () => calls,
    fail: () => {
      fail = true;
    },
  };
}
test("récap : deux comptes isolés, rapport conservé et aucun nouvel appel Gemini à la relecture", async () => {
  const s = serviceSetup();
  await s.service.request("a", { action: "weekly-generate", week: start });
  await s.service.request("a", { action: "weekly-generate", week: start });
  assert.equal(s.calls(), 1);
  assert.equal(s.claims(), 1);
  assert.equal(
    (
      (await s.service.request("b", { action: "weekly-get", week: start })) as {
        report: unknown;
      }
    ).report,
    null,
  );
  assert.ok(
    !JSON.stringify(
      await s.service.request("a", { action: "weekly-list" }),
    ).includes("Une semaine régulière"),
  );
  assert.equal(
    (
      (await s.service.request("a", { action: "weekly-get", week: start })) as {
        report: WeeklyReport;
      }
    ).report.status,
    "ready",
  );
});
test("récap : aucune donnée ne crée ni chiffres ni appel IA ; les erreurs ne deviennent pas de faux rapports", async () => {
  const s = serviceSetup();
  s.source.days = {};
  const response = (await s.service.request("a", {
    action: "weekly-generate",
    week: start,
  })) as { report: WeeklyReport };
  assert.equal(response.report.status, "empty");
  assert.equal(s.calls(), 0);
  const bad = serviceSetup();
  bad.fail();
  const result = (await bad.service.request("a", {
    action: "weekly-generate",
    week: start,
  })) as { report: WeeklyReport };
  assert.equal(result.report.status, "failed");
  assert.equal(result.report.narrative, null);
  await assert.rejects(
    bad.service.request("a", { action: "weekly-generate", week: "2026-11-23" }),
  );
});
test("récap : activation explicite et un seul appel Gemini par passage du cron", async () => {
  const s = serviceSetup();
  await s.service.dispatch();
  assert.equal(s.calls(), 0);
  await s.service.request("a", { action: "weekly-enable", enabled: true });
  await s.service.dispatch();
  assert.equal(s.calls(), 1);
  await s.service.dispatch();
  assert.equal(s.calls(), 2);
  await s.service.dispatch();
  assert.equal(s.calls(), 2);
});

test("récap : seul le dernier bilan prêt est accessible, même depuis un ancien lien", async () => {
  const s = serviceSetup();
  await s.service.request("a", { action: "weekly-generate" });
  const current = s.reports.get(`a:${start}`)!;
  s.reports.set("a:2026-11-09", { ...current, week_start: "2026-11-09" });
  const response = (await s.service.request("a", {
    action: "weekly-get",
    week: "2026-11-09",
  })) as { report: WeeklyReport };
  assert.equal(response.report.week_start, start);
  const list = (await s.service.request("a", { action: "weekly-list" })) as {
    reports: Pick<WeeklyReport, "week_start" | "status" | "generated_at">[];
  };
  assert.deepEqual(
    list.reports.map((r) => r.week_start),
    [start],
  );
  await assert.rejects(
    s.service.request("a", { action: "weekly-generate", week: "2026-11-09" }),
  );
  s.reports.delete(`a:${start}`);
  assert.equal(
    (
      (await s.service.request("a", { action: "weekly-get" })) as {
        report: WeeklyReport;
      }
    ).report.week_start,
    "2026-11-09",
  );
  assert.equal(s.calls(), 1);
});

test("récap : Coralie à 21 h, Loric à 21 h 05, heure de Paris été comme hiver", async () => {
  for (const [week, utc] of [
    ["2026-11-16", "2026-11-22T20:"],
    ["2026-06-29", "2026-07-05T19:"],
  ]) {
    const s = serviceSetup();
    s.backend.scheduleDelay = async (user) => (user === "a" ? 0 : 5);
    s.backend.users = async () => ["a", "b"];
    const generated: string[] = [];
    s.backend.source = async (user) => {
      generated.push(user);
      return { settings: {}, days: { [week]: { weightKg: 70 } }, entries: [] };
    };
    s.backend.now = () => new Date(utc + "00:00Z");
    await s.service.dispatch();
    assert.deepEqual(generated, ["a"]);
    s.backend.now = () => new Date(utc + "04:59Z");
    await s.service.dispatch();
    assert.deepEqual(generated, ["a"]);
    s.backend.now = () => new Date(utc + "05:00Z");
    await s.service.dispatch();
    assert.deepEqual(generated, ["a", "b"]);
    assert.equal(
      (await s.service.request("b", { action: "weekly-list" })).scheduledTime,
      "21:05",
    );
  }
});
