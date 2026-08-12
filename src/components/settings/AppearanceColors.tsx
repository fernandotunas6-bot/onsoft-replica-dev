import { Check, Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { accentPresets, sidebarPresets, useAppearance, type ThemeMode } from "@/lib/appearance";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const modes: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
  { id: "system", label: "Sistema", icon: Monitor },
];

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3">
        <Label className="text-sm font-semibold">{title}</Label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Painel de cores por utilizador: modo, destaque do sistema e fundo do sidebar. */
export function AppearanceColors() {
  const { state, set, reset } = useAppearance();

  return (
    <div className="space-y-3">
      <Section title="Modo" hint="Aplica-se de imediato e fica guardado neste dispositivo.">
        <div className="grid grid-cols-3 gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => set({ mode: m.id })}
              aria-pressed={state.mode === m.id}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors",
                state.mode === m.id
                  ? "border-primary bg-primary/10 text-primary-strong"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              <m.icon className="size-4" />
              {m.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Cor do sistema" hint="Botões, gráficos, ícones e estados activos.">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {accentPresets.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.label}
              aria-label={`Cor do sistema: ${p.label}`}
              aria-pressed={state.accent === p.id}
              onClick={() => set({ accent: p.id })}
              className={cn(
                "flex aspect-square items-center justify-center rounded-xl ring-2 ring-offset-2 ring-offset-card transition-transform hover:scale-105",
                state.accent === p.id ? "ring-primary" : "ring-transparent",
              )}
              style={{ backgroundColor: p.swatch }}
            >
              {state.accent === p.id ? <Check className="size-4 text-primary-foreground" /> : null}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Fundo do sidebar" hint="Escolhe o tom da barra lateral.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sidebarPresets.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={state.sidebar === p.id}
              onClick={() => set({ sidebar: p.id })}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-xs font-medium transition-colors",
                state.sidebar === p.id
                  ? "border-primary bg-primary/10 text-primary-strong"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              <span
                className="size-7 shrink-0 rounded-lg border border-border"
                style={{ backgroundColor: p.swatch }}
              />
              <span className="truncate">{p.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Arredondamento" hint={`Raio actual: ${state.radius.toFixed(3)}rem`}>
        <Slider
          value={[state.radius]}
          min={0}
          max={1.5}
          step={0.125}
          onValueChange={(v) => set({ radius: v[0] ?? 0.875 })}
          aria-label="Arredondamento dos cantos"
        />
      </Section>

      <Button variant="outline" size="sm" onClick={reset} className="gap-2">
        <RotateCcw className="size-4" />
        Restaurar padrão SIGA
      </Button>
    </div>
  );
}
