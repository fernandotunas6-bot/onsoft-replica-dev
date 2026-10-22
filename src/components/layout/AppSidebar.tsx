import { useEffect, useMemo, useState, lazy, Suspense } from "react";

import { canPrefetchResources, onIdle } from "@/lib/preload";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  LayoutGrid,
  ChevronDown,
  CircleHelp,
  CreditCard,
  Lock,
  LogOut,
  PlusCircle,
  Settings,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import { MediaAvatar } from "@/components/ui/media-frame";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useSignOut } from "@/features/auth/use-sign-out";
import { canAccessPath } from "@/features/auth/access-policy";
import { withHigherEdVocabulary } from "@/features/auth/nav-vocabulary";
import { isHigherEdOnly } from "@/features/academic/period-model";
import { getPortalNavigation, isNavChildActive } from "@/features/auth/portal-engine";
import { getCreateSchoolUrl, getPricingUrl, getSigaNavDocUrl } from "@/lib/ecosystem-urls";
import { useTenant } from "@/features/saas/tenant-context";
import { AcademicNavTree } from "./AcademicNavTree";
import {
  NAV_SUB_LIST,
  NAV_ROW_BASE,
  NAV_ROW_ACTIVE,
  NAV_ROW_IDLE,
  NavIcon,
  NavButtonRow,
  NavLinkRow,
  NavSubheader,
} from "./NavItem";
import type { NavItem, NavGroup } from "@/features/auth/portal-engine";

import {
  getNavigationContext,
  isContextDestinationActive,
} from "@/features/auth/contextual-navigation";

/**
 * Fora do grafo estático da barra: o `AppShell` entra no manifesto da rota `/`, que
 * é também o ecrã de entrada, e este modal arrastava o `PickFileButton` (28 565
 * bytes em gzip) para todas as páginas. A barra só existe com sessão iniciada, por
 * isso aquece-se em tempo livre — o login nunca o pede, quem entrou abre-o na mesma
 * sem espera.
 */
const UserProfileModal = lazy(() =>
  import("@/components/auth/UserProfileModal").then((module) => ({
    default: module.UserProfileModal,
  })),
);

export function AppSidebar({
  className,
  collapsed = false,
  onOpenSettings,
}: {
  className?: string;
  collapsed?: boolean;
  onOpenSettings?: (panelId?: string) => void;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // Os sub-itens de "Área Pedagógica" partilham todos o caminho `/pedagogica`
  // e distinguem-se pelo `?tab=`, por isso o estado activo precisa da pesquisa.
  const locationSearch = useRouterState({
    select: (r) => r.location.search as Record<string, unknown>,
  });
  const currentUser = useCurrentAccount();
  const { activePlan } = useTenant();
  const { school, activeYearLabel } = useSchoolSettings();
  const { signOut, signingOut } = useSignOut();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  // Monta à primeira abertura e fica: desmontar cortava a animação de fecho.
  const [profileModalMounted, setProfileModalMounted] = useState(false);
  useEffect(() => {
    if (profileModalOpen) setProfileModalMounted(true);
  }, [profileModalOpen]);
  useEffect(() => {
    if (!canPrefetchResources()) return;
    onIdle(() => {
      void import("@/components/auth/UserProfileModal");
    });
  }, []);
  const [profileModalTab, setProfileModalTab] = useState<
    "perfil" | "foto" | "seguranca" | "instituicoes"
  >("perfil");

  const hasSchool = Boolean(school?.name);
  const schoolLogoUrl = school?.branding?.logo_url?.trim() || null;
  const schoolMotto = school?.branding?.motto?.trim() || null;
  const schoolInitials = (school?.name ?? "Escola")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  // Instituição só de Ensino Superior: «Estudantes» em vez de «Alunos».
  const higherEdOnly = isHigherEdOnly(school?.pedagogy?.teachingLevels ?? []);
  const visibleGroups = useMemo(() => {
    const groups = getPortalNavigation(currentUser.role, currentUser.grants, activePlan);
    return higherEdOnly ? withHigherEdVocabulary(groups) : groups;
  }, [currentUser.role, currentUser.grants, activePlan, higherEdOnly]);
  const context = getNavigationContext(visibleGroups, pathname, locationSearch);
  const [areaPicker, setAreaPicker] = useState(false);
  const [openMenus, setOpenMenus] = useState<string[]>([]);
  const navigationKey = JSON.stringify([
    pathname,
    locationSearch,
    currentUser.schoolId,
    currentUser.role,
  ]);
  useEffect(() => {
    setAreaPicker(false);
    setOpenMenus((prev) => (prev.length ? [] : prev));
  }, [navigationKey]);
  const contextual = Boolean(context && !areaPicker);
  const displayedGroups = contextual && context ? [context] : visibleGroups;
  const toggle = (label: string) => setOpenMenus((prev) => (prev.includes(label) ? [] : [label]));

  return (
    <>
      <aside
        data-sidebar="siga"
        className={cn(
          "flex h-full shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          "lg:rounded-xl lg:border lg:border-sidebar-border",
          collapsed ? "w-[64px]" : "w-[240px]",
          className,
        )}
      >
        <div
          className={cn(
            "flex items-center border-b border-sidebar-border/40",
            collapsed ? "h-14 justify-center px-2" : "px-3 py-2",
          )}
        >
          {hasSchool ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-sidebar-header-account=""
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-primary/60",
                    collapsed ? "justify-center px-1" : "px-2",
                  )}
                  title={school?.name ? `${school.name} • ${currentUser.name}` : currentUser.name}
                >
                  {schoolLogoUrl ? (
                    <MediaAvatar
                      src={schoolLogoUrl}
                      alt={school?.name ?? "Logótipo da escola"}
                      className="size-9 shrink-0 ring-2 ring-primary/20 bg-background object-contain p-0.5"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary ring-2 ring-primary/20"
                    >
                      {schoolInitials || "E"}
                    </span>
                  )}
                  {!collapsed ? (
                    <>
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-sm font-bold text-sidebar-foreground">
                          {school?.name}
                        </span>
                        {schoolMotto ? (
                          <span className="block truncate text-[11px] font-medium text-sidebar-muted">
                            {schoolMotto}
                          </span>
                        ) : null}
                      </span>
                      <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-50" />
                    </>
                  ) : null}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="bottom" className="w-64 z-50">
                <DropdownMenuLabel className="font-normal">
                  <span className="block truncate text-xs font-bold text-foreground">
                    {school?.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {currentUser.name} ({currentUser.role})
                  </span>
                </DropdownMenuLabel>

                {currentUser.schools.length > 1 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground py-1">
                      Alternar Instituição
                    </DropdownMenuLabel>
                    {currentUser.schools.map((item) => {
                      const isCurrent = item.schoolId === currentUser.schoolId;
                      return (
                        <DropdownMenuItem
                          key={item.membershipId}
                          onClick={() => {
                            if (!isCurrent) {
                              currentUser.setActiveSchoolId(item.schoolId);
                            }
                          }}
                          className={cn(
                            "flex items-center justify-between text-xs cursor-pointer",
                            isCurrent && "font-bold text-primary bg-primary/10",
                          )}
                        >
                          <span className="truncate">{item.schoolName}</span>
                          <span className="text-[11px] text-muted-foreground ml-2 shrink-0">
                            {item.roleName || item.appRole}
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                ) : null}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setProfileModalTab("perfil");
                    setProfileModalOpen(true);
                  }}
                >
                  <User className="size-4 text-primary" /> Minha Conta / Perfil
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setProfileModalTab("instituicoes");
                    setProfileModalOpen(true);
                  }}
                >
                  <Building2 className="size-4 text-primary" /> Instituições
                  {currentUser.schools.length > 1 ? (
                    <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                      {currentUser.schools.length}
                    </span>
                  ) : null}
                </DropdownMenuItem>
                {canAccessPath(
                  "/configuracoes",
                  currentUser.role,
                  currentUser.grants,
                  activePlan,
                ) ? (
                  <DropdownMenuItem onClick={() => onOpenSettings?.("escola")}>
                    <Settings className="size-4 text-muted-foreground" /> Configurações da Escola
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem asChild>
                  <a href={getCreateSchoolUrl()} target="_blank" rel="noreferrer">
                    <PlusCircle className="size-4 text-primary" /> Criar escola (WEB)
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <a
              href={getCreateSchoolUrl()}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "flex items-center gap-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs transition-colors border border-primary/25 shadow-xs",
                collapsed ? "size-9 justify-center p-0" : "w-full justify-between px-3 py-2",
              )}
              title="Criar escola no portal WEB"
            >
              <div className="flex items-center gap-2 truncate">
                <PlusCircle className="size-4 shrink-0 text-primary" />
                {!collapsed ? <span className="truncate">Criar escola (WEB)</span> : null}
              </div>
              {!collapsed ? <Building2 className="size-3.5 shrink-0 opacity-70" /> : null}
            </a>
          )}
        </div>

        <nav
          aria-label="Navegação principal"
          className={cn(
            "flex-1 pb-4",
            collapsed ? "overflow-visible px-2" : "no-scrollbar overflow-y-auto px-4",
          )}
        >
          <div className="pt-3 pb-1">
            <NavButtonRow
              label={
                contextual ? "Todas as áreas" : context ? "Voltar ao módulo" : "Áreas de trabalho"
              }
              icon={contextual ? LayoutGrid : ArrowLeft}
              collapsed={collapsed}
              onClick={() => setAreaPicker((open) => !open)}
              expanded={!contextual}
              className={!context ? "hidden" : undefined}
            />
          </div>
          {contextual &&
          pathname.startsWith("/pedagogica") &&
          canAccessPath("/pedagogica", currentUser.role, currentUser.grants, activePlan) ? (
            <AcademicNavTree collapsed={collapsed} />
          ) : null}
          {displayedGroups.map((group) => (
            <div key={group.title}>
              <NavSubheader title={group.title} collapsed={collapsed} />
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isOpen = openMenus.includes(item.label);
                  const childActive =
                    item.children?.some((c) => isNavChildActive(c, pathname, locationSearch)) ??
                    false;

                  if (collapsed && item.children) {
                    return (
                      <li key={item.label}>
                        <CollapsedNavMenu
                          item={item}
                          groups={displayedGroups}
                          pathname={pathname}
                          search={locationSearch}
                          active={childActive}
                        />
                      </li>
                    );
                  }

                  if (item.children) {
                    return (
                      <li key={item.label} className="group/fly relative">
                        <NavButtonRow
                          label={item.label}
                          icon={item.icon}
                          collapsed={collapsed}
                          active={childActive}
                          expanded={isOpen}
                          onClick={() => toggle(item.label)}
                          trailing={
                            <ChevronDown
                              aria-hidden
                              className={cn(
                                "size-4 shrink-0 opacity-50 transition-transform duration-200",
                                isOpen && "rotate-180",
                              )}
                            />
                          }
                        />

                        {isOpen && !collapsed ? (
                          <ul className={NAV_SUB_LIST}>
                            {item.children.map((child) => (
                              <li key={child.label}>
                                {child.to ? (
                                  <NavLinkRow
                                    to={child.to}
                                    {...(child.search ? { search: child.search } : {})}
                                    label={child.label}
                                    depth="sub"
                                    active={isContextDestinationActive(
                                      child,
                                      displayedGroups,
                                      pathname,
                                      locationSearch,
                                    )}
                                  />
                                ) : (
                                  <NavButtonRow label={child.label} depth="sub" />
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  }

                  return (
                    <li key={item.label} className="group/fly relative">
                      <NavLinkRow
                        to={item.to as string}
                        {...(item.search ? { search: item.search } : {})}
                        label={item.label}
                        icon={item.icon}
                        collapsed={collapsed}
                        active={isContextDestinationActive(
                          {
                            to: item.to as string,
                            ...(item.search ? { search: item.search } : {}),
                          },
                          displayedGroups,
                          pathname,
                          locationSearch,
                        )}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div
          className={cn(
            "mt-auto border-t border-sidebar-border",
            collapsed ? "px-2 py-3" : "px-3 py-3",
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-account-trigger=""
                aria-label="Abrir menu da conta"
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-primary/60",
                  collapsed ? "justify-center px-1 py-2" : "px-2 py-2",
                )}
              >
                <UserAvatar
                  url={currentUser.avatarUrl}
                  initials={currentUser.initials}
                  className="size-9 bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground"
                />
                {!collapsed ? (
                  <>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-semibold text-sidebar-foreground">
                        {currentUser.name}
                      </span>
                      <span className="block truncate text-[11px] text-sidebar-muted">
                        {currentUser.role}
                      </span>
                    </span>
                    <ChevronDown aria-hidden className="size-4 shrink-0 opacity-50" />
                  </>
                ) : null}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-64">
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {currentUser.name}
                </span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {currentUser.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/perfil">
                  <User className="size-4" /> Perfil
                </Link>
              </DropdownMenuItem>
              {canAccessPath("/configuracoes", currentUser.role, currentUser.grants) ? (
                <DropdownMenuItem onClick={() => onOpenSettings?.()}>
                  <Settings className="size-4" /> Configurações
                </DropdownMenuItem>
              ) : null}
              {canAccessPath("/alterar-senha", currentUser.role) ? (
                <DropdownMenuItem asChild>
                  <Link to="/alterar-senha">
                    <Lock className="size-4" /> Alterar senha
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <a href={getSigaNavDocUrl()} target="_blank" rel="noreferrer">
                  <CircleHelp className="size-4" /> Documentação
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={getPricingUrl()} target="_blank" rel="noreferrer">
                  <CreditCard className="size-4" /> Planos
                </a>
              </DropdownMenuItem>
              {currentUser.roles && currentUser.roles.length > 1 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px] font-extrabold text-muted-foreground">
                    Mudar Área (Perfil)
                  </DropdownMenuLabel>
                  {currentUser.roles.map((r) => (
                    <DropdownMenuItem
                      key={r}
                      onClick={() => currentUser.setActiveRole(r)}
                      className={`text-xs flex items-center justify-between ${
                        r === currentUser.role ? "font-bold text-primary bg-primary/5" : ""
                      }`}
                    >
                      <span>{r}</span>
                      {r === currentUser.role ? (
                        <span className="text-primary font-bold">✓</span>
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void signOut()}
                disabled={signingOut}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <LogOut className="size-4" /> {signingOut ? "A sair…" : "Sair"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!collapsed ? (
            <p className="px-2 pt-2 text-[11px] text-sidebar-muted">{activeYearLabel}</p>
          ) : null}
        </div>
      </aside>

      {profileModalMounted ? (
        <Suspense fallback={null}>
          <UserProfileModal
            open={profileModalOpen}
            onOpenChange={setProfileModalOpen}
            defaultTab={profileModalTab}
          />
        </Suspense>
      ) : null}
    </>
  );
}

/** A portal keeps collapsed menus outside the sidebar's clipping/scroll container. */
function CollapsedNavMenu({
  item,
  groups,
  pathname,
  search,
  active,
}: {
  item: NavItem;
  groups: NavGroup[];
  pathname: string;
  search: Record<string, unknown>;
  active: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={item.label}
          className={cn(
            NAV_ROW_BASE,
            "min-h-9 justify-center px-1 py-2",
            active ? NAV_ROW_ACTIVE : NAV_ROW_IDLE,
          )}
        >
          <NavIcon icon={item.icon} active={active} />
          <span className="sr-only">{item.label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={8}
        className="max-h-[min(70vh,var(--radix-dropdown-menu-content-available-height))] w-64 overflow-y-auto border-sidebar-border bg-sidebar text-sidebar-foreground"
      >
        <DropdownMenuLabel className="text-xs font-medium text-sidebar-muted">
          {item.label}
        </DropdownMenuLabel>
        {item.children?.map((child) => {
          const selected = isContextDestinationActive(child, groups, pathname, search);
          return (
            <DropdownMenuItem
              key={child.label}
              asChild
              className={cn(
                "focus:bg-sidebar-accent focus:text-sidebar-accent-foreground",
                selected && "bg-primary/10 text-sidebar-active",
              )}
            >
              <Link
                to={child.to}
                {...(child.search ? { search: child.search } : {})}
                aria-current={selected ? "page" : undefined}
                preload={canPrefetchResources() ? "intent" : false}
              >
                <span className="min-w-0 break-words">{child.label}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
