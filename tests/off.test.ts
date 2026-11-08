import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { searchOFF, cachedProducts } from "../src/off";
test("OFF: requête bornée, cache persistant, interruption et échec réseau", async () => {
  const original = globalThis.fetch;
  const originalNow = Date.now;
  let count = 0;
  globalThis.fetch = async (input) => {
    count++;
    const u = new URL(String(input));
    assert.equal(u.searchParams.get("page_size"), "24");
    return new Response(
      JSON.stringify({
        products: [
          {
            code: "12345678",
            product_name: "Test",
            nutriments: { "energy-kcal_100g": 42 },
          },
        ],
      }),
    );
  };
  try {
    const a = await searchOFF("test-cache", new AbortController().signal);
    assert.equal(a[0].kcalPer100, 42);
    await searchOFF("test-cache", new AbortController().signal);
    assert.equal(count, 1);
    assert.equal((await cachedProducts())[0].externalId, "12345678");
    const controller = new AbortController();
    const pending = searchOFF("obsolete", controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(count, 1);
    // A late transport response must neither return results nor populate the cache.
    Date.now = () => originalNow() + 60_000;
    const late = new AbortController();
    globalThis.fetch = async () => {
      late.abort();
      return new Response(
        JSON.stringify({ products: [{ code: "late", product_name: "Late" }] }),
      );
    };
    await assert.rejects(searchOFF("late-response", late.signal), {
      name: "AbortError",
    });
    assert.ok(!(await cachedProducts()).some((f) => f.externalId === "late"));
    Date.now = () => originalNow() + 120_000;
    globalThis.fetch = async () =>
      new Response("Rate limited", { status: 429 });
    await assert.rejects(
      searchOFF("rate-limit", new AbortController().signal),
      /indisponible/,
    );
  } finally {
    globalThis.fetch = original;
    Date.now = originalNow;
  }
});
