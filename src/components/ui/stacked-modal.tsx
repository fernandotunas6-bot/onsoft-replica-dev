import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
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

/** Each visible section reports independently; a clean sibling cannot clear dirty data. */
function StackPanelContent({
  panel,
  nav,
  report,
}: {
  panel: StackPanel;
  nav: StackNav;
  report: (id: string, dirty: boolean) => void;
}) {
  const reportDirty = useCallback((value: boolean) => report(panel.id, value), [panel.id, report]);
  const localNav = useMemo(() => ({ ...nav, reportDirty }), [nav, reportDirty]);
  useEffect(() => () => report(panel.id, false), [panel.id, report]);
  return (
    <NavContext.Provider value={localNav}>
      {panel.render?.(localNav)}
      {panel.footer ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {panel.footer(localNav)}
        </div>
      ) : null}
    </NavContext.Provider>
  );
}

export function StackedModal({
  open,
  onOpenChange,
  panels,
  rootId,
  eyebrow,
  size = "lg",
  initialPanelId,
  presentation = "modal",
  onDirtyChange,
}: {
  presentation?: "page" | "modal";
  onDirtyChange?: (dirty: boolean) => void;
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

  const resolveTopId = useCallback(
    (targetId?: string) => {
      if (targetId) {
        if (topRows.some((row) => row.to === targetId)) return targetId;
        const parent = topRows.find((row) => {
          const panel = row.to ? byId.get(row.to) : undefined;
          return panel?.rows?.some((sub) => sub.to === targetId);
        });
        if (parent?.to) return parent.to;
      }
      return topRows[0]?.to ?? rootId;
    },
    [byId, topRows, rootId],
  );

  const [activeId, setActiveId] = useState(() => resolveTopId(initialPanelId));
  const [dirty, setDirty] = useState(false);
  const dirtyPanels = useRef(new Map<string, boolean>());
  const reportPanelDirty = useCallback((id: string, value: boolean) => {
    if (value) dirtyPanels.current.set(id, true);
    else dirtyPanels.current.delete(id);
    setDirty(dirtyPanels.current.size > 0);
  }, []);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

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
  }, [open, initialPanelId, resolveTopId]);

  const push = useCallback(
    (id: string) => {
      if (!byId.has(id)) return;
      const next = resolveTopId(id);
      if (next === activeId) return;
      if (confirmDiscardChanges(dirty)) {
        dirtyPanels.current.clear();
        setDirty(false);
        setActiveId(next);
      }
    },
    [byId, resolveTopId, activeId, dirty],
  );
  const close = useCallback(() => {
    if (!confirmDiscardChanges(dirty)) return;
    dirtyPanels.current.clear();
    setDirty(false);
    onDirtyChange?.(false);
    onOpenChange(false);
  }, [dirty, onDirtyChange, onOpenChange]);

  const nav: StackNav = useMemo(
    () => ({
      push,
      back: () => {},
      reset: () => push(resolveTopId()),
      close,
      depth: 1,
      reportDirty: setDirty,
    }),
    [push, resolveTopId, close],
  );

  const active = byId.get(activeId) ?? root;
  if (!active) return null;

  const width = size === "xl" ? "sm:max-w-6xl" : size === "md" ? "sm:max-w-2xl" : "sm:max-w-4xl";

  const renderLeaf = (panel: StackPanel) => (
    <StackPanelContent key={panel.id} panel={panel} nav={nav} report={reportPanelDirty} />
  );

  const content = (
    <>
      {presentation === "page" ? (
        <h1 className="px-5 py-4 text-xl font-semibold">Definições</h1>
      ) : (
        <DialogTitle className="sr-only">
          {eyebrow ? `${eyebrow} — Configurações` : "Configurações"}
        </DialogTitle>
      )}

      <NavContext.Provider value={nav}>
        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Categorias de configurações"
            className="no-scrollbar flex w-16 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border/70 bg-secondary/20 py-4 sm:w-48 sm:items-stretch sm:p-3"
          >
            <p className="hidden px-3 pb-2 text-[11px] font-bold text-muted-foreground sm:block">
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
                  onClick={() => row.to && push(row.to)}
                  className={cn(
                    "flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 sm:justify-start",
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
    </>
  );

  if (!open) return null;
  if (presentation === "page") {
    return <section className="flex min-h-[65dvh] min-w-0 flex-col">{content}</section>;
  }
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
          "flex h-[min(700px,85dvh)] flex-col gap-0 overflow-hidden border-border/70 p-0 shadow-xl sm:rounded-2xl",
          width,
        )}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}
