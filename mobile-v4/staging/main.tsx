import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConnectedMobile } from "./Connected";
import "../src/styles.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConnectedMobile />
  </StrictMode>,
);
