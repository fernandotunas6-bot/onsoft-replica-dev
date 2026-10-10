import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConnectedMobile } from "../staging/Connected";
import "../src/styles.css";

// Entrada publicada em m.portal-siga.com/mobile/ pelo Worker do portal.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConnectedMobile />
  </StrictMode>,
);
// O service worker só guarda o shell compilado (scripts/pwa.mjs): nunca sessão nem API.
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {
      /* Tenta de novo no próximo carregamento. */
    });
  });
