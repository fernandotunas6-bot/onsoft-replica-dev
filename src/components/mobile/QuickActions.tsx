import * as React from "react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/**
 * Acções rápidas (§16). Só o que se faz várias vezes por dia — 4 a 6. O resto
 * vive nos módulos e no hub "Mais"; uma grelha de 12 atalhos não é um atalho.
 *
 * `hidden` existe para o RBAC (§53): a acção que o utilizador não pode executar
 * não aparece, em vez de aparecer e responder "sem permissão" ao toque.
 */
export type QuickAction = {
  label: string;
  icon: React.ElementType;
  to?: string;
  search?: Record<string, unknown>;
  onSelect?: () => void;
  hidden?: boolean;
};

export function QuickActions({
  actions,
  className,
}: {
  actions: QuickAction[];
  className?: string;
}) {
  const visible = actions.filter((action) => !action.hidden).slice(0, 6);
  if (!visible.length) return null;

  return (
    <div className={cn("grid grid-cols-2 gap-2.5", className)}>
      {visible.map((action) => {
        const Icon = action.icon;
        const inner = (
          <>
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-strong">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{action.label}</span>
          </>
        );
        const base =
          "touch-feedback flex min-h-[var(--siga-control-lg)] items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left text-foreground";

        if (action.to) {
          return (
            <Link
              key={action.label}
              to={action.to}
              search={action.search as never}
              className={base}
            >
              {inner}
            </Link>
          );
        }
        return (
          <button key={action.label} type="button" onClick={action.onSelect} className={base}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
