import { supabase } from "./persistence";
import { cloud } from "./cloud";
import {
  parseNotificationPreferences,
  type NotificationPreferences,
  type Snooze,
} from "../supabase/functions/_shared/notification-rules";

export interface NotificationStatus {
  settings: NotificationPreferences;
  publicKey: string;
  deviceActive: boolean;
  snoozes: Snooze[];
}
export function installationId() {
  const key = "kalo:push-installation";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
export function iphonePushSupport() {
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  return {
    ios,
    installed,
    supported,
    permission: "Notification" in window ? Notification.permission : "default",
  };
}
async function user() {
  if (!supabase) throw new Error("Connecte-toi pour régler tes notifications.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session)
    throw new Error("Connecte-toi pour régler tes notifications.");
  return data.session;
}
export async function notificationApi<T>(
  action: string,
  payload: Record<string, unknown> = {},
  expectedUser?: string,
): Promise<T> {
  const session = await user();
  if (expectedUser && session.user.id !== expectedUser)
    throw new Error("Le compte actif a changé.");
  const url = import.meta.env.VITE_SUPABASE_URL || cloud.url;
  const response = await fetch(`${url}/functions/v1/notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey:
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || cloud.publishableKey,
    },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(action === "weekly-generate" ? 35_000 : 15_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      result.error || "Le service de notifications est indisponible.",
    );
  return result as T;
}
export const getNotificationStatus = (expectedUser?: string) =>
  notificationApi<NotificationStatus>(
    "status",
    { installation: installationId() },
    expectedUser,
  );
export const saveNotificationPreferences = (
  settings: NotificationPreferences,
  expectedUser: string,
) =>
  notificationApi<{ settings: NotificationPreferences }>(
    "save",
    { settings: parseNotificationPreferences(settings) },
    expectedUser,
  );

function applicationKey(key: string) {
  const value = atob(
    key.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (key.length % 4)) % 4),
  );
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i);
  return bytes;
}
async function bindDevice(status: NotificationStatus, expectedUser: string) {
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription)
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationKey(status.publicKey),
    });
  await notificationApi(
    "subscribe",
    {
      installation: installationId(),
      subscription: subscription.toJSON(),
      origin: registration.scope,
    },
    expectedUser,
  );
}
export async function activateIphoneNotifications(
  settings: NotificationPreferences,
  expectedUser: string,
) {
  const p = parseNotificationPreferences({ ...settings, enabled: true });
  const support = iphonePushSupport();
  if (!support.ios || !support.installed || !support.supported)
    throw new Error(
      "Sur iPhone, ajoute Kalo à l’écran d’accueil puis ouvre-le depuis son icône.",
    );
  // Must remain before any network await: iOS requires a direct user gesture.
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Autorise les notifications de Kalo dans les réglages de ton iPhone.",
    );
  const session = await user();
  if (session.user.id !== expectedUser)
    throw new Error("Le compte actif a changé.");
  const status = await getNotificationStatus(session.user.id);
  await bindDevice(status, session.user.id);
  await notificationApi("save", { settings: p }, session.user.id);
  return getNotificationStatus(session.user.id);
}
export async function detachDevicePush() {
  let registered = false;
  try {
    registered = localStorage.getItem("kalo:push-installation") !== null;
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) {
        registered = true;
        await subscription.unsubscribe();
      }
    }
  } catch {
    /* Notification support must never prevent signing out. */
  }
  if (!registered) return;
  // Revoking the browser subscription also stops delivery if the network is unavailable.
  try {
    await notificationApi("unsubscribe", { installation: installationId() });
  } catch {
    /* Stale endpoints are removed on Apple's 410 response. */
  }
}
export async function syncDevicePush(expectedUser: string) {
  const support = iphonePushSupport();
  if (
    !support.ios ||
    !support.installed ||
    !support.supported ||
    support.permission !== "granted"
  )
    return;
  if (expectedUser === "guest") {
    await detachDevicePush();
    return;
  }
  const status = await getNotificationStatus(expectedUser);
  if (!status.settings.enabled) {
    await detachDevicePush();
    return;
  }
  await bindDevice(status, expectedUser);
}
