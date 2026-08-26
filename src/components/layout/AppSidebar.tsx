import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Download,
  FileText,
  FileUp,
  GraduationCap,
  History,
  LayoutGrid,
  Lock,
  LogOut,
  Megaphone,
  NotebookPen,
  PieChart,
  Receipt,
  Settings,
  TrendingUp,
  User,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SigaLogo } from "@/components/ui/siga-logo";
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
import { getPortalNavigation } from "@/features/auth/portal-engine";
import { AcademicNavTree } from "./AcademicNavTree";
import { NavButtonRow, NavLinkRow, NavSubheader } from "./NavItem";

type Child = {
  label: string;
  icon: React.ElementType;
  to: string;
  search?: Record<string, string | undefined>;
};
type Item = {
  label: string;
  icon: React.ElementType;
  to?: string;
  search?: Record<string, string | undefined>;
  children?: Child[];
};
type Group = { title: string; items: Item[] };

const groups: Group[] = [
  {
    title: "Académico",
    items: [
      { label: "Dashboard", icon: LayoutGrid, to: "/" },
      {
        label: "Área Pedagógica",
        icon: BookOpen,
        children: [
          {
            label: "Turmas e Disciplinas",
            icon: BookOpen,
            to: "/pedagogica",
            search: { tab: "turmas" },
          },
          {
            label: "Notas e Avaliações",
            icon: PieChart,
            to: "/pedagogica",
            search: { tab: "notas" },
          },
          {
            label: "Horários",
            icon: CalendarDays,
            to: "/pedagogica",
            search: { tab: "horarios" },
          },
          {
            label: "Calendário Lectivo",
            icon: CalendarDays,
            to: "/calendario",
          },
          {
            label: "Planos de Aula",
            icon: NotebookPen,
            to: "/planos-aula",
          },
        ],
      },
    ],
  },
  {
    title: "Secretaria",
    items: [
      { label: "Pessoas", icon: UserCog, to: "/pessoas" },
      {
        label: "Importação de Dados",
        icon: FileUp,
        children: [
          {
            label: "Nova Importação",
            icon: FileUp,
            to: "/importar",
            search: { tab: "novo" },
          },
          {
            label: "Histórico & Auditoria",
            icon: History,
            to: "/importar",
            search: { tab: "historico" },
          },
          {
            label: "Modelos Oficiais Excel",
            icon: Download,
            to: "/importar",
            search: { tab: "modelos" },
          },
        ],
      },
      {
        label: "Gestão de Alunos",
        icon: Users,
        children: [
          {
            label: "Matricular Aluno",
            icon: UserPlus,
            to: "/alunos",
            search: { action: "matricular" },
          },
          {
            label: "Confirmar Matrícula",
            icon: UserCheck,
            to: "/alunos",
            search: { action: "confirmar" },
          },
          {
            label: "Estado do Aluno",
            icon: Users,
            to: "/alunos",
            search: { action: "estado" },
          },
        ],
      },
      {
        label: "Documentos",
        icon: FileText,
        children: [{ label: "Emissão de Documentos", icon: FileText, to: "/documentos" }],
      },
    ],
  },
  {
    title: "Financeiro",
    items: [
      {
        label: "Caixa e Pagamentos",
        icon: CreditCard,
        children: [{ label: "Movimentos de Caixa", icon: CreditCard, to: "/financeiro" }],
      },
    ],
  },
  {
    title: "Relatórios",
    items: [
      { label: "Relatórios Financeiros", icon: TrendingUp, to: "/relatorios/financeiros" },
      { label: "Relatórios Académicos", icon: PieChart, to: "/relatorios/academicos" },
      { label: "Faturas", icon: Receipt, to: "/faturas" },
    ],
  },
  {
    title: "Gestão e Comunicação",
    items: [
      { label: "Gestão de Acessos", icon: UserCog, to: "/acessos" },
      { label: "Comunicações", icon: Megaphone, to: "/comunicacoes" },
    ],
  },
];

const MENU_KEY = "siga:sidebar-open-menus";

export function AppSidebar({
  className,
  collapsed = false,
  onOpenSettings,
}: {
  className?: string;
  collapsed?: boolean;
  onOpenSettings?: () => void;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const currentUser = useCurrentAccount();
  const { activeYearLabel } = useSchoolSettings();
  const { signOut, signingOut } = useSignOut();

  const visibleGroups = useMemo(
    () => getPortalNavigation(currentUser.role, currentUser.grants),
    [currentUser.role, currentUser.grants],
  );
  const parentsOfActive = visibleGroups
    .flatMap((g) => g.items)
    .filter((i) => i.children?.some((c) => c.to === pathname))
    .map((i) => i.label);
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
  }, [pathname]);

  const toggle = (label: string) =>
    setOpenMenus((prev) => {
      const next = prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label];
      localStorage.setItem(MENU_KEY, JSON.stringify(next));
      return next;
    });

  return (
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
          "flex h-14 items-center border-b border-sidebar-border/40",
          collapsed ? "justify-center px-2.5" : "px-3.5",
        )}
      >
        {collapsed ? (
          <SigaLogo variant="icon" size="sm" />
        ) : (
          <SigaLogo variant="full" size="sm" badgeText="Plus" />
        )}
      </div>

      <nav
        aria-label="Navegação principal"
        className={cn(
          "flex-1 pb-4",
          collapsed ? "overflow-visible px-2" : "no-scrollbar overflow-y-auto px-4",
        )}
      >
        {canAccessPath("/pedagogica", currentUser.role, currentUser.grants) ? (
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
                    <div className="pointer-events-auto min-w-52 rounded-xl border border-sidebar-border bg-sidebar p-2 shadow-2xl">
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
                                  active={child.to === pathname}
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
                        <ul className="mt-0.5 space-y-0.5 pl-4">
                          {item.children.map((child) => (
                            <li key={child.label}>
                              {child.to ? (
                                <NavLinkRow
                                  to={child.to}
                                  {...(child.search ? { search: child.search } : {})}
                                  label={child.label}
                                  depth="sub"
                                  active={child.to === pathname}
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
  );
}
