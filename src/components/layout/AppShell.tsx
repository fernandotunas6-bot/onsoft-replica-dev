import { useState, type ReactNode } from "react";
import { Bell, ChevronDown, Maximize2, Menu, Moon, Sun } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { schoolYear } from "@/lib/school-data";

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);

  const toggleTheme = () => {
    setDark((d) => {
      document.documentElement.classList.toggle("dark", !d);
      return !d;
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar collapsed={collapsed} className="sticky top-0 hidden h-screen lg:flex" />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[270px] border-none p-0">
          <AppSidebar />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/85 px-4 py-3 backdrop-blur-xl md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Recolher menu"
          >
            <Menu className="size-5" />
          </Button>

          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:border-primary/40"
          >
            <span className="whitespace-nowrap">{schoolYear} (Atual)</span>
            <ChevronDown className="size-4 opacity-60" />
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
              {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Notificações">
              <Bell className="size-5" />
            </Button>
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Ecrã inteiro">
              <Maximize2 className="size-5" />
            </Button>
          </div>

          <button
            type="button"
            className="flex items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-secondary"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              U
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-semibold">usuario teste</span>
              <span className="block text-xs text-muted-foreground">admin</span>
            </span>
            <ChevronDown className="hidden size-4 opacity-60 sm:block" />
          </button>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-4 text-xs text-muted-foreground md:px-6">
          <div className="flex gap-4">
            <span>Políticas</span>
            <span>Termos de uso</span>
          </div>
          <span>© SIGA — Sistema Integrado de Gestão Académica</span>
        </footer>
      </div>
    </div>
  );
}
