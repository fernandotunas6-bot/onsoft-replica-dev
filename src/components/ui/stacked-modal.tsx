import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ElementType } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { IconChip, type ChipTone } from "@/components/ui/icon-chip";
import { cn } from "@/lib/utils";

/**
 * Modal em pilha (estilo Lovable "Configurações"): um único diálogo onde cada
 * função abre a função seguinte em profundidade, com histórico, migalhas de pão
 * e botão de voltar. Modular: os painéis são declarados como dados.
 */

export type StackPanel = {
  id: string;
  title: string;
  description?: string;
  icon: ElementType;
  tone?: ChipTone;
  /** Linhas que abrem painéis filhos (profundidade). */
  rows?: StackRow[];
  /** Conteúdo próprio do painel (formulários, tabelas, etc.). */
  render?: (ctx: StackNav) => ReactNode;
  /** Barra de acções fixa no fundo. */
  footer?: (ctx: StackNav) => ReactNode;
};

export type StackRow = {
  label: string;
  description?: string;
  icon: ElementType;
  tone?: ChipTone;
  badge?: string;
  /** Id do painel filho a abrir. */
  to?: string;
  onSelect?: (ctx: StackNav) => void;
};

export type StackNav = {
  push: (id: string) => void;
  back: () => void;
  reset: () => void;
  close: () => void;
  depth: number;
};

const NavContext = createContext<StackNav | null>(null);

export function useStackNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useStackNav deve ser usado dentro de <StackedModal>");
  return ctx;
}

export function StackedModal({
  open,
  onOpenChange,
  panels,
  rootId,
  eyebrow,
  size = "lg",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panels: StackPanel[];
  rootId: string;
  eyebrow?: string;
  size?: "md" | "lg" | "xl";
}) {
  const [stack, setStack] = useState<string[]>([rootId]);

  const byId = useMemo(() => new Map(panels.map((p) => [p.id, p])), [panels]);

  const push = useCallback(
    (id: string) => setStack((s) => (byId.has(id) ? [...s, id] : s)),
    [byId],
  );
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = useCallback(() => setStack([rootId]), [rootId]);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const nav: StackNav = useMemo(
    () => ({ push, back, reset, close, depth: stack.length }),
    [push, back, reset, close, stack.length],
  );

  const current = byId.get(stack[stack.length - 1] ?? rootId) ?? byId.get(rootId);
  if (!current) return null;

  const width = size === "xl" ? "sm:max-w-5xl" : size === "md" ? "sm:max-w-xl" : "sm:max-w-3xl";
  const trail = stack.map((id) => byId.get(id)?.title ?? id);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent
        className={cn("overflow-hidden border-border/70 p-0 shadow-2xl sm:rounded-2xl", width)}
      >
        <NavContext.Provider value={nav}>
          <header className="relative overflow-hidden border-b border-border/70 bg-gradient-to-br from-primary/12 via-primary/5 to-transparent px-5 py-4 md:px-6">
            <span className="pointer-events-none absolute -right-12 -top-20 size-44 rounded-full bg-primary/15 blur-3xl" />
            <div className="relative flex items-start gap-3">
              {stack.length > 1 ? (
                <button
                  type="button"
                  onClick={back}
                  aria-label="Voltar ao nível anterior"
                  className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <ChevronLeft className="size-4" />
                </button>
              ) : (
                <IconChip icon={current.icon} tone={current.tone ?? "primary"} size="md" />
              )}

              <div className="min-w-0 flex-1">
                <nav
                  aria-label="Percurso"
                  className="flex flex-wrap items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary"
                >
                  {eyebrow && stack.length === 1 ? <span>{eyebrow}</span> : null}
                  {trail.slice(0, -1).map((t, i) => (
                    <span key={`${t}-${i}`} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setStack((s) => s.slice(0, i + 1))}
                        className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        {t}
                      </button>
                      <ChevronRight className="size-3 opacity-70" aria-hidden />
                    </span>
                  ))}
                </nav>
                <DialogTitle className="font-display text-lg font-extrabold tracking-tight md:text-xl">
                  {current.title}
                </DialogTitle>
                {current.description ? (
                  <DialogDescription className="mt-0.5 text-sm">
                    {current.description}
                  </DialogDescription>
                ) : null}
              </div>

              <span className="size-9 shrink-0" aria-hidden />
            </div>
          </header>

          <div className="no-scrollbar max-h-[62vh] overflow-y-auto px-3 py-3 md:px-4 md:py-4">
            {current.rows?.length ? (
              <ul className="space-y-1">
                {current.rows.map((row) => (
                  <li key={row.label}>
                    <button
                      type="button"
                      onClick={() => {
                        row.onSelect?.(nav);
                        if (row.to) push(row.to);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <IconChip icon={row.icon} tone={row.tone ?? "muted"} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {row.label}
                        </span>
                        {row.description ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.description}
                          </span>
                        ) : null}
                      </span>
                      {row.badge ? (
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                          {row.badge}
                        </span>
                      ) : null}
                      {row.to ? (
                        <ChevronRight
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {current.render ? (
              <div className={cn("px-2", current.rows?.length && "mt-4")}>
                {current.render(nav)}
              </div>
            ) : null}
          </div>

          {current.footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 bg-secondary/40 px-5 py-3.5 md:px-6">
              {current.footer(nav)}
            </div>
          ) : null}
        </NavContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
