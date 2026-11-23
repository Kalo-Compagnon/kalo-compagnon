// Notifications only. Navigation and assets always use the network and normal browser cache.
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      await caches.delete("logger-web-identique-v2");
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(
      typeof payload.title === "string" ? payload.title : "Kalo · Rappel",
      {
        body:
          typeof payload.body === "string"
            ? payload.body
            : "Ton journal t’attend dans Kalo.",
        icon: new URL(
          "assets/app-icons/v1/a89ae5/icon-192.png",
          self.registration.scope,
        ).href,
        tag: typeof payload.tag === "string" ? payload.tag : "kalo-reminder",
        data: {
          url:
            typeof payload.url === "string"
              ? payload.url
              : self.registration.scope,
        },
      },
    ),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = new URL(
        event.notification.data?.url || self.registration.scope,
      );
      if (
        url.origin !== self.location.origin ||
        !url.href.startsWith(self.registration.scope)
      )
        return;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (!client.url.startsWith(self.registration.scope)) continue;
        client.postMessage({ type: "KALO_REMINDER", url: url.href });
        await client.focus();
        return;
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
