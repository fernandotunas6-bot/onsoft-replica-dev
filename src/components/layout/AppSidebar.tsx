import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Building2,
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
import { getPortalNavigation, isNavChildActive } from "@/features/auth/portal-engine";
import { getCreateSchoolUrl, getPricingUrl, getSigaNavDocUrl } from "@/lib/ecosystem-urls";
import { useTenant } from "@/features/saas/tenant-context";
import { UserProfileModal } from "@/components/auth/UserProfileModal";
import { AcademicNavTree } from "./AcademicNavTree";
import { NAV_SUB_LIST, NavButtonRow, NavLinkRow, NavSubheader } from "./NavItem";

const MENU_KEY = "siga:sidebar-open-menus";

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

  const visibleGroups = useMemo(
    () => getPortalNavigation(currentUser.role, currentUser.grants, activePlan),
    [currentUser.role, currentUser.grants, activePlan],
  );
  // Memoizado para o efeito abaixo poder depender dele directamente. Antes
  // dependia só de `pathname`, o que deixava de fora a mudança de
  // `visibleGroups` (papel/grants/plano): os menus recém-visíveis não abriam.
  const parentsOfActive = useMemo(
    () =>
      visibleGroups
        .flatMap((g) => g.items)
        .filter((i) => i.children?.some((c) => c.to === pathname))
        .map((i) => i.label),
    [visibleGroups, pathname],
  );
  const [openMenus, setOpenMenus] = useState<string[]>(parentsOfActive);

  useEffect(() => {
    const stored = localStorage.getItem(MENU_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[];
        setOpenMenus((prev) => Array.from(new Set([...parsed, ...prev])));
      } catch {
        /* ignore malformed value */
      }
    }
  }, []);

  useEffect(() => {
    setOpenMenus((prev) => Array.from(new Set([...prev, ...parentsOfActive])));
  }, [parentsOfActive]);

  const toggle = (label: string) =>
    setOpenMenus((prev) => {
      const next = prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label];
      localStorage.setItem(MENU_KEY, JSON.stringify(next));
      return next;
    });

  return (
    <>
      <aside
        data-sidebar="siga"
        className={cn(
          "flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
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
                    <span className="inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm ring-2 ring-primary/20">
                      <img
                        src={schoolLogoUrl}
                        alt={school?.name ?? "Logótipo da escola"}
                        className="size-full object-contain p-1 mix-blend-multiply"
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
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
                          <span className="block truncate text-[10px] font-medium text-sidebar-muted">
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
                    <DropdownMenuLabel className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider py-1">
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
                          <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
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
                    <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {currentUser.schools.length}
                    </span>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenSettings?.("escola")}>
                  <Settings className="size-4 text-muted-foreground" /> Configurações da Escola
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={getCreateSchoolUrl()} target="_blank" rel="noreferrer">
                    <PlusCircle className="size-4 text-emerald-600 dark:text-emerald-400" /> Criar
                    escola (WEB)
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
          {canAccessPath("/pedagogica", currentUser.role, currentUser.grants, activePlan) ? (
            <AcademicNavTree collapsed={collapsed} />
          ) : null}
          {visibleGroups.map((group) => (
            <div key={group.title}>
              <NavSubheader title={group.title} collapsed={collapsed} />
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isOpen = openMenus.includes(item.label);
                  const childActive = item.children?.some((c) => c.to === pathname) ?? false;

                  // Flyout: com a barra recolhida, o rato revela um painel lateral
                  // com o rótulo e os sub-itens do menu.
                  const flyout = collapsed ? (
                    <div className="pointer-events-none absolute left-full top-0 z-50 hidden pl-2 group-hover/fly:block group-focus-within/fly:block">
                      <div className="pointer-events-auto min-w-52 rounded-xl border border-sidebar-border bg-sidebar p-2 shadow-float">
                        <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-[0.5px] text-sidebar-muted">
                          {item.label}
                        </p>
                        {item.children ? (
                          <ul className="space-y-0.5">
                            {item.children.map((child) => (
                              <li key={child.label}>
                                {child.to ? (
                                  <NavLinkRow
                                    to={child.to}
                                    {...(child.search ? { search: child.search } : {})}
                                    label={child.label}
                                    depth="sub"
                                    active={isNavChildActive(child, pathname, locationSearch)}
                                  />
                                ) : (
                                  <NavButtonRow label={child.label} depth="sub" />
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  ) : null;

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
                                    active={isNavChildActive(child, pathname, locationSearch)}
                                  />
                                ) : (
                                  <NavButtonRow label={child.label} depth="sub" />
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {flyout}
                      </li>
                    );
                  }

                  return (
                    <li key={item.label} className="group/fly relative">
                      <NavLinkRow
                        to={item.to as string}
                        label={item.label}
                        icon={item.icon}
                        collapsed={collapsed}
                        active={item.to === pathname}
                      />
                      {flyout}
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
                  <DropdownMenuLabel className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
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

      <UserProfileModal
        open={profileModalOpen}
        onOpenChange={setProfileModalOpen}
        defaultTab={profileModalTab}
      />
    </>
  );
}
