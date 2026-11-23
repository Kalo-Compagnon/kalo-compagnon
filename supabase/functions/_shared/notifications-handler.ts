import {
  defaultNotificationPreferences,
  parseNotificationPreferences,
  localClock,
  stopMinute,
  dueReminders,
  isMissing,
  mealSlots,
  type MissingKind,
  type NotificationPreferences,
  type NotificationSnapshot,
  type Reminder,
  type Snooze,
} from "./notification-rules.ts";

export interface PushDevice {
  id: string;
  user_id: string;
  installation_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  origin: string;
}
export interface PushBackend {
  user(token: string): Promise<string | null>;
  keys(): Promise<{ publicKey: string; privateKey: string }>;
  allowed(secret: string): Promise<boolean>;
  preferences(user: string): Promise<NotificationPreferences | null>;
  savePreferences(
    user: string,
    settings: NotificationPreferences,
  ): Promise<void>;
  enabledPreferences(): Promise<
    { user_id: string; settings: NotificationPreferences }[]
  >;
  devices(user: string): Promise<PushDevice[]>;
  register(
    user: string,
    installation: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    origin: string,
  ): Promise<void>;
  removeDevice(id: string): Promise<void>;
  snoozes(user: string, day: string): Promise<Snooze[]>;
  snooze(
    user: string,
    day: string,
    kind: MissingKind,
    at: string,
  ): Promise<void>;
  snapshot(
    user: string,
    day: string,
    timezone: string,
  ): Promise<NotificationSnapshot>;
  claim(device: string, key: string, day: string): Promise<boolean>;
  sent(device: string, key: string): Promise<void>;
  send(
    device: PushDevice,
    reminder: Reminder,
    keys: { publicKey: string; privateKey: string },
  ): Promise<number>;
  now(): Date;
}
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
export function validateAppleSubscription(value: unknown) {
  const s = value as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  if (!s || typeof s.endpoint !== "string" || s.endpoint.length > 4096)
    throw new Error("Abonnement invalide.");
  const endpoint = new URL(s.endpoint);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== "web.push.apple.com" ||
    endpoint.port ||
    endpoint.username ||
    endpoint.password
  )
    throw new Error("Cet abonnement n’est pas un abonnement Apple.");
  if (
    !s.keys ||
    !/^[\w-]{87}$/.test(s.keys.p256dh) ||
    !/^[\w-]{22}$/.test(s.keys.auth)
  )
    throw new Error("Clés d’abonnement invalides.");
  return {
    endpoint: endpoint.href,
    keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
  };
}
function appOrigin(value: unknown) {
  if (typeof value !== "string" || value.length > 300)
    throw new Error("Adresse Kalo invalide.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "kalo-compagnon.github.io" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error(
      "Ouvre Kalo depuis son adresse publiée pour activer les notifications.",
    );
  url.search = "";
  url.hash = "";
  return url.href;
}
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: cors });
export function createNotificationsHandler(b: PushBackend) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST")
      return json({ error: "Méthode non autorisée." }, 405);
    try {
      const text = await req.text();
      if (text.length > 20_000)
        return json({ error: "Requête trop volumineuse." }, 413);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: "Requête invalide." }, 400);
      }
      if (!body || typeof body !== "object")
        return json({ error: "Requête invalide." }, 400);
      const now = b.now();
      if (body.action === "dispatch") {
        const secret = req.headers.get("x-kalo-dispatch") ?? "";
        if (
          secret.length < 32 ||
          secret.length > 128 ||
          !(await b.allowed(secret))
        )
          return json({ error: "Accès refusé." }, 401);
        const keys = await b.keys();
        let sent = 0,
          failed = 0;
        for (const account of await b.enabledPreferences()) {
          const p = parseNotificationPreferences(account.settings),
            day = localClock(now, p.timezone).day;
          const [snapshot, snoozes, devices] = await Promise.all([
            b.snapshot(account.user_id, day, p.timezone),
            b.snoozes(account.user_id, day),
            b.devices(account.user_id),
          ]);
          for (const device of devices) {
            for (const reminder of dueReminders(p, snapshot, snoozes, now)) {
              if (!(await b.claim(device.id, reminder.key, day))) continue;
              try {
                // Recheck the journal just before sending, not only at the start of the batch.
                if (
                  !reminder.kind.startsWith("before:") &&
                  !isMissing(
                    reminder.kind as MissingKind,
                    p,
                    await b.snapshot(account.user_id, day, p.timezone),
                    day,
                  )
                ) {
                  await b.sent(device.id, reminder.key);
                  continue;
                }
                const status = await b.send(device, reminder, keys);
                if (status === 404 || status === 410) {
                  await b.removeDevice(device.id);
                  break;
                }
                if (status < 200 || status >= 300) {
                  failed++;
                  continue;
                }
                await b.sent(device.id, reminder.key);
                sent++;
              } catch {
                failed++;
              }
            }
          }
        }
        return json({ sent, failed });
      }
      const token =
        req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
      const user = token ? await b.user(token) : null;
      if (!user)
        return json(
          { error: "Connecte-toi pour régler tes notifications." },
          401,
        );
      const p = (await b.preferences(user)) ?? defaultNotificationPreferences();
      const clock = localClock(now, p.timezone);
      if (body.action === "status") {
        const keys = await b.keys();
        const [devices, snoozes] = await Promise.all([
          b.devices(user),
          b.snoozes(user, clock.day),
        ]);
        return json({
          settings: p,
          publicKey: keys.publicKey,
          deviceActive:
            uuid(body.installation) &&
            devices.some((d) => d.installation_id === body.installation),
          snoozes,
        });
      }
      if (body.action === "save") {
        let settings: NotificationPreferences;
        try {
          settings = parseNotificationPreferences(body.settings);
        } catch (error) {
          return json({ error: (error as Error).message }, 400);
        }
        await b.savePreferences(user, settings);
        return json({ settings });
      }
      if (body.action === "subscribe") {
        if (!uuid(body.installation))
          return json({ error: "Appareil invalide." }, 400);
        let subscription, origin;
        try {
          subscription = validateAppleSubscription(body.subscription);
          origin = appOrigin(body.origin);
        } catch (error) {
          return json({ error: (error as Error).message }, 400);
        }
        await b.register(user, body.installation, subscription, origin);
        return json({ subscribed: true });
      }
      if (body.action === "unsubscribe") {
        if (!uuid(body.installation))
          return json({ error: "Appareil invalide." }, 400);
        for (const device of await b.devices(user))
          if (device.installation_id === body.installation)
            await b.removeDevice(device.id);
        return json({ subscribed: false });
      }
      if (body.action === "later") {
        const kinds = ["weight", "steps", ...mealSlots.map((s) => `meal:${s}`)];
        if (
          typeof body.kind !== "string" ||
          !kinds.includes(body.kind) ||
          body.day !== clock.day
        )
          return json(
            { error: "Ce rappel ne concerne pas la journée en cours." },
            400,
          );
        const kind = body.kind as MissingKind;
        if (
          !isMissing(
            kind,
            p,
            await b.snapshot(user, clock.day, p.timezone),
            clock.day,
          )
        )
          return json({ completed: true });
        await b.snooze(user, clock.day, kind, now.toISOString());
        const nextAt = new Date(now.getTime() + 45 * 60_000);
        const nextClock = localClock(nextAt, p.timezone);
        return json({
          nextAt: nextAt.toISOString(),
          stoppedToday:
            nextClock.day !== clock.day || nextClock.minute >= stopMinute(p),
        });
      }
      if (body.action === "test") {
        if (!uuid(body.installation))
          return json({ error: "Appareil invalide." }, 400);
        const device = (await b.devices(user)).find(
          (d) => d.installation_id === body.installation,
        );
        if (!device)
          return json(
            { error: "Active les notifications sur cet iPhone d’abord." },
            400,
          );
        const key = `test:${Math.floor(now.getTime() / 60_000)}`;
        if (!(await b.claim(device.id, key, clock.day)))
          return json(
            { error: "Un test a déjà été envoyé. Réessaie dans une minute." },
            429,
          );
        const status = await b.send(
          device,
          {
            key,
            kind: "weight",
            day: clock.day,
            title: "Kalo · Les notifications sont prêtes",
            body: "Tu recevras ici les rappels que tu as choisis.",
            ttl: 60,
          },
          await b.keys(),
        );
        if (status < 200 || status >= 300)
          return json(
            {
              error:
                "L’envoi du test a échoué. Réactive les notifications sur cet iPhone.",
            },
            502,
          );
        await b.sent(device.id, key);
        return json({ sent: true });
      }
      return json({ error: "Action inconnue." }, 400);
    } catch {
      // Never log or return subscription endpoints, auth tokens, journal data or VAPID keys.
      return json(
        {
          error:
            "Le service de notifications est indisponible. Réessaie dans un instant.",
        },
        503,
      );
    }
  };
}
