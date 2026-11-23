import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { generateVAPIDKeys, generateRequestDetails } from "npm:web-push@4.0.0";
import {
  createNotificationsHandler,
  type PushDevice,
  type PushBackend,
} from "../_shared/notifications-handler.ts";
import { createWeeklyService } from "../_shared/weekly-service.ts";
import { createWeeklyBackend } from "../_shared/weekly-adapter.ts";
import type {
  NotificationPreferences,
  NotificationSnapshot,
  Reminder,
  Snooze,
} from "../_shared/notification-rules.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
async function result<T>(
  query: PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error("Notification storage unavailable");
  return data as T;
}
const devices = (user: string) =>
  result<PushDevice[]>(
    db.from("logger_push_subscriptions").select("*").eq("user_id", user),
  );
async function keys() {
  let stored = await result<{ publicKey: string; privateKey: string }>(
    db.rpc("logger_push_keys"),
  );
  if (!stored.publicKey) {
    const generated = generateVAPIDKeys();
    stored = await result(
      db.rpc("logger_push_keys", {
        p_public: generated.publicKey,
        p_private: generated.privateKey,
      }),
    );
  }
  return stored;
}
const push: PushBackend = {
  now: () => new Date(),
  user: async (token) => {
    const { data, error } = await db.auth.getUser(token);
    return error ? null : (data.user?.id ?? null);
  },
  keys,
  allowed: (secret) =>
    result<boolean>(
      db.rpc("logger_push_dispatch_allowed", { p_secret: secret }),
    ),
  preferences: async (user) =>
    (
      await result<{ settings: NotificationPreferences } | null>(
        db
          .from("logger_push_preferences")
          .select("settings")
          .eq("user_id", user)
          .maybeSingle(),
      )
    )?.settings ?? null,
  savePreferences: async (user, settings) => {
    await result(
      db.from("logger_push_preferences").upsert({
        user_id: user,
        settings,
        updated_at: new Date().toISOString(),
      }),
    );
  },
  enabledPreferences: () =>
    result<{ user_id: string; settings: NotificationPreferences }[]>(
      db
        .from("logger_push_preferences")
        .select("user_id,settings")
        .eq("settings->>enabled", "true"),
    ),
  devices,
  register: async (user, installation, subscription, origin) => {
    await result(
      db.rpc("logger_push_register", {
        p_user: user,
        p_installation: installation,
        p_endpoint: subscription.endpoint,
        p_p256dh: subscription.keys.p256dh,
        p_auth: subscription.keys.auth,
        p_origin: origin,
      }),
    );
  },
  removeDevice: async (id) => {
    await result(db.from("logger_push_subscriptions").delete().eq("id", id));
  },
  snoozes: (user, day) =>
    result<Snooze[]>(
      db
        .from("logger_push_snoozes")
        .select("kind,day,started_at")
        .eq("user_id", user)
        .eq("day", day),
    ),
  snooze: async (user, day, kind, at) => {
    await result(
      db
        .from("logger_push_snoozes")
        .upsert(
          { user_id: user, day, kind, started_at: at },
          { onConflict: "user_id,day,kind" },
        ),
    );
  },
  snapshot: (user, day, timezone) =>
    result<NotificationSnapshot>(
      db.rpc("logger_push_snapshot", {
        p_user: user,
        p_day: day,
        p_timezone: timezone,
      }),
    ),
  claim: (device, key, day) =>
    result<boolean>(
      db.rpc("logger_push_claim", {
        p_subscription: device,
        p_key: key,
        p_day: day,
      }),
    ),
  sent: async (device, key) => {
    await result(
      db
        .from("logger_push_deliveries")
        .update({ sent_at: new Date().toISOString() })
        .eq("subscription_id", device)
        .eq("delivery_key", key),
    );
  },
  send: async (device: PushDevice, reminder: Reminder, vapid) => {
    // Apple endpoints only: this fetch must never accept an arbitrary URL (SSRF).
    if (new URL(device.endpoint).origin !== "https://web.push.apple.com")
      throw new Error("Invalid push service");
    const url = new URL(device.origin);
    url.searchParams.set("kaloReminder", reminder.kind);
    url.searchParams.set("account", device.user_id);
    url.searchParams.set("reminderDay", reminder.day);
    const details = generateRequestDetails(
      {
        endpoint: device.endpoint,
        keys: { p256dh: device.p256dh, auth: device.auth },
      },
      JSON.stringify({
        title: reminder.title,
        body: reminder.body,
        tag: `kalo-${reminder.kind}`,
        url: url.href,
      }),
      {
        TTL: reminder.ttl,
        urgency: "normal",
        contentEncoding: "aes128gcm",
        vapidDetails: {
          subject: "https://kalo-compagnon.github.io",
          ...vapid,
        },
      },
    );
    const response = await fetch(details.endpoint, {
      method: details.method,
      headers: details.headers,
      body: details.body,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    return response.status;
  },
};
const weekly = createWeeklyService(
  createWeeklyBackend(db, push, (name) => Deno.env.get(name)),
);
Deno.serve(
  createNotificationsHandler({
    ...push,
    weeklyRequest: weekly.request,
    weeklyDispatch: weekly.dispatch,
  }),
);
