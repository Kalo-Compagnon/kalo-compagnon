export interface Estimate {
  type: "estimation";
  message: string;
  meal_id: string;
  nom_repas: string;
  ingredients: {
    nom: string;
    quantite_g: number | null;
    kcal: number;
    source: "Estimation Gemini";
  }[];
  total_kcal: number;
  incertitudes: string[];
}
export type Reply = Estimate | { type: "conversation"; message: string };
export interface Turn {
  role: "user" | "model";
  text: string;
}
export interface KermitRequest {
  text: string;
  history: Turn[];
  image?: string;
}
function checkJpegSize(bytes: string) {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes.charCodeAt(offset++) !== 255) throw new Error("JPEG invalide");
    let marker = bytes.charCodeAt(offset++);
    while (marker === 255) marker = bytes.charCodeAt(offset++);
    const length =
      bytes.charCodeAt(offset) * 256 + bytes.charCodeAt(offset + 1);
    if (length < 2 || offset + length > bytes.length)
      throw new Error("JPEG invalide");
    if ([192, 193, 194].includes(marker)) {
      const height =
        bytes.charCodeAt(offset + 3) * 256 + bytes.charCodeAt(offset + 4);
      const width =
        bytes.charCodeAt(offset + 5) * 256 + bytes.charCodeAt(offset + 6);
      if (!height || !width || height > 1024 || width > 1024)
        throw new Error("Dimensions photo invalides");
      return;
    }
    offset += length;
  }
  throw new Error("JPEG invalide");
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Format invalide");
  return v as Record<string, unknown>;
};
function str(v: unknown, max: number): string {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new Error("Texte invalide");
  return v.trim();
}
function number(v: unknown, max: number, positive = false): number {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < 0 ||
    v > max ||
    (positive && v === 0)
  )
    throw new Error("Valeur invalide");
  return v;
}
export function validateReply(value: unknown): Reply {
  const v = object(value),
    message = str(v.message, 3000);
  if (v.type === "conversation") return { type: "conversation", message };
  if (
    v.type !== "estimation" ||
    !Array.isArray(v.ingredients) ||
    !v.ingredients.length ||
    v.ingredients.length > 30 ||
    !Array.isArray(v.incertitudes) ||
    v.incertitudes.length > 10
  )
    throw new Error("Estimation invalide");
  const ingredients = v.ingredients.map((raw) => {
    const i = object(raw);
    if (i.source !== "Estimation Gemini") throw new Error("Source invalide");
    return {
      nom: str(i.nom, 160),
      quantite_g:
        i.quantite_g === null ? null : number(i.quantite_g, 20000, true),
      kcal: number(i.kcal, 20000),
      source: "Estimation Gemini" as const,
    };
  });
  const total =
    Math.round(ingredients.reduce((sum, i) => sum + i.kcal, 0) * 100) / 100;
  if (total > 30000 || Math.abs(number(v.total_kcal, 30000) - total) > 1)
    throw new Error("Total incohérent");
  return {
    type: "estimation",
    message,
    meal_id: str(v.meal_id, 64),
    nom_repas: str(v.nom_repas, 160),
    ingredients,
    total_kcal: total,
    incertitudes: v.incertitudes.map((s) => str(s, 300)),
  };
}
export function validateRequest(value: unknown): KermitRequest {
  const v = object(value);
  if (
    typeof v.text !== "string" ||
    v.text.length > 4000 ||
    !Array.isArray(v.history) ||
    v.history.length > 24
  )
    throw new Error("Message trop long");
  const history = v.history.map((raw, index): Turn => {
    const t = object(raw);
    if (t.role !== (index % 2 === 0 ? "user" : "model"))
      throw new Error("Contexte invalide");
    const text = str(t.text, 10000);
    if (t.role === "model") validateReply(JSON.parse(text));
    return { role: t.role as Turn["role"], text };
  });
  if (
    history.length % 2 ||
    history.reduce((n, t) => n + t.text.length, 0) > 48000
  )
    throw new Error("Conversation trop longue. Ferme puis rouvre Kermit.");
  let image: string | undefined;
  if (v.image !== undefined) {
    if (
      typeof v.image !== "string" ||
      v.image.length > 750000 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.image)
    )
      throw new Error("Photo invalide");
    const bytes = atob(v.image.split(",")[1]);
    if (
      bytes.length < 4 ||
      bytes.charCodeAt(0) !== 255 ||
      bytes.charCodeAt(1) !== 216 ||
      bytes.charCodeAt(2) !== 255
    )
      throw new Error("Photo invalide");
    checkJpegSize(bytes);
    image = v.image;
  }
  if (!v.text.trim() && !image)
    throw new Error("Ajoute un message ou une photo");
  return { text: v.text.trim(), history, ...(image ? { image } : {}) };
}
export const responseSchema = {
  type: "object",
  required: [
    "type",
    "message",
    "meal_id",
    "nom_repas",
    "ingredients",
    "total_kcal",
    "incertitudes",
  ],
  properties: {
    type: { type: "string", enum: ["conversation", "estimation"] },
    message: { type: "string" },
    meal_id: {
      type: "string",
      description:
        "Identifiant existant pour une correction ; new pour un nouveau repas.",
    },
    nom_repas: { type: "string" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        required: ["nom", "quantite_g", "kcal", "source"],
        properties: {
          nom: { type: "string" },
          quantite_g: { type: ["number", "null"] },
          kcal: { type: "number" },
          source: { type: "string", enum: ["Estimation Gemini"] },
        },
      },
    },
    total_kcal: { type: "number" },
    incertitudes: { type: "array", items: { type: "string" } },
  },
};
