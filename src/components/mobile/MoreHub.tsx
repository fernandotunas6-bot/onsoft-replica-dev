import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, LogOut, Settings, UserRound } from "lucide-react";

import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSignOut } from "@/features/auth/use-sign-out";
import { useTenant } from "@/features/saas/tenant-context";
import { canAccessPath } from "@/features/auth/access-policy";
import { cn } from "@/lib/utils";
import { BottomSheet, BottomSheetBody, BottomSheetHeader } from "./BottomSheet";
import { MobileSearch } from "./MobileSearch";
import { getMoreHubGroups } from "./mobile-nav-model";

/**
 * Hub "Mais" (§9). Não é uma lista interminável: é o catálogo do papel agrupado
 * pelas secções que o utilizador já conhece da barra lateral, com um campo de
 * pesquisa por cima — num hub de 30 entradas, procurar é mais rápido do que
 * rolar, e é a resposta do §89 ("configurações viram secções pesquisáveis").
 */
export function MoreHub({
  open,
  onOpenChange,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
}) {
  const currentUser = useCurrentAccount();
  const { activePlan } = useTenant();
  const { signOut, signingOut } = useSignOut();
  const [query, setQuery] = React.useState("");

  const groups = React.useMemo(
    () => getMoreHubGroups(currentUser.role, currentUser.grants, activePlan),
    [currentUser.role, currentUser.grants, activePlan],
  );

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.label.toLowerCase().includes(needle)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  // A pesquisa é por sessão da folha: reabrir o hub mostra tudo outra vez.
  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} size="full">
      <BottomSheetHeader
        title="Mais"
        description={currentUser.schoolName ?? undefined}
        onClose={() => onOpenChange(false)}
      />
      <div className="shrink-0 px-4 pb-3">
        <MobileSearch value={query} onChange={setQuery} placeholder="Procurar módulo…" delay={80} />
      </div>
      <BottomSheetBody className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {filtered.length ? (
          <div className="space-y-5">
            {filtered.map((group) => (
              <section key={group.title}>
                <h3 className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </h3>
                <ul className="overflow-hidden rounded-xl border border-border bg-card">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li
                        key={`${item.to}-${item.label}`}
                        className="border-b border-border last:border-b-0"
                      >
                        <Link
                          to={item.to}
                          search={item.search as never}
                          onClick={() => onOpenChange(false)}
                          className="flex min-h-[var(--siga-control-md)] items-center gap-3 px-3 py-2.5 transition-colors active:bg-secondary"
                        >
                          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                          <ChevronRight
                            className="size-4 shrink-0 text-muted-foreground/40"
                            aria-hidden
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum módulo com «{query}». Tente outro termo.
          </p>
        )}

        <section className="mt-5">
          <h3 className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Conta
          </h3>
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            <li className="border-b border-border">
              <Link
                to="/perfil"
                onClick={() => onOpenChange(false)}
                className="flex min-h-[var(--siga-control-md)] items-center gap-3 px-3 py-2.5 active:bg-secondary"
              >
                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <UserRound className="size-4" aria-hidden />
                </span>
                <span className="flex-1 truncate text-sm">Meu perfil</span>
                <ChevronRight className="size-4 text-muted-foreground/40" aria-hidden />
              </Link>
            </li>
            {onOpenSettings &&
            canAccessPath("/configuracoes", currentUser.role, currentUser.grants) ? (
              <li className="border-b border-border">
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenSettings();
                  }}
                  className="flex min-h-[var(--siga-control-md)] w-full items-center gap-3 px-3 py-2.5 text-left active:bg-secondary"
                >
                  <span className="inline-flex size-7 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <Settings className="size-4" aria-hidden />
                  </span>
                  <span className="flex-1 truncate text-sm">Definições</span>
                  <ChevronRight className="size-4 text-muted-foreground/40" aria-hidden />
                </button>
              </li>
            ) : null}
            <li>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void signOut()}
                className={cn(
                  "flex min-h-[var(--siga-control-md)] w-full items-center gap-3 px-3 py-2.5 text-left text-destructive-strong active:bg-secondary",
                  signingOut && "opacity-60",
                )}
              >
                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-destructive/10">
                  <LogOut className="size-4" aria-hidden />
                </span>
                <span className="flex-1 truncate text-sm">
                  {signingOut ? "A terminar sessão…" : "Terminar sessão"}
                </span>
              </button>
            </li>
          </ul>
        </section>
      </BottomSheetBody>
    </BottomSheet>
  );
}
