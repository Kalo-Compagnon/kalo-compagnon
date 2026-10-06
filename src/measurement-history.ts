import { parseDay, fmt, type State } from "./domain";
export interface MeasurementRecord {
  day: string;
  timestamp: number;
  values: Record<string, number>;
}
const present = (values: Record<string, number>) =>
  Object.values(values).some((v) => v > 0);
// Read both historical snapshots and daily drafts, including older app versions.
export function measurementRecords(
  state: State,
  through: string,
): MeasurementRecord[] {
  const records: MeasurementRecord[] = [];
  for (const day of Object.keys(state.days)
    .filter((d) => d <= through)
    .sort()) {
    const data = state.days[day];
    const history = [...(data.measurementHistory ?? [])].sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    records.push(
      ...history.filter((h) => present(h.values)).map((h) => ({ ...h, day })),
    );
    if (
      data.measurements &&
      present(data.measurements) &&
      !Object.entries(data.measurements).every(
        ([z, v]) => (history.at(-1)?.values[z] ?? 0) === v,
      )
    )
      records.push({
        day,
        timestamp: Math.max(
          parseDay(day).getTime(),
          (history.at(-1)?.timestamp ?? 0) + 1,
        ),
        values: data.measurements,
      });
  }
  return records;
}
export function currentMeasurements(state: State, day: string) {
  const values: Record<string, number> = {};
  for (const date of Object.keys(state.days)
    .filter((d) => d <= day)
    .sort()) {
    const data = state.days[date];
    for (const record of [...(data.measurementHistory ?? [])].sort(
      (a, b) => a.timestamp - b.timestamp,
    ))
      Object.assign(values, record.values);
    // Keep explicit clears across dates as well as across reloads.
    Object.assign(values, data.measurements ?? {});
  }
  return values;
}
export function previousMeasurement(
  records: MeasurementRecord[],
  index: number,
  zone: string,
) {
  for (let i = index - 1; i >= 0; i--)
    if ((records[i].values[zone] ?? 0) > 0) return records[i].values[zone];
  return undefined;
}
export function measurementDelta(value: number, previous?: number) {
  if (previous === undefined || value <= 0) return "Premier relevé";
  const delta = Math.round((value - previous) * 10) / 10;
  return delta > 0
    ? `↑ +${fmt(delta)} cm`
    : delta < 0
      ? `↓ −${fmt(Math.abs(delta))} cm`
      : "→ 0 cm";
}
