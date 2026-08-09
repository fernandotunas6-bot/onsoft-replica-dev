import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronDown,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutGrid,
  Lock,
  Megaphone,
  PieChart,
  Receipt,
  Settings,
  TrendingUp,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Child = { label: string; icon: React.ElementType; to?: string };
type Item = { label: string; icon: React.ElementType; to?: string; children?: Child[] };
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
          { label: "Turmas e Disciplinas", icon: BookOpen, to: "/pedagogica" },
          { label: "Notas e Avaliações", icon: PieChart },
        ],
      },
    ],
  },
  {
    title: "Secretaria",
    items: [
      {
        label: "Gestão de Alunos",
        icon: Users,
        children: [
          { label: "Matricular Aluno", icon: UserPlus },
          { label: "Confirmar Matrícula", icon: UserCheck },
          { label: "Estado do Aluno", icon: Users, to: "/alunos" },
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
  {
    title: "Config. do Sistema",
    items: [{ label: "Configurações", icon: Settings, to: "/configuracoes" }],
  },
  {
    title: "Conta",
    items: [{ label: "Alterar Senha", icon: Lock, to: "/alterar-senha" }],
  },
];

const MENU_KEY = "siga:sidebar-open-menus";

const rowClass =
  "nav-row group text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

const activeClass =
  "bg-primary/14 text-primary font-semibold shadow-nav-active hover:bg-primary/16 hover:text-primary [&_[data-chip]]:bg-primary/18 [&_[data-chip]]:text-primary";

export function AppSidebar({
  className,
  collapsed = false,
}: {
  className?: string;
  collapsed?: boolean;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const parentsOfActive = groups
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
      const next = prev.includes(label)
        ? prev.filter((l) => l !== label)
        : [...prev, label];
      localStorage.setItem(MENU_KEY, JSON.stringify(next));
      return next;
    });


  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-[76px]" : "w-[270px]",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b border-sidebar-border py-5",
          collapsed ? "justify-center px-3" : "px-6",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
          <GraduationCap className="size-5" />
        </span>
        {!collapsed ? (
          <div className="leading-tight">
            <p className="font-display text-base font-extrabold tracking-tight">SIGA</p>
            <p className="text-[11px] text-sidebar-muted">Sistema Integrado de Gestão Académica</p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group.title}>
            {!collapsed ? (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
                {group.title}
              </p>
            ) : (
              <div className="mx-3 mb-2 h-px bg-sidebar-border" />
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isOpen = openMenus.includes(item.label);
                const childActive = item.children?.some((c) => c.to === pathname);

                if (item.children) {
                  return (
                    <li key={item.label}>
                      <button
                        type="button"
                        onClick={() => toggle(item.label)}
                        aria-expanded={isOpen}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          rowClass,
                          collapsed && "justify-center px-0",
                          childActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                        )}
                      >
                        <span
                          data-chip
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent/70 text-sidebar-foreground/90 transition-colors group-hover:bg-sidebar-accent"
                        >
                          <Icon className="size-[18px]" />
                        </span>
                        {!collapsed ? (
                          <>
                            <span className="truncate">{item.label}</span>
                            <ChevronDown
                              className={cn(
                                "ml-auto size-4 opacity-60 transition-transform",
                                isOpen && "rotate-180",
                              )}
                            />
                          </>
                        ) : null}
                      </button>

                      {isOpen && !collapsed ? (
                        <ul className="mt-1 space-y-1 border-l border-sidebar-border pl-3">
                          {item.children.map((child) => {
                            const ChildIcon = child.icon;
                            return (
                              <li key={child.label}>
                                {child.to ? (
                                  <Link
                                    to={child.to}
                                    className={cn(rowClass, "py-2 text-[13px]")}
                                    activeOptions={{ exact: true }}
                                    activeProps={{ className: activeClass }}
                                  >
                                    <span
                                      data-chip
                                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent/60 text-sidebar-foreground/85"
                                    >
                                      <ChildIcon className="size-[15px]" />
                                    </span>
                                    <span className="truncate">{child.label}</span>
                                  </Link>
                                ) : (
                                  <button
                                    type="button"
                                    className={cn(rowClass, "py-2 text-[13px]")}
                                  >
                                    <ChildIcon className="size-4 shrink-0" />
                                    <span className="truncate">{child.label}</span>
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                }

                return (
                  <li key={item.label}>
                    <Link
                      to={item.to as string}
                      activeOptions={{ exact: true }}
                      title={collapsed ? item.label : undefined}
                      className={cn(rowClass, collapsed && "justify-center px-0")}
                      activeProps={{ className: activeClass }}
                    >
                      <Icon className="size-[18px] shrink-0" />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed ? (
        <div className="border-t border-sidebar-border px-6 py-4 text-[11px] text-sidebar-muted">
          Ano Lectivo 2024/2025
        </div>
      ) : null}
    </aside>
  );
}
