import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CalendarDays, CircleCheck, FileText, Receipt, Users } from "lucide-react";
import type { HomeFocusItem } from "@/features/dashboard/home-focus";

const focusIcons = {
  applications: Users,
  documents: FileText,
  invoices: Receipt,
  events: CalendarDays,
} as const;

/**
 * Zona operacional do Início: é conteúdo da página, não uma segunda sidebar.
 * Apenas tarefas existentes nas contagens autorizadas do overview da escola.
 */
export function AdminHomeFocus({
  items,
  loading,
  unavailable,
  compact = false,
}: {
  items: HomeFocusItem[];
  loading: boolean;
  unavailable: boolean;
  compact?: boolean;
}) {
  return (
    <section
      aria-labelledby={compact ? "home-focus-heading-mobile" : "home-focus-heading"}
      className={compact ? "space-y-2 md:hidden" : "hidden space-y-3 md:block"}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            Acompanhar
          </p>
          <h2
            id={compact ? "home-focus-heading-mobile" : "home-focus-heading"}
            className="mt-0.5 text-base font-semibold text-foreground"
          >
            O que merece atenção
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Actividades da sua escola, conforme o seu acesso
        </p>
      </div>

      {loading ? (
        <div
          role="status"
          className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground"
        >
          A consultar actividades…
        </div>
      ) : unavailable ? (
        <div
          role="alert"
          className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground"
        >
          Não foi possível consultar os indicadores. Volte a abrir o Início para tentar novamente.
        </div>
      ) : items.length ? (
        <div className={compact ? "grid gap-2 sm:grid-cols-2" : "grid gap-3 md:grid-cols-2 xl:grid-cols-4"}>
          {items.map((item) => {
            const Icon = focusIcons[item.id];
            return (
              <Link
                key={item.id}
                to={item.to}
                className={`group flex min-w-0 items-start gap-3 rounded-xl border border-border bg-card transition-[background-color,border-color] duration-150 hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${compact ? "p-3" : "p-4"}`}
              >
                <span className={`flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ${compact ? "size-8" : "size-9"}`}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-bold leading-none tabular-nums text-foreground ${compact ? "text-lg" : "text-2xl"}`}>
                    {item.count}
                  </span>
                  <span className={`block text-xs font-semibold text-foreground ${compact ? "mt-1" : "mt-2"}`}>
                    {item.title}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
                <ArrowUpRight
                  className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <CircleCheck className="size-5 shrink-0 text-success" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            Não há pendências nos indicadores disponíveis para esta conta.
          </p>
        </div>
      )}
    </section>
  );
}
