import { useState } from "react";
import { FinalPauta } from "./components/FinalPauta";
import { MiniPauta } from "./components/MiniPauta";
import { finalPautaDemo, miniPautaDemo } from "./data/demo";
import "./styles.css";

export default function App() {
  const [view, setView] = useState<"final" | "mini">("final");
  return (
    <main className="app-shell">
      <nav className="toolbar no-print">
        <div>
          <strong>SIGA · Documentos Pedagógicos</strong>
          <small>Modelos angolanos parametrizáveis</small>
        </div>
        <div className="actions">
          <button className={view === "final" ? "active" : ""} onClick={() => setView("final")}>
            Pauta Final
          </button>
          <button className={view === "mini" ? "active" : ""} onClick={() => setView("mini")}>
            Mini Pauta
          </button>
          <button onClick={() => window.print()}>Imprimir / PDF</button>
        </div>
      </nav>
      {view === "final" ? <FinalPauta data={finalPautaDemo} /> : <MiniPauta data={miniPautaDemo} />}
    </main>
  );
}
