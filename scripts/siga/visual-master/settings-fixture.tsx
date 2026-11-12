import React from "react";
import { createRoot } from "react-dom/client";
import { User, Building2, Sliders, Palette } from "lucide-react";
import { StackedModal } from "@/components/ui/stacked-modal";
import { StackedModal as Before } from "./stacked-before";
import "@/styles.css";
const panels = [
  {
    id: "root",
    title: "Definições",
    icon: Sliders,
    rows: [
      { label: "Conta", icon: User, to: "conta" },
      { label: "Escola", icon: Building2, to: "escola" },
      { label: "Aparência", icon: Palette, to: "aparencia" },
    ],
  },
  {
    id: "conta",
    title: "Conta",
    description: "Perfil institucional",
    icon: User,
    render: () => (
      <div className="space-y-5">
        <label className="block text-sm font-medium">
          Nome completo
          <input
            className="mt-2 block min-h-11 w-full rounded-lg border border-border bg-card px-3"
            defaultValue="Utilizador de ensaio"
          />
        </label>
        <label className="block text-sm font-medium">
          E-mail institucional
          <input
            className="mt-2 block min-h-11 w-full rounded-lg border border-border bg-card px-3"
            defaultValue="ensaio@example.invalid"
          />
        </label>
        <button className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground">
          Guardar
        </button>
      </div>
    ),
  },
  {
    id: "escola",
    title: "Escola",
    icon: Building2,
    render: () => <p>Identidade institucional — dados de ensaio</p>,
  },
  { id: "aparencia", title: "Aparência", icon: Palette, render: () => <p>Preferências visuais</p> },
];
const before = new URLSearchParams(location.search).get("mode") === "before";
createRoot(document.getElementById("root")!).render(
  <div className="min-h-screen bg-background text-foreground">
    <div className="border-b border-border px-5 py-3 text-sm">
      SIGA Plus · Ensaio do componente partilhado
    </div>
    <main className="mx-auto max-w-6xl px-4 py-4">
      {before ? (
        <Before
          open
          panels={panels}
          rootId="root"
          eyebrow="SIGA"
          size="xl"
          onOpenChange={() => {}}
        />
      ) : (
        <StackedModal
          open
          presentation="page"
          panels={panels}
          rootId="root"
          eyebrow="SIGA"
          onOpenChange={() => {}}
        />
      )}
    </main>
  </div>,
);
