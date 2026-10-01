import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-700.css";
import "./styles.css";
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
