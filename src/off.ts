import { openDB } from "idb";
import { offProduct, type CatalogFood } from "./food-search";
const database = () =>
  openDB("kalo-off-cache", 1, {
    upgrade(db) {
      db.createObjectStore("queries");
    },
  });
const memory = new Map<string, { at: number; foods: CatalogFood[] }>();
let nextRequest = 0;
const fields =
  "code,product_name,product_name_fr,brands,nutriments,quantity,product_quantity_unit";
export async function cachedProducts(): Promise<CatalogFood[]> {
  try {
    const db = await database();
    const values = await db.getAll("queries");
    return values.flatMap((v) => v.foods).slice(-800);
  } catch {
    return [];
  }
}
export async function searchOFF(
  query: string,
  signal: AbortSignal,
): Promise<CatalogFood[]> {
  const key = query.trim().toLocaleLowerCase("fr"),
    now = Date.now();
  let cached = memory.get(key);
  try {
    cached ??= await (await database()).get("queries", key);
  } catch {
    /* IDB can be unavailable in private mode. */
  }
  if (cached && now - cached.at < 24 * 3600_000) return cached.foods;
  const delay = Math.max(650, nextRequest - now);
  nextRequest = now + delay + 6100;
  await new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, delay);
    signal.addEventListener("abort", cancel, { once: true });
  });
  const barcode = /^\d{8,14}$/.test(key);
  const url = new URL(
    barcode
      ? `https://world.openfoodfacts.org/api/v3/product/${key}.json`
      : "https://world.openfoodfacts.org/cgi/search.pl",
  );
  url.searchParams.set("fields", fields);
  // Browsers control the HTTP User-Agent; send application identification in the URL.
  url.searchParams.set("User-Agent", "KaloCompagnon/1.0 (web)");
  url.searchParams.set("app_name", "KaloCompagnon");
  url.searchParams.set("app_version", "1.0");
  if (!barcode) {
    url.searchParams.set("search_terms", query.trim());
    url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "1");
    url.searchParams.set("page_size", "24");
  }
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
  });
  if (!response.ok)
    throw new Error(
      "Open Food Facts temporairement indisponible. Les aliments locaux restent disponibles.",
    );
  const data = await response.json();
  const foods = (
    barcode ? (data.product ? [data.product] : []) : (data.products ?? [])
  )
    .map(offProduct)
    .filter(Boolean) as CatalogFood[];
  signal.throwIfAborted();
  const value = { at: Date.now(), foods };
  memory.set(key, value);
  if (memory.size > 40) memory.delete(memory.keys().next().value!);
  try {
    const db = await database();
    await db.put("queries", value, key);
    const keys = await db.getAllKeys("queries");
    if (keys.length > 40) {
      const values = await db.getAll("queries");
      const oldest = keys
        .map((k, i) => ({ k, at: values[i].at }))
        .sort((a, b) => a.at - b.at);
      for (const item of oldest.slice(0, keys.length - 40))
        await db.delete("queries", item.k);
    }
  } catch {
    /* A full cache must not prevent selection. */
  }
  return foods;
}
