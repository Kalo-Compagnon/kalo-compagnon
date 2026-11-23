import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createNotificationsHandler,
  validateAppleSubscription,
  type PushBackend,
  type PushDevice,
} from "../supabase/functions/_shared/notifications-handler";
import { defaultNotificationPreferences } from "../supabase/functions/_shared/notification-rules";

const installation = "10000000-0000-4000-8000-000000000001";
function setup() {
  const settings = defaultNotificationPreferences();
  settings.enabled = true;
  settings.weight.enabled = true;
  const claims = new Set<string>(),
    calls: string[] = [],
    sent: string[] = [];
  let complete = false,
    status = 201,
    removed = false;
  const device: PushDevice = {
    id: "device",
    user_id: "a",
    installation_id: installation,
    endpoint: "https://web.push.apple.com/test-endpoint",
    p256dh: "A".repeat(87),
    auth: "B".repeat(22),
    origin: "https://kalo-compagnon.github.io/kalo-compagnon/",
  };
  const backend: PushBackend = {
    now: () => new Date("2026-11-23T10:00:00+01:00"),
    user: async (token) =>
      token === "valid-a" ? "a" : token === "valid-b" ? "b" : null,
    keys: async () => ({
      publicKey: "public",
      privateKey: "private-never-exposed",
    }),
    allowed: async (secret) => secret === "S".repeat(64),
    preferences: async (user) => {
      calls.push(`preferences:${user}`);
      return settings;
    },
    savePreferences: async (user) => {
      calls.push(`save:${user}`);
    },
    enabledPreferences: async () => [{ user_id: "a", settings }],
    devices: async (user) => (user === "a" && !removed ? [device] : []),
    register: async (user) => {
      calls.push(`register:${user}`);
    },
    removeDevice: async () => {
      removed = true;
    },
    snoozes: async () => [],
    snooze: async (user, day, kind) => {
      calls.push(`later:${user}:${day}:${kind}`);
    },
    snapshot: async () => ({
      day: complete ? { weightKg: 70 } : {},
      entries: [],
    }),
    claim: async (id, key) => {
      if (claims.has(id + key)) return false;
      claims.add(id + key);
      return true;
    },
    sent: async (_, key) => {
      sent.push(key);
    },
    send: async () => status,
  };
  const handler = createNotificationsHandler(backend);
  const call = (body: object, token = "valid-a", secret?: string) =>
    handler(
      new Request("https://example.test/notifications", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(secret ? { "x-kalo-dispatch": secret } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  return {
    call,
    backend,
    settings,
    calls,
    sent,
    complete: () => {
      complete = true;
    },
    status: (value: number) => {
      status = value;
    },
    removed: () => removed,
  };
}
test("toutes les routes utilisateur exigent une session ; la clé privée n'est jamais renvoyée", async () => {
  const s = setup();
  assert.equal((await s.call({ action: "status" }, "invalid")).status, 401);
  const response = await s.call({ action: "status", installation });
  const body = await response.json();
  assert.equal(body.publicKey, "public");
  assert.ok(!JSON.stringify(body).includes("private-never-exposed"));
  assert.equal(body.deviceActive, true);
  const other = await (
    await s.call({ action: "status", installation, user_id: "a" }, "valid-b")
  ).json();
  assert.equal(other.deviceActive, false);
  assert.ok(s.calls.includes("preferences:b"));
});
test("le cron est privé ; les événements sont dédupliqués et arrêtent après complétion", async () => {
  const s = setup();
  assert.equal((await s.call({ action: "dispatch" })).status, 401);
  const first = await (
    await s.call({ action: "dispatch" }, "", "S".repeat(64))
  ).json();
  assert.equal(first.sent, 1);
  const second = await (
    await s.call({ action: "dispatch" }, "", "S".repeat(64))
  ).json();
  assert.equal(second.sent, 0);
  const completed = setup();
  completed.complete();
  assert.equal(
    (
      await (
        await completed.call({ action: "dispatch" }, "", "S".repeat(64))
      ).json()
    ).sent,
    0,
  );
});
test("un appareil désinscrit chez Apple est supprimé, un échec temporaire n'est pas marqué envoyé", async () => {
  const s = setup();
  s.status(410);
  await s.call({ action: "dispatch" }, "", "S".repeat(64));
  assert.equal(s.removed(), true);
  const failure = setup();
  failure.status(503);
  const result = await (
    await failure.call({ action: "dispatch" }, "", "S".repeat(64))
  ).json();
  assert.equal(result.failed, 1);
  assert.equal(failure.sent.length, 0);
});
test("plus tard : seulement la journée en cours, uniquement pour une saisie manquante et son propre compte", async () => {
  const s = setup();
  assert.equal(
    (await s.call({ action: "later", day: "2026-11-22", kind: "weight" }))
      .status,
    400,
  );
  const result = await (
    await s.call({
      action: "later",
      day: "2026-11-23",
      kind: "weight",
      user_id: "b",
    })
  ).json();
  assert.equal(result.nextAt, "2026-11-23T09:45:00.000Z");
  assert.ok(s.calls.includes("later:a:2026-11-23:weight"));
  s.complete();
  assert.equal(
    (
      await (
        await s.call({ action: "later", day: "2026-11-23", kind: "weight" })
      ).json()
    ).completed,
    true,
  );
});
test("abonnements : Apple uniquement, pas de requête SSRF ni d'adresse de site arbitraire", async () => {
  const subscription = {
    endpoint: "https://web.push.apple.com/test-endpoint",
    keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
  };
  assert.ok(validateAppleSubscription(subscription));
  for (const endpoint of [
    "http://127.0.0.1/private",
    "https://web.push.apple.com.evil.test/path",
    "https://user@web.push.apple.com/path",
    "https://web.push.apple.com:444/path",
  ])
    assert.throws(() =>
      validateAppleSubscription({ ...subscription, endpoint }),
    );
  const s = setup();
  assert.equal(
    (
      await s.call({
        action: "subscribe",
        installation,
        subscription,
        origin: "https://evil.test/",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await s.call({
        action: "subscribe",
        installation,
        subscription,
        origin: "https://kalo-compagnon.github.io/kalo-compagnon/",
        user_id: "b",
      })
    ).status,
    200,
  );
  assert.ok(s.calls.includes("register:a"));
});
test("test de notification limité à un envoi par minute et par appareil", async () => {
  const s = setup();
  assert.equal((await s.call({ action: "test", installation })).status, 200);
  assert.equal((await s.call({ action: "test", installation })).status, 429);
  assert.equal(
    (await s.call({ action: "test", installation }, "valid-b")).status,
    400,
  );
});
test("un report en fin de soirée respecte l’heure d’arrêt", async () => {
  const s = setup();
  s.backend.now = () => new Date("2026-11-23T21:40:00+01:00");
  const response = await (
    await s.call({ action: "later", day: "2026-11-23", kind: "weight" })
  ).json();
  assert.equal(response.stoppedToday, true);
  assert.ok(s.calls.some((call) => call.startsWith("later:a:")));
});
