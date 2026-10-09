import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useTenant } from "@/features/saas/tenant-context";
import {
  activeDestinationTo,
  getMobileDestinations,
  MORE_DESTINATION_TO,
} from "./mobile-nav-model";

/**
 * Barra de navegação inferior (§8). Cinco destinos, o polegar alcança todos.
 *
 * O estado activo é uma pastilha suave, não um bloco de cor: numa barra que
 * está sempre no ecrã, um fundo saturado cansa e rouba atenção ao conteúdo.
 *
 * O `padding-bottom` soma a área segura — sem isso, no iPhone a fila de ícones
 * fica por baixo da barra de gestos e os toques vão para o sistema.
 */
export function BottomNavigation({ onOpenMore }: { onOpenMore: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentUser = useCurrentAccount();
  const { activePlan } = useTenant();

  const destinations = React.useMemo(
    () => getMobileDestinations(currentUser.role, currentUser.grants, activePlan),
    [currentUser.role, currentUser.grants, activePlan],
  );

  const activeTo = activeDestinationTo(pathname, destinations);

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        "fixed inset-x-0 bottom-0 z-[35] border-t border-border bg-card/95 backdrop-blur-sm lg:hidden",
        "[padding-bottom:calc(0.5rem+env(safe-area-inset-bottom))] pt-1.5",
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {destinations.map((destination) => {
          const Icon = destination.icon;
          const active = destination.to === activeTo;
          const inner = (
            <>
              <span
                className={cn(
                  "inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                  active ? "bg-primary-soft text-primary-strong" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span
                className={cn(
                  "text-[10px] leading-none",
                  active ? "font-medium text-primary-strong" : "text-muted-foreground",
                )}
              >
                {destination.label}
              </span>
            </>
          );
          const className =
            "flex min-h-[44px] w-full flex-col items-center justify-center gap-1 py-1 outline-none " +
            // O anel de foco fica por dentro (`focus-visible:ring-inset`): num
            // elemento encostado ao bordo inferior do ecrã, um anel exterior é
            // cortado pela margem e o foco deixa de se ver.
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

          return (
            <li key={destination.to + destination.label} className="flex-1">
              {destination.to === MORE_DESTINATION_TO ? (
                <button
                  type="button"
                  onClick={onOpenMore}
                  aria-current={active ? "page" : undefined}
                  className={className}
                >
                  {inner}
                </button>
              ) : (
                <Link
                  to={destination.to}
                  search={destination.search as never}
                  aria-current={active ? "page" : undefined}
                  className={className}
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
