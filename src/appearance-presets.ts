export const defaultHaloColor = "#a89ae5";
export const accentPresets = [
  ["Lavande", defaultHaloColor],
  ["Pêche", "#e7a580"],
  ["Sauge", "#98bd93"],
  ["Bleu", "#80b4e7"],
  ["Rose", "#dc92b7"],
] as const;
export const isPresetAccent = (value: string) =>
  accentPresets.some(([, color]) => color === value.toLowerCase());
