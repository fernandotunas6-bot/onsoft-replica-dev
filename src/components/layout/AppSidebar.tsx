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

type Item = { label: string; icon: React.ElementType; to?: string; hasChildren?: boolean };
type Group = { title: string; items: Item[] };

const groups: Group[] = [
  {
    title: "Académico",
    items: [
      { label: "Dashboard", icon: LayoutGrid, to: "/" },
      { label: "Área Pedagógica", icon: BookOpen, hasChildren: true },
    ],
  },
  {
    title: "Secretaria",
    items: [
      { label: "Gestão de Alunos", icon: Users, to: "/alunos" },
      { label: "Documentos", icon: FileText, hasChildren: true },
    ],
  },
  {
    title: "Financeiro",
    items: [{ label: "Caixa e Pagamentos", icon: CreditCard, hasChildren: true }],
  },
  {
    title: "Relatórios",
    items: [
      { label: "Relatórios Financeiros", icon: TrendingUp, hasChildren: true },
      { label: "Relatórios Académicos", icon: PieChart, hasChildren: true },
      { label: "Faturas", icon: Receipt, hasChildren: true },
    ],
  },
  {
    title: "Gestão e Comunicação",
    items: [
      { label: "Gestão de Acessos", icon: UserCog, hasChildren: true },
      { label: "Comunicações", icon: Megaphone },
    ],
  },
  {
    title: "Config. do Sistema",
    items: [{ label: "Configurações", icon: Settings, hasChildren: true }],
  },
  {
    title: "Conta",
    items: [{ label: "Alterar Senha", icon: Lock }],
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
          <p className="font-display text-base font-extrabold tracking-tight">ONSCHOOL</p>
          <p className="text-[11px] text-sidebar-muted">Gestão escolar</p>
        </div>
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
                        to={item.to}
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
