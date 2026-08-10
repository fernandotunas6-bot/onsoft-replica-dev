import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
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
import { NavButtonRow, NavLinkRow, NavSubheader } from "./NavItem";

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
      data-sidebar="siga"
      className={cn(
        "flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-[88px]" : "w-[300px]",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 py-6",
          collapsed ? "justify-center px-3" : "px-5",
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
          <GraduationCap className="size-[22px]" />
        </span>
        {!collapsed ? (
          <div className="min-w-0 leading-tight">
            <p className="font-display text-base font-extrabold tracking-tight">SIGA</p>
            <p className="truncate text-[11px] text-sidebar-muted">
              Sistema Integrado de Gestão Académica
            </p>
          </div>
        ) : null}
      </div>

      <nav
        aria-label="Navegação principal"
        className={cn("no-scrollbar flex-1 overflow-y-auto pb-4", collapsed ? "px-2" : "px-4")}
      >
        {groups.map((group) => (
          <div key={group.title}>
            <NavSubheader title={group.title} collapsed={collapsed} />
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isOpen = openMenus.includes(item.label);
                const childActive = item.children?.some((c) => c.to === pathname) ?? false;

                if (item.children) {
                  return (
                    <li key={item.label}>
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
                    </li>
                  );
                }

                return (
                  <li key={item.label}>
                    <NavLinkRow
                      to={item.to as string}
                      label={item.label}
                      icon={item.icon}
                      collapsed={collapsed}
                      active={item.to === pathname}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed ? (
        <div className="px-5 py-4 text-[11px] text-sidebar-muted">Ano Lectivo 2024/2025</div>
      ) : null}
    </aside>
  );
}
