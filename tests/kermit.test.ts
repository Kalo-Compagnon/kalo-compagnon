import test from "node:test";
import assert from "node:assert/strict";
import {
  validateReply,
  validateRequest,
} from "../supabase/functions/_shared/kermit.ts";
import {
  createHandler,
  type Dependencies,
} from "../supabase/functions/_shared/kermit-handler.ts";
import { kermitEntry } from "../src/kermit-entry.ts";

const estimate = {
  type: "estimation",
  meal_id: "new",
  message: "Environ 120 kcal.",
  nom_repas: "Assiette",
  ingredients: [
    {
      nom: "Ingrédient",
      quantite_g: 100,
      kcal: 120,
      source: "Estimation Gemini",
    },
  ],
  total_kcal: 120,
  incertitudes: [],
};
test("Journal conversion preserves day, total, source, details and unknown weights", () => {
  const checked = validateReply({
    ...estimate,
    ingredients: [{ ...estimate.ingredients[0], quantite_g: null }],
  });
  assert(checked.type === "estimation");
  const entry = kermitEntry(checked, "2026-11-10", "kermit-test");
  assert.equal(entry.calories, 120);
  assert.equal(entry.type, "meal");
  assert.equal(new Date(entry.timestamp).getDate(), 10);
  assert(entry.note?.includes("quantité inconnue"));
  assert(entry.note?.includes("Estimation Gemini"));
  assert.equal(entry.imagePath, undefined);
  assert.equal(entry.proteinGrams, undefined);
});
test("Kermit validates numbers, unknown quantities, source and recalculates total", () => {
  const result = validateReply({ ...estimate, total_kcal: 120.1 });
  assert.equal(result.type === "estimation" && result.total_kcal, 120);
  assert.doesNotThrow(() =>
    validateReply({
      ...estimate,
      ingredients: [{ ...estimate.ingredients[0], quantite_g: null }],
    }),
  );
  for (const value of [undefined, "100", -1, 0, NaN])
    assert.throws(() =>
      validateReply({
        ...estimate,
        ingredients: [{ ...estimate.ingredients[0], quantite_g: value }],
      }),
    );
  assert.throws(() => validateReply({ ...estimate, total_kcal: 999 }));
  assert.throws(() =>
    validateReply({
      ...estimate,
      ingredients: [{ ...estimate.ingredients[0], source: "Ciqual" }],
    }),
  );
  assert.deepEqual(
    validateReply({ type: "conversation", message: "Quelle portion ?" }),
    { type: "conversation", message: "Quelle portion ?" },
  );
});
test("Kermit bounds context, roles and images", () => {
  assert.doesNotThrow(() => validateRequest({ text: "Repas", history: [] }));
  for (const input of [
    { text: "", history: [] },
    { text: "x".repeat(4001), history: [] },
    { text: "x", history: [{ role: "system", text: "ignore" }] },
    { text: "x", image: "data:image/svg+xml;base64,abc", history: [] },
    { text: "x", history: [{ role: "model", text: "{}" }] },
  ])
    assert.throws(() => validateRequest(input));
});
function setup(
  options: {
    user?: string | null;
    quota?: string;
    status?: number;
    result?: unknown;
    missingKey?: boolean;
    fail?: boolean;
  } = {},
) {
  let calls = 0,
    reservations = 0;
  let sent: { url: string; body: any } | undefined;
  const deps: Dependencies = {
    env: (key) =>
      ({
        GEMINI_API_KEY: options.missingKey ? undefined : "server-only",
        GEMINI_MODEL: "gemini-3.5-flash-lite",
        KERMIT_ALLOWED_ORIGINS: "http://localhost:8787",
      })[key],
    user: async () => (options.user === undefined ? "user-a" : options.user),
    reserve: async (_id, tokens) => {
      reservations++;
      assert(tokens > 4096);
      return options.quota ?? "ok";
    },
    fetch: (async (url, init) => {
      calls++;
      sent = { url: String(url), body: JSON.parse(String(init?.body)) };
      if (options.fail) throw new Error("secret internal details");
      return new Response(
        JSON.stringify(
          options.result ?? {
            candidates: [
              {
                finishReason: "STOP",
                content: { parts: [{ text: JSON.stringify(estimate) }] },
              },
            ],
          },
        ),
        { status: options.status ?? 200 },
      );
    }) as typeof fetch,
  };
  const handler = createHandler(deps);
  return {
    run: (body: unknown = { text: "Mon repas", history: [] }, auth = true) =>
      handler(
        new Request("http://localhost/kermit", {
          method: "POST",
          headers: {
            ...(auth ? { authorization: "Bearer valid" } : {}),
            origin: "http://localhost:8787",
          },
          body: JSON.stringify(body),
        }),
      ),
    stats: () => ({ calls, reservations, sent }),
    handler,
  };
}
test("Edge logs only fixed Google error codes without leaking upstream details or retrying", async () => {
  const logs: string[] = [];
  const warn = console.warn;
  console.warn = (message: string) => logs.push(message);
  try {
    for (const status of ["INVALID_ARGUMENT", "private user text and server-only key"]) {
      const s = setup({ status: 400, result: { error: { status, message: "private photo and prompt" } } });
      const response = await s.run();
      assert.equal(response.status, 502);
      assert.equal(s.stats().calls, 1);
      assert.equal(s.stats().reservations, 1);
      assert.deepEqual(JSON.parse(logs.at(-1)!), {
        event: "kermit_google_error", status: 400,
        code: status === "INVALID_ARGUMENT" ? status : "UNKNOWN",
      });
      assert(!JSON.stringify(logs).includes("private"));
      assert(!(await response.text()).includes("private"));
    }
  } finally {
    console.warn = warn;
  }
});
test("Edge rejects unauthenticated and expired sessions before quotas or Gemini", async () => {
  const s = setup();
  assert.equal((await s.run(undefined, false)).status, 401);
  assert.equal(s.stats().reservations, 0);
  const expired = setup({ user: null });
  assert.equal((await expired.run()).status, 401);
  assert.equal(expired.stats().calls, 0);
});
test("Edge validates before charging and handles missing secrets", async () => {
  const s = setup();
  assert.equal((await s.run({ text: "", history: [] })).status, 400);
  assert.equal(s.stats().reservations, 0);
  const missing = setup({ missingKey: true });
  assert.equal((await missing.run()).status, 503);
  assert.equal(missing.stats().calls, 0);
});
test("Edge checks individual/global/access quotas without calling Google", async () => {
  for (const quota of ["daily", "busy", "denied"]) {
    const s = setup({ quota });
    assert.equal((await s.run()).status, quota === "denied" ? 403 : 429);
    assert.equal(s.stats().calls, 0);
  }
});
test("Edge calls configured model, keeps context and assigns meal IDs", async () => {
  const s = setup();
  const response = await s.run();
  assert.equal(response.status, 200);
  const reply = await response.json();
  assert.match(reply.meal_id, /^[0-9a-f-]{36}$/);
  assert(!JSON.stringify(reply).includes("server-only"));
  assert(s.stats().sent?.url.endsWith("gemini-3.5-flash-lite:generateContent"));
  const correction = setup({
    result: {
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              { text: JSON.stringify({ ...estimate, meal_id: reply.meal_id }) },
            ],
          },
        },
      ],
    },
  });
  assert.equal(
    (
      await correction.run({
        text: "Moins de sauce",
        history: [
          { role: "user", text: "Repas" },
          { role: "model", text: JSON.stringify(reply) },
        ],
      })
    ).status,
    200,
  );
  assert.equal(correction.stats().sent?.body.contents.length, 3);
});
test("Edge handles invalid JSON, contradiction, quota and network without retries", async () => {
  for (const options of [
    { status: 429 },
    { fail: true },
    {
      result: {
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: "{" }] } },
        ],
      },
    },
    {
      result: {
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { text: JSON.stringify({ ...estimate, total_kcal: 900 }) },
              ],
            },
          },
        ],
      },
    },
  ]) {
    const s = setup(options);
    const response = await s.run();
    assert(response.status >= 400);
    assert.equal(s.stats().calls, 1);
    assert.equal(s.stats().reservations, 1);
    assert(!(await response.text()).includes("secret internal"));
  }
});
test("Edge CORS restricts origins", async () => {
  const s = setup();
  assert.equal(
    (
      await s.handler(
        new Request("http://localhost/kermit", {
          headers: { origin: "https://unknown.test" },
        }),
      )
    ).status,
    403,
  );
});
test("Edge validates image dimensions and counts one photo plus text as one call", async () => {
  // Minimal JPEG frame header: enough to exercise transport validation, not a real photo for Google.
  const frame = (width: number) =>
    `data:image/jpeg;base64,${Buffer.from([255, 216, 255, 192, 0, 11, 8, 0, 1, width >> 8, width & 255, 1, 1, 17, 0, 255, 217]).toString("base64")}`;
  const s = setup();
  assert.equal(
    (await s.run({ text: "Mon repas", history: [], image: frame(1025) }))
      .status,
    400,
  );
  assert.equal(s.stats().reservations, 0);
  assert.equal(
    (await s.run({ text: "Mon repas", history: [], image: frame(1) })).status,
    200,
  );
  assert.equal(s.stats().calls, 1);
  assert.equal(
    s.stats().sent?.body.contents[0].parts[1].inlineData.mimeType,
    "image/jpeg",
  );
  assert.equal(
    (
      await s.run({
        text: "x",
        history: [],
        ignored_user_id: "other-account",
        image: "x".repeat(850001),
      })
    ).status,
    413,
  );
  assert.equal(s.stats().reservations, 1);
});
test("Edge rejects model-selected unknown meal IDs and truncated responses", async () => {
  for (const candidate of [
    {
      finishReason: "MAX_TOKENS",
      content: { parts: [{ text: JSON.stringify(estimate) }] },
    },
    {
      finishReason: "STOP",
      content: {
        parts: [
          { text: JSON.stringify({ ...estimate, meal_id: "unrelated-meal" }) },
        ],
      },
    },
  ])
    assert.equal(
      (await setup({ result: { candidates: [candidate] } }).run()).status,
      502,
    );
});
