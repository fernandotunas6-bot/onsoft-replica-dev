import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { ElementType } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ChipTone } from "@/components/ui/icon-chip";
import { confirmDiscardChanges } from "@/components/ui/modal-system/confirm-close";
import { cn } from "@/lib/utils";

/**
 * Modal de configurações em duas colunas (estilo ChatGPT/macOS): a navegação
 * de topo fica sempre visível à esquerda, o conteúdo actualiza-se à direita
 * sem empilhar ecrãs. Painéis com sub-linhas mostram cada sub-secção em bloco,
 * uma a seguir à outra, na coluna direita. Modular: declarado como dados.
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
  /** Id do painel filho a abrir. */
  to?: string;
};

export type StackNav = {
  push: (id: string) => void;
  back: () => void;
  reset: () => void;
  close: () => void;
  depth: number;
  /** Painéis com formulários chamam isto para proteger o fecho do modal contra perda de dados. */
  reportDirty: (dirty: boolean) => void;
};

const NavContext = createContext<StackNav | null>(null);

export function useStackNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useStackNav deve ser usado dentro de <StackedModal>");
  return ctx;
}

/** Variante seguro para componentes partilhados que também renderizam fora do StackedModal. */
export function useOptionalStackNav() {
  return useContext(NavContext);
}

export function StackedModal({
  open,
  onOpenChange,
  panels,
  rootId,
  eyebrow,
  size = "lg",
  initialPanelId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panels: StackPanel[];
  rootId: string;
  eyebrow?: string;
  size?: "md" | "lg" | "xl";
  /** Categoria a mostrar já seleccionada quando o modal abre (id de um painel de topo ou de uma sub-secção). */
  initialPanelId?: string | undefined;
}) {
  const byId = useMemo(() => new Map(panels.map((p) => [p.id, p])), [panels]);
  const root = byId.get(rootId);
  const topRows = useMemo(() => root?.rows ?? [], [root]);

  const resolveTopId = (targetId?: string) => {
    if (targetId) {
      if (topRows.some((row) => row.to === targetId)) return targetId;
      const parent = topRows.find((row) => {
        const panel = row.to ? byId.get(row.to) : undefined;
        return panel?.rows?.some((sub) => sub.to === targetId);
      });
      if (parent?.to) return parent.to;
    }
    return topRows[0]?.to ?? rootId;
  };

  const [activeId, setActiveId] = useState(() => resolveTopId(initialPanelId));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDirty(false);
  }, [activeId]);

  useEffect(() => {
    if (!open) return undefined;
    const topId = resolveTopId(initialPanelId);
    setActiveId(topId);
    if (!initialPanelId || initialPanelId === topId) return undefined;
    const id = initialPanelId;
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só recalcular quando o modal (re)abre
  }, [open, initialPanelId]);

  const push = (id: string) => byId.has(id) && setActiveId(resolveTopId(id));
  const close = () => {
    if (confirmDiscardChanges(dirty)) onOpenChange(false);
  };

  const nav: StackNav = useMemo(
    () => ({
      push,
      back: () => {},
      reset: () => setActiveId(resolveTopId()),
      close,
      depth: 1,
      reportDirty: setDirty,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- push/close recriam-se por render, mas são estáveis o suficiente aqui
    [byId, topRows],
  );

  const active = byId.get(activeId) ?? root;
  if (!active) return null;

  const width = size === "xl" ? "sm:max-w-6xl" : size === "md" ? "sm:max-w-2xl" : "sm:max-w-4xl";

  const renderLeaf = (panel: StackPanel) => (
    <>
      {panel.render ? panel.render(nav) : null}
      {panel.footer ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {panel.footer(nav)}
        </div>
      ) : null}
    </>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !confirmDiscardChanges(dirty)) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className={cn(
          "flex h-[min(700px,85vh)] flex-col gap-0 overflow-hidden border-border/70 p-0 shadow-2xl sm:rounded-2xl",
          width,
        )}
      >
        <DialogTitle className="sr-only">
          {eyebrow ? `${eyebrow} — Configurações` : "Configurações"}
        </DialogTitle>

        <NavContext.Provider value={nav}>
          <div className="flex min-h-0 flex-1">
            <nav
              aria-label="Categorias de configurações"
              className="no-scrollbar flex w-16 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border/70 bg-secondary/20 py-4 sm:w-64 sm:items-stretch sm:p-3"
            >
              <p className="hidden px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:block">
                {eyebrow ?? "Configurações"}
              </p>
              {topRows.map((row) => {
                const isActive = row.to === activeId;
                return (
                  <button
                    key={row.label}
                    type="button"
                    title={row.label}
                    aria-current={isActive}
                    onClick={() => row.to && setActiveId(row.to)}
                    className={cn(
                      "flex w-full items-center justify-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 sm:justify-start",
                      isActive
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                    )}
                  >
                    <row.icon className="size-4 shrink-0" aria-hidden />
                    <span className="hidden truncate sm:inline">{row.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div className="sticky top-0 z-10 shrink-0 border-b border-border/70 bg-background/75 px-5 py-4 backdrop-blur-xl md:px-9">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <active.icon className="size-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-extrabold tracking-tight md:text-xl">
                      {active.title}
                    </h3>
                    {active.description ? (
                      <p className="truncate text-xs text-muted-foreground md:text-sm">
                        {active.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="no-scrollbar flex-1 overflow-y-auto px-5 py-6 md:px-9 md:py-8">
                <div className="space-y-8">
                  {active.rows?.length
                    ? active.rows.map((row) => {
                        const leaf = row.to ? byId.get(row.to) : undefined;
                        if (!leaf) return null;
                        return (
                          <section key={row.label} id={row.to} className="scroll-mt-4">
                            <div className="flex items-center gap-2.5">
                              <row.icon
                                className="size-4 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                              <h4 className="text-sm font-semibold text-foreground">{row.label}</h4>
                            </div>
                            {row.description ? (
                              <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
                                {row.description}
                              </p>
                            ) : null}
                            <div className="mt-3 border-t border-border/70 pl-6 pt-4">
                              {renderLeaf(leaf)}
                            </div>
                          </section>
                        );
                      })
                    : renderLeaf(active)}
                </div>
              </div>
            </div>
          </div>
        </NavContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
