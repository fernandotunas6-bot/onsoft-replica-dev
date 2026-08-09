import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronRight,
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
  UserCog,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TenantSwitcher } from "./TenantSwitcher";

type Item = { label: string; icon: React.ElementType; to?: string; hasChildren?: boolean };
type Group = { title: string; items: Item[] };

const groups: Group[] = [
  {
    title: "Académico",
    items: [
      { label: "Dashboard", icon: LayoutGrid, to: "/" },
      { label: "Área Pedagógica", icon: BookOpen, to: "/pedagogica" },
    ],
  },
  {
    title: "Secretaria",
    items: [
      { label: "Gestão de Alunos", icon: Users, to: "/alunos" },
      { label: "Documentos", icon: FileText, to: "/documentos" },
    ],
  },
  {
    title: "Financeiro",
    items: [{ label: "Caixa e Pagamentos", icon: CreditCard, to: "/financeiro" }],
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

const rowClass =
  "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export function AppSidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "flex h-full w-[270px] shrink-0 flex-col bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-sidebar-border px-6 py-5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
          <GraduationCap className="size-5" />
        </span>
        <div className="leading-tight">
          <p className="font-display text-base font-extrabold tracking-tight">SIGA</p>
          <p className="text-[11px] text-sidebar-muted">Sistema Integrado de Gestão Académica</p>
        </div>
      </div>

      <div className="px-3 pt-4 lg:hidden">
        <TenantSwitcher compact />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
              {group.title}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const content = (
                  <>
                    <Icon className="size-[18px] shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.hasChildren ? (
                      <ChevronRight className="ml-auto size-4 opacity-50 transition-transform group-hover:translate-x-0.5" />
                    ) : null}
                  </>
                );

                return (
                  <li key={item.label}>
                    {item.to ? (
                      <Link
                        to={item.to as string}
                        activeOptions={{ exact: true }}
                        className={rowClass}
                        activeProps={{
                          className:
                            "bg-sidebar-primary text-sidebar-primary-foreground shadow-float hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
                        }}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button type="button" className={rowClass}>
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-6 py-4 text-[11px] text-sidebar-muted">
        Ano Lectivo 2024/2025
      </div>
    </aside>
  );
}
