import { Link } from "@tanstack/react-router";
import {
  FileText,
  Home,
  Lock,
  LogOut,
  Megaphone,
  Rocket,
  Settings,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import type { ChipTone } from "@/components/ui/icon-chip";

type Row = {
  label: string;
  to: string;
  icon: React.ElementType;
  tone: ChipTone;
  badge?: string;
};

// Lista vertical no estilo Minimals: ícone em chip suave + rótulo + contador.
const rows: Row[] = [
  { label: "Início", to: "/", icon: Home, tone: "primary" },
  { label: "Perfil", to: "/configuracoes", icon: User, tone: "info" },
  { label: "Estudantes", to: "/alunos", icon: Users, tone: "info", badge: "3" },
  { label: "Documentos", to: "/documentos", icon: FileText, tone: "muted" },
  { label: "Comunicações", to: "/comunicacoes", icon: Megaphone, tone: "primary" },
  { label: "Segurança", to: "/acessos", icon: ShieldCheck, tone: "warning" },
  { label: "Alterar senha", to: "/alterar-senha", icon: Lock, tone: "muted" },
  { label: "Configurações de conta", to: "/configuracoes", icon: Settings, tone: "muted" },
];

const team = ["A", "M", "J"];

export function AccountDrawer({
  open,
  onOpenChange,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenSettings?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[280px] flex-col gap-0 border-l border-border bg-card/95 p-0 backdrop-blur-xl sm:w-[300px]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Conta</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-6">
          <span className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-2xl font-extrabold text-primary ring-1 ring-border ring-offset-4 ring-offset-card">
            U
          </span>
          <div className="text-center leading-tight">
            <p className="text-base font-semibold text-foreground">usuario teste</p>
            <p className="text-sm text-muted-foreground">teste@escola.com</p>
          </div>

          <div className="mt-1 flex items-center gap-2">
            {team.map((t) => (
              <span
                key={t}
                className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground ring-2 ring-card"
              >
                {t}
              </span>
            ))}
            <button
              type="button"
              aria-label="Adicionar utilizador"
              className="flex size-8 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              +
            </button>
          </div>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-2">
          <ul className="space-y-0.5">
            {rows.map(({ label, to, icon, tone, badge }) =>
              label === "Configurações de conta" && onOpenSettings ? (
                <li key={label}>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    aria-haspopup="dialog"
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-foreground/85 outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <IconChip icon={icon} tone={tone} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                  </button>
                </li>
              ) : (
                <li key={label}>
                  <Link
                    to={to}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-foreground/85 transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <IconChip icon={icon} tone={tone} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {badge ? (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ),
            )}
          </ul>

          <div className="mt-4 overflow-hidden rounded-2xl bg-primary-soft p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">Módulo Premium</p>
                <p className="mt-0.5 text-xs text-primary/80">
                  Relatórios avançados e automações da escola.
                </p>
                <Link
                  to="/configuracoes"
                  onClick={() => onOpenChange(false)}
                  className="mt-3 inline-flex rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Activar agora
                </Link>
              </div>
              <IconChip icon={Rocket} tone="primary" size="md" />
            </div>
          </div>
        </div>

        <div className="px-4 pb-6 pt-3">
          <Button
            variant="ghost"
            className="w-full justify-center gap-2 rounded-2xl bg-destructive/10 py-5 font-semibold text-destructive hover:bg-destructive/15 hover:text-destructive"
          >
            <LogOut className="size-4" />
            Sair
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
