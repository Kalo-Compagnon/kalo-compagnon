export interface CalorieValues {
  intake: number;
  spent: number;
}
const positive = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;
export function sharedCalorieScale(series: CalorieValues[][]) {
  const maxima = series.map((records) =>
    Math.max(
      0,
      ...records.map(
        (record) => positive(record.intake) + positive(record.spent),
      ),
    ),
  );
  return {
    maximum: Math.max(1, ...maxima),
    halfReferences: maxima.map((value) => (value > 0 ? value / 2 : null)),
  };
}
export function calorieHeights(
  values: CalorieValues,
  maximum: number,
  height: number,
) {
  const intake = positive(values.intake),
    spent = positive(values.spent);
  return {
    total: (height * (intake + spent)) / maximum,
    intake: (height * intake) / maximum,
  };
}
