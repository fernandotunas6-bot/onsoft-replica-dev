/// <reference types="vite/client" />
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// API activation intentionally requires a code integration and server review.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* Installation can be retried on next load. */
    });
  });
