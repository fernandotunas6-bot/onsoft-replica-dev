import { Link } from "@tanstack/react-router";
import {
  FileText,
  Lock,
  LogOut,
  Megaphone,
  Settings,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";

const quickLinks: { label: string; to: string; icon: React.ElementType }[] = [
  { label: "Dashboard", to: "/", icon: ShieldCheck },
  { label: "Estudantes", to: "/alunos", icon: Users },
  { label: "Documentos", to: "/documentos", icon: FileText },
  { label: "Comunicações", to: "/comunicacoes", icon: Megaphone },
  { label: "Configurações", to: "/configuracoes", icon: Settings },
  { label: "Alterar senha", to: "/alterar-senha", icon: Lock },
];

export function AccountDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[320px] border-l border-border bg-card/95 p-0 backdrop-blur-xl sm:w-[340px]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Conta</SheetTitle>
        </SheetHeader>

        <div className="flex h-full flex-col">
          <div className="flex flex-col items-center gap-3 border-b border-border px-6 py-8">
            <span className="flex size-20 items-center justify-center rounded-full bg-primary-soft text-2xl font-extrabold text-primary ring-4 ring-primary/15">
              U
            </span>
            <div className="text-center leading-tight">
              <p className="text-base font-semibold text-foreground">usuario teste</p>
              <p className="text-xs text-muted-foreground">teste@escola.com</p>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-secondary-foreground">
              admin
            </span>
          </div>

          <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-5">
            <p className="px-2 pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Atalhos
            </p>
            <div className="grid grid-cols-2 gap-2">
              {quickLinks.map(({ label, to, icon }) => (
                <Link
                  key={label}
                  to={to}
                  onClick={() => onOpenChange(false)}
                  className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-background/60 p-3 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
                >
                  <IconChip icon={icon} tone="primary" size="sm" />
                  <span className="truncate">{label}</span>
                </Link>
              ))}
            </div>

            <p className="px-2 pt-6 pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Conta
            </p>
            <ul className="space-y-1">
              <li>
                <button
                  type="button"
                  className="nav-row w-full text-foreground/80 hover:bg-secondary hover:text-foreground"
                >
                  <IconChip icon={User} tone="muted" size="sm" />
                  <span>Perfil</span>
                </button>
              </li>
              <li>
                <Link
                  to="/alterar-senha"
                  onClick={() => onOpenChange(false)}
                  className="nav-row w-full text-foreground/80 hover:bg-secondary hover:text-foreground"
                >
                  <IconChip icon={Lock} tone="muted" size="sm" />
                  <span>Alterar senha</span>
                </Link>
              </li>
            </ul>
          </div>

          <div className="border-t border-border px-4 py-4">
            <Button variant="destructive" className="w-full gap-2">
              <LogOut className="size-4" />
              Terminar sessão
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
