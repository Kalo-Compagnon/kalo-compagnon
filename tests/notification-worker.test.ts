import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function worker() {
  const listeners: Record<string, (event: any) => void> = {};
  const notifications: any[] = [],
    messages: any[] = [],
    opened: string[] = [];
  let focused = false;
  const scope = "https://kalo-compagnon.github.io/kalo-compagnon/";
  const client = {
    url: scope,
    postMessage: (message: unknown) => messages.push(message),
    focus: async () => {
      focused = true;
    },
  };
  const self = {
    location: { origin: "https://kalo-compagnon.github.io" },
    addEventListener: (name: string, callback: (event: any) => void) => {
      listeners[name] = callback;
    },
    registration: {
      scope,
      showNotification: async (title: string, options: unknown) => {
        notifications.push({ title, options });
      },
    },
    clients: {
      matchAll: async () => [client],
      openWindow: async (url: string) => {
        opened.push(url);
      },
      claim: async () => {},
    },
    skipWaiting: async () => {},
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self,
    URL,
    caches: { delete: async () => {} },
  });
  const dispatch = async (name: string, event: object) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners[name]({
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
  };
  return {
    listeners,
    dispatch,
    notifications,
    messages,
    opened,
    focused: () => focused,
    scope,
  };
}
test("le worker affiche les pushs sans intercepter les fichiers de l'application", async () => {
  const w = worker();
  await w.dispatch("push", {
    data: {
      json: () => ({
        title: "Pesée",
        body: "À compléter",
        url: w.scope + "?kaloReminder=weight",
      }),
    },
  });
  assert.equal(w.notifications[0].title, "Pesée");
  assert.equal(w.notifications[0].options.body, "À compléter");
  assert.equal(w.listeners.fetch, undefined);
});
test("un clic retrouve la fenêtre Kalo et lui transmet le rappel", async () => {
  const w = worker();
  let closed = false;
  await w.dispatch("notificationclick", {
    notification: {
      close() {
        closed = true;
      },
      data: { url: w.scope + "?kaloReminder=steps&account=test" },
    },
  });
  assert.equal(closed, true);
  assert.equal(w.focused(), true);
  assert.equal(w.messages[0].type, "KALO_REMINDER");
  assert.equal(w.opened.length, 0);
});
test("un push malformé reste affichable ; aucun clic ne redirige vers un autre site", async () => {
  const w = worker();
  await w.dispatch("push", {
    data: {
      json() {
        throw Error();
      },
    },
  });
  assert.equal(w.notifications[0].title, "Rappel");
  for (const url of [
    "https://evil.test/",
    "https://kalo-compagnon.github.io/another-app/",
  ])
    await w.dispatch("notificationclick", {
      notification: { close() {}, data: { url } },
    });
  assert.equal(w.messages.length, 0);
  assert.equal(w.opened.length, 0);
});
