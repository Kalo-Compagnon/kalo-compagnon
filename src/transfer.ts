import {
  type State,
  type Food,
  type Entry,
  type Meal,
  initialState,
  seedFoods,
  dayKey,
  allDays,
  basal,
  target,
  steps,
  activity,
  expense,
  consumed,
  nutrients,
  f,
  normalize,
  sub,
} from "./domain";
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function exportJSON(state: State) {
  return JSON.stringify(
    {
      format: "logger-web",
      version: 2,
      exportedAt: new Date().toISOString(),
      state,
    },
    null,
    2,
  );
}
function validObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function checkTree(value: unknown, depth = 0) {
  if (depth > 35) throw new Error("Structure trop profonde");
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("Nombre invalide");
  if (validObject(value))
    for (const [k, v] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(k))
        throw new Error("Clé interdite");
      checkTree(v, depth + 1);
    }
  else if (Array.isArray(value)) for (const v of value) checkTree(v, depth + 1);
}
function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function str(v: unknown) {
  return typeof v === "string";
}
function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(`Import invalide : ${msg}`);
}
export function validateState(value: unknown): State {
  checkTree(value);
  assert(validObject(value), "données");
  const s = value as unknown as State;
  assert(
    validObject(s.settings) && validObject(s.days),
    "réglages et journées",
  );
  assert(
    [s.entries, s.foods, s.meals, s.physical, s.imports].every(Array.isArray),
    "collections",
  );
  assert(
    str(s.settings.first) && /^\d{4}-\d{2}-\d{2}$/.test(s.settings.first),
    "date initiale",
  );
  for (const k of [
    "basal",
    "target",
    "deficitGoal",
    "age",
    "height",
    "weight",
  ] as const)
    assert(finite(s.settings[k]), `réglage ${k}`);
  assert(
    s.settings.target > 0 &&
      s.settings.deficitGoal >= 1 &&
      s.settings.deficitGoal <= 3000,
    "objectifs",
  );
  assert(["male", "female"].includes(s.settings.sex), "sexe");
  for (const list of [s.entries, s.foods, s.meals, s.physical, s.imports]) {
    const ids = new Set();
    for (const item of list) {
      assert(
        validObject(item) && str(item.id) && item.id.length > 0,
        "identifiant",
      );
      assert(!ids.has(item.id), "identifiant dupliqué");
      ids.add(item.id);
    }
  }
  for (const [d, v] of Object.entries(s.days)) {
    assert(
      /^\d{4}-\d{2}-\d{2}$/.test(d) && dayKey(new Date(`${d}T12:00:00`)) === d,
      "date",
    );
    assert(validObject(v), "journée");
    for (const k of [
      "basal",
      "target",
      "steps",
      "fitSteps",
      "fitCalories",
      "fitCoveredSteps",
    ] as const)
      assert(
        v[k] === undefined || (finite(v[k]) && v[k]! >= 0),
        `journée ${k}`,
      );
    if (v.measurements)
      assert(
        validObject(v.measurements) &&
          Object.values(v.measurements).every((x) => finite(x) && x >= 0),
        "mensurations",
      );
    if (v.measurementHistory)
      assert(
        Array.isArray(v.measurementHistory) &&
          v.measurementHistory.every(
            (h) =>
              finite(h.timestamp) &&
              validObject(h.values) &&
              Object.values(h.values).every(finite),
          ),
        "historique mensurations",
      );
  }
  for (const e of s.entries) {
    assert(finite(e.timestamp) && str(e.type) && str(e.foodName), "entrée");
    assert(
      e.calories === null || (finite(e.calories) && e.calories >= 0),
      "calories",
    );
    for (const k of [
      "quantityGrams",
      "proteinGrams",
      "carbsGrams",
      "fatGrams",
    ] as const)
      assert(e[k] === undefined || (finite(e[k]) && e[k]! >= 0), "nutrition");
  }
  for (const food of s.foods) {
    assert(
      str(food.name) && str(food.category) && str(food.referenceUnit),
      "aliment",
    );
    assert(
      [
        food.kcalPer100,
        food.proteinPer100,
        food.carbsPer100,
        food.fatPer100,
        food.usageCount,
      ].every((v) => finite(v) && v >= 0),
      "valeurs alimentaires",
    );
  }
  const foods = new Set(s.foods.map((f) => f.id));
  for (const m of s.meals) {
    assert(str(m.name) && Array.isArray(m.ingredients), "repas");
    assert(
      [
        m.cachedCalories,
        m.cachedProtein,
        m.cachedCarbs,
        m.cachedFat,
        m.usageCount,
        m.createdAt,
      ].every(finite),
      "totaux repas",
    );
    for (const p of m.ingredients)
      assert(
        str(p.id) &&
          foods.has(p.foodId) &&
          finite(p.quantity) &&
          p.quantity > 0 &&
          typeof p.isVariable === "boolean",
        "ingrédient",
      );
  }
  for (const p of s.physical)
    assert(
      finite(p.timestamp) &&
        finite(p.waistCm) &&
        (p.weightKg === undefined || finite(p.weightKg)),
      "relevé physique",
    );
  for (const i of s.imports)
    assert(
      str(i.hash) &&
        str(i.name) &&
        Array.isArray(i.days) &&
        Array.isArray(i.fingerprints) &&
        [i.timestamp, i.size, i.steps, i.calories, i.coveredSteps].every(
          finite,
        ),
      "import FIT",
    );
  return s;
}
export function importJSON(text: string): State {
  const data = JSON.parse(text);
  assert(
    data.format === "logger-web" && data.version === 2,
    "format/version JSON",
  );
  return validateState(data.state);
}
const headers = [
  "record_type",
  "date",
  "time",
  "id",
  "entry_type",
  "name",
  "category",
  "quantity",
  "unit",
  "calories",
  "proteins_g",
  "carbs_g",
  "fat_g",
  "consumed_kcal",
  "expense_kcal",
  "deficit_kcal",
  "target_kcal",
  "basal_kcal",
  "steps",
  "step_kcal",
  "fit_activity_kcal",
  "fit_covered_steps",
  "waist_cm",
  "weight_kg",
  "note",
  "image_path",
  "favorite",
  "usage_count",
  "last_used_at",
  "variable",
  "payload_json",
];
export function exportCSV(s: State) {
  const rows: Record<string, unknown>[] = [];
  const time = (n: number) =>
    new Date(n).toLocaleTimeString("fr-FR", { hour12: false });
  for (const d of allDays(s).reverse()) {
    const day = s.days[d] ?? {};
    rows.push({
      record_type: "DAY_SUMMARY",
      date: d,
      consumed_kcal: consumed(s, d),
      expense_kcal: expense(s, d),
      deficit_kcal: basal(s, d) > 0 ? sub(expense(s, d),consumed(s, d)) : null,
      target_kcal: target(s, d),
      basal_kcal: basal(s, d),
      steps: steps(day),
      step_kcal: f(steps(day) * f(0.045)),
      fit_activity_kcal: day.fitCalories ?? 0,
      fit_covered_steps: day.fitCoveredSteps ?? 0,
      payload_json: JSON.stringify(day),
    });
  }
  for (const e of s.entries)
    rows.push({
      record_type: "FOOD_LOG",
      date: dayKey(e.timestamp),
      time: time(e.timestamp),
      id: e.id,
      entry_type: e.type,
      name: e.foodName,
      quantity: e.quantityGrams,
      unit: e.quantityUnit,
      calories: e.calories,
      proteins_g: e.proteinGrams,
      carbs_g: e.carbsGrams,
      fat_g: e.fatGrams,
      note: e.note,
      image_path: e.imagePath,
      payload_json: JSON.stringify(e),
    });
  for (const m of s.meals) {
    rows.push({
      record_type: "SAVED_MEAL",
      id: m.id,
      name: m.name,
      calories: m.cachedCalories,
      proteins_g: m.cachedProtein,
      carbs_g: m.cachedCarbs,
      fat_g: m.cachedFat,
      favorite: m.isFavorite,
      usage_count: m.usageCount,
      payload_json: JSON.stringify(m),
    });
    for (const p of m.ingredients) {
      const food = s.foods.find((f) => f.id === p.foodId)!,
        v = nutrients(food, p.quantity);
      rows.push({
        record_type: "MEAL_INGREDIENT",
        id: p.id,
        entry_type: `meal:${m.id}`,
        name: food.name,
        category: food.category,
        quantity: p.quantity,
        unit: food.referenceUnit,
        calories: v[0],
        proteins_g: v[1],
        carbs_g: v[2],
        fat_g: v[3],
        variable: p.isVariable,
      });
    }
  }
  for (const food of s.foods.filter(
    (f) =>
      f.isCustom ||
      f.isFavorite ||
      f.usageCount > 0 ||
      s.meals.some((m) => m.ingredients.some((p) => p.foodId === f.id)),
  ))
    rows.push({
      record_type: "FOOD_PREFERENCE",
      id: food.id,
      name: food.name,
      category: food.category,
      unit: `100 ${food.referenceUnit}`,
      calories: food.kcalPer100,
      proteins_g: food.proteinPer100,
      carbs_g: food.carbsPer100,
      fat_g: food.fatPer100,
      favorite: food.isFavorite,
      usage_count: food.usageCount,
      payload_json: JSON.stringify(food),
    });
  for (const p of s.physical)
    rows.push({
      record_type: "PHYSICAL_RECORD",
      id: p.id,
      date: dayKey(p.timestamp),
      time: time(p.timestamp),
      waist_cm: p.waistCm,
      weight_kg: p.weightKg,
      image_path: p.imagePath,
      payload_json: JSON.stringify(p),
    });
  for (const i of s.imports)
    rows.push({
      record_type: "FIT_IMPORT",
      id: i.id,
      name: i.name,
      date: dayKey(i.timestamp),
      time: time(i.timestamp),
      steps: i.steps,
      calories: i.calories,
      fit_covered_steps: i.coveredSteps,
      payload_json: JSON.stringify(i),
    });
  rows.push({
    record_type: "WEB_SETTINGS",
    payload_json: JSON.stringify(s.settings),
  });
  const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return (
    "\uFEFF" +
    [headers, ...rows.map((r) => headers.map((h) => r[h]))]
      .map((row) => row.map(cell).join(";"))
      .join("\n")
  );
}
export function parseCSV(text: string): Record<string, string>[] {
  text = text.replace(/^\uFEFF/, "");
  const lines: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ";" && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) lines.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV : guillemet non fermé");
  if (cell || row.length) {
    row.push(cell);
    lines.push(row);
  }
  const head = lines.shift();
  assert(head?.includes("record_type"), "en-tête CSV Android attendu");
  return lines.map((r) =>
    Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ""])),
  );
}
export function importCSV(text: string): { state: State; warnings: string[] } {
  const rows = parseCSV(text),
    s = initialState(),
    warnings: string[] = [];
  const web = rows.some((r) => r.record_type === "WEB_SETTINGS");
  const n = (v: string) => {
      if (!v) return 0;
      const x = Number(v.replace(",", "."));
      assert(Number.isFinite(x), "nombre CSV");
      return f(x);
    },
    date = (r: Record<string, string>) => {
      const t = new Date(
        `${r.date || dayKey()}T${r.time || "12:00:00"}`,
      ).getTime();
      assert(Number.isFinite(t), "date CSV");
      return t;
    };
  for (const r of rows) {
    const payload = r.payload_json ? JSON.parse(r.payload_json) : null;
    if (web && payload) {
      switch (r.record_type) {
        case "WEB_SETTINGS":
          s.settings = payload;
          break;
        case "DAILY_SUMMARY":
        case "DAY_SUMMARY":
          s.days[r.date] = payload;
          break;
        case "FOOD_LOG":
          s.entries.push(payload);
          break;
        case "SAVED_MEAL":
          s.meals.push(payload);
          break;
        case "FOOD_PREFERENCE":
          s.foods = s.foods.filter((f) => f.id !== payload.id);
          s.foods.push(payload);
          break;
        case "PHYSICAL_RECORD":
          s.physical.push(payload);
          break;
        case "FIT_IMPORT":
          s.imports.push(payload);
          break;
      }
      continue;
    }
    if (web) continue;
    const id = `android-${r.id || crypto.randomUUID()}`;
    switch (r.record_type) {
      case "DAILY_SUMMARY":
      case "DAY_SUMMARY":
        s.days[r.date] = {
          basal: n(r.basal_kcal),
          target: n(r.target_kcal) || 2000,
          steps: Math.max(0, n(r.steps) - 300),
          fitSteps: 0,
          fitCalories: n(r.fit_activity_kcal),
          fitCoveredSteps: n(r.fit_covered_steps),
        };
        break;
      case "FOOD_LOG":
        s.entries.push({
          id,
          timestamp: date(r),
          type: r.entry_type || "extra",
          foodName: r.name || "Extra",
          note: r.note,
          imagePath: r.image_path || undefined,
          tags: r.category,
          quantityGrams: r.quantity ? n(r.quantity) : undefined,
          quantityUnit: r.unit || undefined,
          calories: r.calories === "" ? null : n(r.calories),
          proteinGrams: r.proteins_g ? n(r.proteins_g) : undefined,
          carbsGrams: r.carbs_g ? n(r.carbs_g) : undefined,
          fatGrams: r.fat_g ? n(r.fat_g) : undefined,
        });
        break;
      case "FOOD_PREFERENCE": {
        const seed = s.foods.find(
          (f) =>
            normalize(f.name) === normalize(r.name) &&
            f.referenceUnit === (r.unit.replace(/^100\s*/, "") || "g"),
        );
        const food: Food = {
          id: seed?.id ?? id,
          name: r.name,
          category: r.category || "Autres",
          referenceUnit: r.unit.replace(/^100\s*/, "") || "g",
          kcalPer100: n(r.calories),
          proteinPer100: n(r.proteins_g),
          carbsPer100: n(r.carbs_g),
          fatPer100: n(r.fat_g),
          isFavorite: r.favorite === "true",
          usageCount: n(r.usage_count),
          isCustom: !seed,
          lastUsedAt: r.last_used_at
            ? new Date(r.last_used_at.replace(" ", "T")).getTime()
            : undefined,
        };
        s.foods = s.foods.filter((f) => f.id !== food.id);
        s.foods.push(food);
        break;
      }
      case "SAVED_MEAL":
      case "SAVED_MEAL_LEGACY": {
        if (s.meals.some((m) => m.id === id)) break;
        s.meals.push({
          id,
          name: r.name,
          ingredients: [],
          cachedCalories: n(r.calories),
          cachedProtein: n(r.proteins_g),
          cachedCarbs: n(r.carbs_g),
          cachedFat: n(r.fat_g),
          isFavorite: r.favorite === "true",
          usageCount: n(r.usage_count),
          createdAt: date(r),
          notes: r.note,
          imagePath: r.image_path || undefined,
        });
        break;
      }
      case "PHYSICAL_RECORD":
        s.physical.push({
          id,
          timestamp: date(r),
          waistCm: n(r.waist_cm),
          weightKg: r.weight_kg ? n(r.weight_kg) : undefined,
          imagePath: r.image_path || undefined,
        });
        break;
      case "FIT_IMPORT":
        s.imports.push({
          id,
          timestamp: date(r),
          name: r.name,
          size: n(r.quantity),
          hash: `csv-${id}`,
          fingerprints: [],
          days: [],
          steps: n(r.steps),
          calories: n(r.fit_activity_kcal || r.calories),
          coveredSteps: n(r.fit_covered_steps),
        });
        break;
      case "MEAL_INGREDIENT":
        break;
      default:
        warnings.push(`Type non pris en charge : ${r.record_type}`);
    }
  }
  if (!web) {
    for (const r of rows.filter((r) => r.record_type === "MEAL_INGREDIENT")) {
      const meal = s.meals.find(
          (m) => m.id === `android-${r.entry_type.replace("meal:", "")}`,
        ),
        food = s.foods.find(
          (f) =>
            normalize(f.name) === normalize(r.name) &&
            f.referenceUnit === r.unit,
        );
      if (!meal) continue;
      if (!food) {
        warnings.push(
          `Ingrédient ${r.name} : taux d’origine absent du CSV ; repas conservé avec ses totaux en cache.`,
        );
        continue;
      }
      meal.ingredients.push({
        id: `android-${r.id}`,
        foodId: food.id,
        quantity: n(r.quantity),
        isVariable: r.variable === "true",
      });
    }
    for (const m of s.meals) {
      const count = rows.filter(
        (r) =>
          r.record_type === "MEAL_INGREDIENT" &&
          `android-${r.entry_type.replace("meal:", "")}` === m.id,
      ).length;
      if (m.ingredients.length !== count) m.ingredients = [];
    }
    const days = Object.keys(s.days).sort();
    if (days.length) {
      s.settings.first = days[0];
      s.settings.basal = s.days[days.at(-1)!].basal ?? 0;
      s.settings.target = s.days[days.at(-1)!].target ?? 2000;
    }
    warnings.push(
      "Le CSV Android ne contient pas les mensurations, le profil basal complet, l’objectif de déficit ni les empreintes FIT. Les pas sont conservés en total ; leur répartition manuel/importé n’est pas disponible. Ne réimporte pas les mêmes FIT après cette migration.",
    );
    if (rows.some((r) => r.image_path))
      warnings.push(
        "Les photos Android sont des chemins locaux : joins les fichiers depuis l’éditeur pour les retrouver sur tous les appareils.",
      );
  }
  return { state: validateState(s), warnings: [...new Set(warnings)] };
}
export function mergeImport(target: State, incoming: State) {
  // Explicit import confirmation precedes this deterministic merge.
  target.settings = {
    ...incoming.settings,
    first: [target.settings.first, incoming.settings.first].sort()[0],
  };
  target.days = { ...target.days, ...incoming.days };
  for (const key of [
    "entries",
    "foods",
    "meals",
    "physical",
    "imports",
  ] as const) {
    const map = new Map(target[key].map((x) => [x.id, x]));
    for (const item of incoming[key]) map.set(item.id, item);
    (target as unknown as Record<string, unknown>)[key] = [...map.values()];
  }
}
