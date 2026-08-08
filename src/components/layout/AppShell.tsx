import { useState, type ReactNode } from "react";
import { Bell, Maximize2, Menu, Moon, PanelsTopLeft, Search, Sun } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { schoolYear } from "@/lib/school-data";

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);

  const toggleTheme = () => {
    setDark((d) => {
      document.documentElement.classList.toggle("dark", !d);
      return !d;
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar className="sticky top-0 hidden h-screen lg:flex" />

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

          <Button variant="ghost" size="icon" className="hidden lg:inline-flex" aria-label="Recolher menu">
            <PanelsTopLeft className="size-5" />
          </Button>

          <div className="hidden items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground md:flex">
            <Search className="size-4" />
            <span>Pesquisar aluno, turma ou factura…</span>
          </div>

          <span className="ml-auto hidden rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground sm:inline-flex">
            {schoolYear} (Atual)
          </span>

          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Notificações">
            <Bell className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Ecrã inteiro">
            <Maximize2 className="size-5" />
          </Button>

          <div className="flex items-center gap-3 border-l border-border pl-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              U
            </span>
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-semibold">usuario teste</p>
              <p className="text-xs text-muted-foreground">admin</p>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
