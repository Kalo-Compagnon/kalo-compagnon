import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./styles.css";
import "./campus-theme.css";
import "./appearance.css";
import "./accent.css";
import App from "./App";
// Replace the previous prototype's cache-first worker, which otherwise serves stale HTML.
if ("serviceWorker" in navigator)
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      Promise.all(
        registrations
          .filter((r) => new URL(r.scope).origin === location.origin)
          .map((r) => r.unregister()),
      ),
    );
createRoot(document.getElementById("root")!).render(<App />);
