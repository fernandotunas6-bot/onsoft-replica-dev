/// <reference types="vite/client" />
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { institutionalGateway } from "./services/bootstrap";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App initialGateway={institutionalGateway(import.meta.env.VITE_MOBILE_V4_API_MODE)} />
  </StrictMode>,
);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* Installation can be retried on next load. */
    });
  });
