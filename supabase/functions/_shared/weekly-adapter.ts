import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import type { PushBackend } from "./notifications-handler.ts";
import { localClock, stopMinute } from "./notification-rules.ts";
import {
  shiftWeekDay,
  weeklyTimezone,
  type WeeklyMetrics,
  type WeeklySource,
} from "./weekly-metrics.ts";
import {
  weeklySystemPrompt,
  weeklyResponseSchema,
  validateWeeklyNarrative,
  type WeeklyBackend,
  type WeeklyReport,
} from "./weekly-service.ts";

export function createWeeklyBackend(
  db: SupabaseClient,
  push: PushBackend,
  env: (name: string) => string | undefined,
  fetcher: typeof fetch = fetch,
): WeeklyBackend {
  const result = async <T>(
    query: PromiseLike<{ data: T | null; error: unknown }>,
  ): Promise<T> => {
    const { data, error } = await query;
    if (error)
      throw new Error("Le service de récap est indisponible pour le moment.");
    return data as T;
  };
  const fields =
    "week_start,status,metrics,narrative,generated_at,lease_until,attempts,error_code,notified_at";
  const report = (user: string, start: string) =>
    result<WeeklyReport | null>(
      db
        .from("logger_weekly_reports")
        .select(fields)
        .eq("user_id", user)
        .eq("week_start", start)
        .maybeSingle(),
    );
  return {
    now: () => new Date(),
    enabled: async (user) =>
      (
        await result<{ enabled: boolean } | null>(
          db
            .from("logger_weekly_preferences")
            .select("enabled")
            .eq("user_id", user)
            .maybeSingle(),
        )
      )?.enabled ?? false,
    setEnabled: async (user, enabled) => {
      if (
        enabled &&
        !(await result(
          db
            .from("kermit_users")
            .select("user_id")
            .eq("user_id", user)
            .maybeSingle(),
        ))
      )
        throw new Error("Le récap IA n’est pas activé pour ce compte.");
      await result(
        db
          .from("logger_weekly_preferences")
          .upsert({
            user_id: user,
            enabled,
            updated_at: new Date().toISOString(),
          }),
      );
    },
    list: (user) =>
      result<WeeklyReport[]>(
        db
          .from("logger_weekly_reports")
          .select(fields)
          .eq("user_id", user)
          .order("week_start", { ascending: false })
          .limit(53),
      ),
    report,
    claim: (user, start) =>
      result<string | null>(
        db.rpc("logger_weekly_claim", { p_user: user, p_week: start }),
      ),
    source: (user, start) =>
      result<WeeklySource>(
        db.rpc("logger_weekly_source", { p_user: user, p_week: start }),
      ),
    reserve: async (user, tokens) => {
      if (!env("GEMINI_API_KEY")) return "unavailable";
      return result<string>(
        db.rpc("reserve_kermit_call", { p_user: user, p_tokens: tokens }),
      );
    },
    generate: async (metrics: WeeklyMetrics) => {
      const key = env("GEMINI_API_KEY"),
        model = env("GEMINI_MODEL") || "gemini-3.5-flash-lite";
      if (!key || !/^[a-z0-9.-]+$/.test(model))
        throw new Error("Gemini unavailable");
      const response = await fetcher(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          signal: AbortSignal.timeout(20_000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: weeklySystemPrompt }] },
            contents: [
              { role: "user", parts: [{ text: JSON.stringify(metrics) }] },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: weeklyResponseSchema,
              maxOutputTokens: 4096,
            },
          }),
        },
      );
      if (!response.ok) throw new Error("Gemini unavailable");
      const payload = await response.json(),
        candidate = payload.candidates?.[0];
      if (candidate?.finishReason !== "STOP")
        throw new Error("Incomplete narrative");
      return validateWeeklyNarrative(
        JSON.parse(
          candidate.content.parts
            .filter((p: { thought?: boolean }) => !p.thought)
            .map((p: { text?: string }) => p.text ?? "")
            .join(""),
        ),
      );
    },
    finish: async (user, start, metrics, narrative, lease) => {
      await result(
        db
          .from("logger_weekly_reports")
          .update({
            status: metrics.hasData ? "ready" : "empty",
            metrics,
            narrative,
            generated_at: new Date().toISOString(),
            error_code: null,
            lease_until: new Date().toISOString(),
          })
          .eq("user_id", user)
          .eq("week_start", start)
          .eq("lease_token", lease)
          .eq("status", "generating"),
      );
    },
    fail: async (user, start, code, lease) => {
      await result(
        db
          .from("logger_weekly_reports")
          .update({
            status: "failed",
            error_code: code,
            lease_until: new Date(Date.now() + 10 * 60_000).toISOString(),
          })
          .eq("user_id", user)
          .eq("week_start", start)
          .eq("lease_token", lease)
          .eq("status", "generating"),
      );
    },
    users: async () => {
      const [preferences, allowed] = await Promise.all([
        result<{ user_id: string }[]>(
          db
            .from("logger_weekly_preferences")
            .select("user_id")
            .eq("enabled", true),
        ),
        result<{ user_id: string }[]>(
          db.from("kermit_users").select("user_id"),
        ),
      ]);
      return preferences
        .filter((p) => allowed.some((a) => a.user_id === p.user_id))
        .map((p) => p.user_id);
    },
    notify: async (user, start) => {
      const clock = localClock(new Date(), weeklyTimezone);
      if (clock.day !== shiftWeekDay(start, 6) || clock.minute < 1260) return;
      const p = await push.preferences(user);
      if (!p?.enabled || clock.minute >= stopMinute(p)) return;
      const devices = await push.devices(user);
      if (!devices.length) return;
      const keys = await push.keys(),
        key = `weekly:${start}`;
      let complete = true;
      for (const device of devices) {
        if (!(await push.claim(device.id, key, clock.day))) {
          const delivery = await result<{ sent_at: string | null } | null>(
            db
              .from("logger_push_deliveries")
              .select("sent_at")
              .eq("subscription_id", device.id)
              .eq("delivery_key", key)
              .maybeSingle(),
          );
          if (!delivery?.sent_at) complete = false;
          continue;
        }
        try {
          const status = await push.send(
            device,
            {
              key,
              kind: "weekly",
              day: start,
              title: "Ton bilan de la semaine est prêt",
              body: "Retrouve tes calories, tes apports et ta progression dans ton récap.",
              ttl: 300,
            },
            keys,
          );
          if (status === 404 || status === 410) {
            await push.removeDevice(device.id);
            continue;
          }
          if (status < 200 || status >= 300) {
            complete = false;
            continue;
          }
          await push.sent(device.id, key);
        } catch {
          complete = false;
        }
      }
      if (complete)
        await result(
          db
            .from("logger_weekly_reports")
            .update({ notified_at: new Date().toISOString() })
            .eq("user_id", user)
            .eq("week_start", start)
            .eq("status", "ready"),
        );
    },
  };
}
