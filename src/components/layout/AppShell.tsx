import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { warmQueries } from "@/lib/queries";


import { Bell, ChevronDown, Maximize2, Menu, Moon, Sun } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { schoolYear } from "@/lib/school-data";

const COLLAPSE_KEY = "siga:sidebar-collapsed";
const years = [schoolYear, "Ano Lectivo 2023/2024", "Ano Lectivo 2022/2023"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const router = useRouter();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const [year, setYear] = useState(schoolYear);

  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Pré-carrega os módulos principais em tempo livre do browser: o toque
  // seguinte abre sem espera, sem alterar o visual nem as cores.
  useEffect(() => {
    const routes = [
      "/",
      "/alunos",
      "/pedagogica",
      "/documentos",
      "/financeiro",
      "/faturas",
      "/relatorios/academicos",
      "/relatorios/financeiros",
      "/comunicacoes",
      "/acessos",
      "/configuracoes",
    ];
    let cancelled = false;
    const run = () => {
      for (const to of routes) {
        if (cancelled || to === pathname) continue;
        void router.preloadRoute({ to }).catch(() => {});
      }
    };
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }).requestIdleCallback;
    const id = ric ? ric(run, { timeout: 2000 }) : window.setTimeout(run, 600);
    return () => {
      cancelled = true;
      if (!ric) window.clearTimeout(id as number);
    };
  }, [router, pathname]);

  // Pré-busca de dados (TanStack Query) dos módulos e filtros mais usados,
  // para que ao tocar já esteja tudo em cache.
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      for (const q of warmQueries) {
        void queryClient.prefetchQuery(q());
      }
    };
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }).requestIdleCallback;
    const id = ric ? ric(run, { timeout: 2500 }) : window.setTimeout(run, 800);
    return () => {
      cancelled = true;
      if (!ric) window.clearTimeout(id as number);
    };
  }, [queryClient]);




  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });

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
            className="header-icon-btn lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="header-icon-btn hidden lg:inline-flex"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <Menu className="size-5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-secondary/70 px-3.5 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:border-primary/40"
              >
                <span className="truncate whitespace-nowrap">
                  {year}
                  {year === schoolYear ? " (Atual)" : ""}
                </span>
                <ChevronDown className="size-4 shrink-0 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Ano lectivo</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {years.map((y) => (
                <DropdownMenuItem key={y} onClick={() => setYear(y)}>
                  {y}
                  {y === schoolYear ? " (Atual)" : ""}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="header-icon-btn" onClick={toggleTheme} aria-label="Alternar tema">
              {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
            <Button variant="ghost" size="icon" className="header-icon-btn" aria-label="Notificações">
              <Bell className="size-5" />
            </Button>
            <Button variant="ghost" size="icon" className="header-icon-btn hidden sm:inline-flex" aria-label="Ecrã inteiro">
              <Maximize2 className="size-5" />
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-3 rounded-full px-1.5 py-1 transition-colors hover:bg-secondary"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  U
                </span>
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-sm font-semibold">usuario teste</span>
                  <span className="block text-xs text-muted-foreground">admin</span>
                </span>
                <ChevronDown className="hidden size-4 opacity-60 sm:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>usuario teste</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Perfil</DropdownMenuItem>
              <DropdownMenuItem>Alterar senha</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Terminar sessão</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-4 text-xs text-muted-foreground md:px-6">
          <div className="flex gap-4">
            <a href="#politicas" className="transition-colors hover:text-foreground">
              Políticas
            </a>
            <a href="#termos" className="transition-colors hover:text-foreground">
              Termos de uso
            </a>
          </div>
          <span>© SIGA — Sistema Integrado de Gestão Académica</span>
        </footer>
      </div>
    </div>
  );
}
