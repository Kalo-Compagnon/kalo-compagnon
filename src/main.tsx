import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./styles.css";
import "./campus-theme.css";
import "./appearance.css";
import "./accent.css";
import App from "./App";
import { installDisclosureMotion } from "./disclosure-motion";
const stopDisclosureMotion = installDisclosureMotion();
import.meta.hot?.dispose(stopDisclosureMotion);
// Replace the old cache-first worker with the notification worker at the same scope.
if ("serviceWorker" in navigator)
  void navigator.serviceWorker
    .register(
      new URL("sw.js", new URL(import.meta.env.BASE_URL, document.baseURI))
        .href,
      { updateViaCache: "none" },
    )
    .catch(() => {
      /* The journal remains usable without push support. */
    });
createRoot(document.getElementById("root")!).render(<App />);
