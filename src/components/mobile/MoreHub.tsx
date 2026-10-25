import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, LayoutGrid, LogOut, Settings, UserRound } from "lucide-react";

import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useSignOut } from "@/features/auth/use-sign-out";
import { useTenant } from "@/features/saas/tenant-context";
import { canAccessPath } from "@/features/auth/access-policy";
import { cn } from "@/lib/utils";
import { BottomSheet, BottomSheetBody, BottomSheetHeader } from "./BottomSheet";
import { MobileSearch } from "./MobileSearch";
import { getPortalNavigation } from "@/features/auth/portal-engine";
import { withHigherEdVocabulary } from "@/features/auth/nav-vocabulary";
import { isHigherEdOnly } from "@/features/academic/period-model";
import {
  flattenNavigationGroup,
  getNavigationAreas,
  getNavigationContext,
  isContextDestinationActive,
} from "@/features/auth/contextual-navigation";

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("pt").normalize("NFD").replace(/\p{M}/gu, "");
}

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
  const { school } = useSchoolSettings();
  const { activePlan } = useTenant();
  const { signOut, signingOut } = useSignOut();
  const [query, setQuery] = React.useState("");

  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>,
  });
  const [allAreas, setAllAreas] = React.useState(false);
  const [area, setArea] = React.useState<string | null>(null);
  const higherEdOnly = isHigherEdOnly(school?.pedagogy?.teachingLevels ?? []);
  const groups = React.useMemo(() => {
    const navigation = getPortalNavigation(currentUser.role, currentUser.grants, activePlan, {
      isAlumni: currentUser.isAlumni,
    });
    return higherEdOnly ? withHigherEdVocabulary(navigation) : navigation;
  }, [currentUser.role, currentUser.grants, activePlan, higherEdOnly, currentUser.isAlumni]);
  const context = getNavigationContext(groups, pathname, search);
  const areas = getNavigationAreas(groups);
  const selectedContext = areas.find((group) => group.title === area);
  const current = selectedContext ?? (!allAreas ? context : null);
  const needle = normalizeSearch(query);
  const filtered = needle
    ? areas
        .map(flattenNavigationGroup)
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              normalizeSearch(group.title).includes(needle) ||
              normalizeSearch(item.label).includes(needle),
          ),
        }))
        .filter((group) => group.items.length > 0)
    : current
      ? [current]
      : [];
  const navigationKey = JSON.stringify([pathname, search, currentUser.schoolId, currentUser.role]);
  React.useEffect(() => {
    setArea(null);
    setAllAreas(false);
    setQuery("");
  }, [navigationKey]);
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setArea(null);
      setAllAreas(false);
    }
  }, [open]);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} size="full">
      <BottomSheetHeader
        title="Mais"
        description={currentUser.schoolName ?? undefined}
        onClose={() => onOpenChange(false)}
      />
      <div className="shrink-0 px-5 pb-4">
        <MobileSearch
          key={navigationKey}
          value={query}
          onChange={setQuery}
          placeholder="Procurar página ou área…"
          delay={80}
        />
      </div>
      <BottomSheetBody className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {!needle ? (
          <div className="mb-3">
            {current ? (
              <button
                type="button"
                onClick={() => {
                  setArea(null);
                  setAllAreas(true);
                }}
                className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <LayoutGrid className="size-[18px]" aria-hidden /> Todas as áreas
              </button>
            ) : context ? (
              <button
                type="button"
                onClick={() => {
                  setArea(null);
                  setAllAreas(false);
                }}
                className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <ArrowLeft className="size-[18px]" aria-hidden /> Voltar ao módulo
              </button>
            ) : null}
          </div>
        ) : null}
        {!needle && !current ? (
          <ul className="space-y-1" aria-label="Áreas de trabalho">
            {areas.map((group) =>
              group.title === "Principal" ? (
                group.items.map((item) => (
                  <li key={`${item.to}-${item.label}`}>
                    <Link
                      to={item.to}
                      search={item.search as never}
                      onClick={() => onOpenChange(false)}
                      aria-current={
                        isContextDestinationActive(item, groups, pathname, search)
                          ? "page"
                          : undefined
                      }
                      className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
                    >
                      {item.label}
                      <ChevronRight className="size-[18px] shrink-0" aria-hidden />
                    </Link>
                  </li>
                ))
              ) : (
                <li key={group.title}>
                  <button
                    type="button"
                    onClick={() => setArea(group.title)}
                    aria-current={
                      group.items.some((item) =>
                        isContextDestinationActive(item, groups, pathname, search),
                      )
                        ? "true"
                        : undefined
                    }
                    className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-[current=true]:bg-primary/10 aria-[current=true]:text-primary"
                  >
                    {group.title}
                    <ChevronRight className="size-[18px] shrink-0" aria-hidden />
                  </button>
                </li>
              ),
            )}
          </ul>
        ) : filtered.length ? (
          <div className="space-y-5">
            {filtered.map((group) => (
              <section key={group.title}>
                <h3 className="px-1 pb-2 text-[12px] font-medium leading-[20px] text-muted-foreground">
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
                          to={item.to!}
                          aria-current={
                            isContextDestinationActive(
                              { to: item.to!, search: item.search },
                              groups,
                              pathname,
                              search,
                            )
                              ? "page"
                              : undefined
                          }
                          search={item.search as never}
                          onClick={() => onOpenChange(false)}
                          className="flex min-h-[56px] min-w-0 items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-secondary aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
                        >
                          <span className="inline-flex size-[36px] shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                            <Icon className="size-[18px]" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1 break-words text-[14px] leading-[20px]">
                            {item.label}
                          </span>
                          <ChevronRight
                            className="size-[18px] shrink-0 text-muted-foreground"
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
          <p className="break-words rounded-xl border border-border bg-card px-4 py-6 text-center text-[13px] leading-[20px] text-muted-foreground">
            Nenhum resultado para «{query}». Tente outro termo.
          </p>
        )}

        <section className="mt-5">
          <h3 className="px-1 pb-2 text-[12px] font-medium leading-[20px] text-muted-foreground">
            Conta
          </h3>
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            <li className="border-b border-border">
              <Link
                to="/perfil"
                onClick={() => onOpenChange(false)}
                className="flex min-h-[56px] min-w-0 items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-secondary"
              >
                <span className="inline-flex size-[36px] shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <UserRound className="size-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 break-words text-[14px] leading-[20px]">
                  Meu perfil
                </span>
                <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
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
                  className="flex min-h-[56px] w-full min-w-0 items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-secondary"
                >
                  <span className="inline-flex size-[36px] shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <Settings className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 break-words text-[14px] leading-[20px]">
                    Definições
                  </span>
                  <ChevronRight
                    className="size-[18px] shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </button>
              </li>
            ) : null}
            <li>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void signOut()}
                className={cn(
                  "flex min-h-[56px] w-full min-w-0 items-center gap-3 px-3 py-3 text-left text-destructive-strong transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-secondary",
                  signingOut && "opacity-60",
                )}
              >
                <span className="inline-flex size-[36px] shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                  <LogOut className="size-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 break-words text-[14px] leading-[20px]">
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
