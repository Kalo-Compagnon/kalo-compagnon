import {
  add,
  dayKey,
  div,
  estimateSteps,
  f,
  type State,
  type FitImport,
} from "./domain";
export interface Session {
  startTime?: Date;
  timestamp?: Date;
  sport?: string;
  totalStrides?: number;
  totalCycles?: number;
  avgRunningCadence?: number;
  avgCadence?: number;
  avgFractionalCadence?: number;
  totalTimerTime?: number;
  totalDistance?: number;
  totalCalories?: number;
}
export function sessionMetrics(sessions: Session[], fallback: string) {
  const grouped = new Map<
    string,
    {
      day: string;
      startedAt: number;
      steps: number;
      coveredSteps: number;
      calories: number;
      source: string;
    }
  >();
  for (const s of sessions) {
    const startedAt = (
        s.startTime ??
        s.timestamp ??
        new Date(`${fallback}T00:00:00`)
      ).getTime(),
      day = dayKey(startedAt);
    const walking = /walking|running|hiking/i.test(s.sport ?? "");
    const steps = walking
      ? Math.max(0, Math.min(2147483647, s.totalStrides ?? s.totalCycles ?? 0))
      : 0;
    const estimated =
      steps > 0
        ? steps
        : walking
          ? estimateSteps(
              add(
                s.avgRunningCadence ?? s.avgCadence ?? 0,
                s.avgFractionalCadence ?? 0,
              ),
              f(s.totalTimerTime ?? 0),
              f(s.totalDistance ?? 0),
            ) || Math.floor(Math.max(0, div(s.totalDistance ?? 0, 0.95)) + 0.5)
          : 0;
    const calories = f(Math.max(0, s.totalCalories ?? 0));
    if (steps <= 0 && calories <= 0) continue;
    const prev = grouped.get(day);
    if (prev) {
      prev.startedAt = Math.min(prev.startedAt, startedAt);
      prev.steps += steps;
      prev.coveredSteps += estimated;
      prev.calories += calories;
    } else
      grouped.set(day, {
        day,
        startedAt,
        steps,
        coveredSteps: estimated,
        calories,
        source: "session",
      });
  }
  return [...grouped.values()].map((v) => ({ ...v, calories: f(v.calories) }));
}
export async function readFit(file: File, day: string, s: State) {
  if (!/\.fit$/i.test(file.name))
    throw new Error("Format refusé : sélectionne un fichier .fit");
  const bytes = await file.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (s.imports.some((i) => i.hash === hash))
    throw new Error("Déjà importé : aucune donnée ajoutée");
  const { Decoder, Stream } = await import("@garmin/fitsdk");
  const decoder = new Decoder(Stream.fromArrayBuffer(bytes));
  if (!decoder.isFIT() || !decoder.checkIntegrity())
    throw new Error("Fichier FIT illisible ou incomplet");
  const { messages, errors } = decoder.read();
  if (errors.length) throw new Error("Fichier FIT illisible");
  const sessions = messages.sessionMesgs ?? [];
  let metrics = sessionMetrics(sessions as Session[], day);
  if (!sessions.length && (messages.monitoringMesgs?.length ?? 0) > 0) {
    const { supabase } = await import("./persistence");
    const token = supabase
      ? (await supabase.auth.getSession()).data.session?.access_token
      : null;
    const response = await fetch("/api/fit-monitoring", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Time-Zone": Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: bytes,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(result))
      throw new Error(
        result?.error ??
          "Le service Garmin doit être démarré pour importer ce fichier de suivi quotidien. Les FIT de sessions sportives sont décodés directement dans le navigateur.",
      );
    const grouped = new Map<string, (typeof metrics)[number]>();
    for (const m of result) {
      if (
        typeof m.day !== "string" ||
        ![m.startedAt, m.steps, m.coveredSteps, m.calories].every(
          Number.isFinite,
        )
      )
        throw new Error("Réponse Garmin invalide");
      const previous = grouped.get(m.day);
      if (previous) {
        previous.startedAt = Math.min(previous.startedAt, m.startedAt);
        previous.steps += m.steps;
        previous.coveredSteps += m.coveredSteps;
        previous.calories += m.calories;
      } else grouped.set(m.day, m);
    }
    metrics = [...grouped.values()].map((m) => ({
      ...m,
      calories: f(m.calories),
    }));
  }
  const known = new Set(s.imports.flatMap((i) => i.fingerprints));
  const accepted = metrics.filter(
    (m) =>
      !known.has(
        `${m.source}:${m.startedAt}:${m.steps}:${Math.floor(m.calories + 0.5)}`,
      ),
  );
  if (metrics.length && !accepted.length)
    throw new Error("Activité déjà importée : rien n’a été ajouté");
  const record: FitImport = {
    id: hash,
    timestamp: Date.now(),
    hash,
    name: file.name,
    size: file.size,
    fingerprints: accepted.map(
      (m) =>
        `${m.source}:${m.startedAt}:${m.steps}:${Math.floor(m.calories + 0.5)}`,
    ),
    days: accepted.map((m) => m.day),
    steps: accepted.reduce((a, m) => a + m.steps, 0),
    calories: f(accepted.reduce((a, m) => a + m.calories, 0)),
    coveredSteps: accepted.reduce(
      (a, m) => a + (m.calories > 0 ? m.coveredSteps : 0),
      0,
    ),
  };
  return {
    record,
    apply(state: State) {
      if (state.imports.some((i) => i.hash === hash)) return;
      for (const m of accepted) {
        const d = state.days[m.day] ?? {
          basal: state.settings.basal,
          target: state.settings.target,
        };
        d.fitSteps = (d.fitSteps ?? 0) + m.steps;
        d.fitCalories = add(d.fitCalories ?? 0, m.calories);
        if (m.calories > 0)
          d.fitCoveredSteps = (d.fitCoveredSteps ?? 0) + m.coveredSteps;
        state.days[m.day] = d;
      }
      state.imports.push(record);
    },
  };
}
