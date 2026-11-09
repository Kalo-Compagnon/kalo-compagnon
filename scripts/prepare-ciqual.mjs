import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
// CSV export of the official Ciqual workbook (UTF-8, semicolon delimiter).
export function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
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
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV: guillemets non fermés");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
const norm = (s) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
export function ciqualValue(value) {
  const s = String(value ?? "")
    .trim()
    .replace(",", ".");
  // Traces, inequalities, dashes and blanks are not exact numerical values.
  if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export function prepareCiqual(text, version) {
  const [header, ...rows] = parseCSV(text),
    cols = header?.map(norm) ?? [];
  const find = (test, required = true) => {
    const index = cols.findIndex(test);
    if (index < 0 && required)
      throw new Error(
        "Colonne Ciqual manquante. Conserver les en-têtes officiels (alim_code, alim_nom_fr, énergie kcal/100 g).",
      );
    return index;
  };
  const id = find((c) => c === "alim_code"),
    name = find((c) => c === "alim_nom_fr");
  const energy = find(
    (c) => /energie.*kcal\/100\s*g/.test(c) && /reglement|regulation/.test(c),
  );
  const protein = find((c) => /proteines.*g\/100\s*g/.test(c), false),
    carbs = find((c) => /^(glucides).*g\/100\s*g/.test(c), false),
    fat = find((c) => /^(lipides).*g\/100\s*g/.test(c), false);
  const seen = new Set();
  return rows.map((r) => {
    const code = r[id]?.trim(),
      label = r[name]?.trim();
    if (!code || !label || seen.has(code))
      throw new Error("Identifiant/nom vide ou code Ciqual dupliqué");
    seen.add(code);
    return {
      id: `ciqual-${code}`,
      externalId: code,
      name: label,
      category: "Autres",
      source: "ciqual",
      sourceVersion: version,
      referenceUnit: "g",
      kcalPer100: ciqualValue(r[energy]),
      proteinPer100: ciqualValue(r[protein]),
      carbsPer100: ciqualValue(r[carbs]),
      fatPer100: ciqualValue(r[fat]),
      isCustom: false,
      isFavorite: false,
      usageCount: 0,
    };
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [input, version] = process.argv.slice(2);
  if (!input || !version)
    throw new Error(
      "Usage: node scripts/prepare-ciqual.mjs fichier-officiel.csv 2025",
    );
  const data = prepareCiqual(await readFile(input, "utf8"), version);
  if (!data.length) throw new Error("Catalogue Ciqual vide");
  await writeFile("src/ciqual-data.json", JSON.stringify(data));
  console.log(
    `${data.length} aliments Ciqual ${version} préparés.`,
  );
}
