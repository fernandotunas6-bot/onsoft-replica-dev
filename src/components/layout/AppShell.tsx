import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { warmQueries } from "@/lib/queries";

import { Bell, ChevronDown, Maximize2, Menu, Moon, Settings, Sun } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { AccountDrawer } from "./AccountDrawer";
import { SettingsCenter } from "@/components/modals/SettingsCenter";
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
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    // Ajustado após medição de Web Vitals: os chunks são pré-carregados um a um
    // em fatias de tempo livre, para não competir com o primeiro render (FCP).
    const queue = routes.filter((to) => to !== pathname);
    const ric = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    let timer = 0;
    const step = () => {
      if (cancelled) return;
      const to = queue.shift();
      if (!to) return;
      void router.preloadRoute({ to }).catch(() => {});
      if (ric) ric(step, { timeout: 800 });
      else timer = window.setTimeout(step, 120);
    };
    if (ric) ric(step, { timeout: 1200 });
    else timer = window.setTimeout(step, 400);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [router, pathname]);

  // Pré-busca de dados (TanStack Query) dos módulos e filtros mais usados,
  // para que ao tocar já esteja tudo em cache.
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      warmQueries(queryClient);
    };
    const ric = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
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
      <a href="#conteudo-principal" className="skip-link">
        Saltar para o conteúdo principal
      </a>

      <AppSidebar
        collapsed={collapsed}
        className="sticky top-0 z-40 hidden h-screen lg:flex"
        accountOpen={accountOpen}
        onOpenAccount={() => setAccountOpen(true)}
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[260px] border-none p-0">
          <AppSidebar accountOpen={accountOpen} onOpenAccount={() => setAccountOpen(true)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-transparent px-4 py-3 backdrop-blur-xl md:px-6 lg:px-5 lg:py-2.5">

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
            <Button
              variant="ghost"
              size="icon"
              className="header-icon-btn"
              onClick={() => setSettingsOpen(true)}
              aria-label="Abrir configurações do sistema"
              aria-haspopup="dialog"
            >
              <Settings className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="header-icon-btn"
              onClick={toggleTheme}
              aria-label="Alternar tema"
            >
              {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="header-icon-btn"
              aria-label="Notificações"
            >
              <Bell className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="header-icon-btn hidden sm:inline-flex"
              aria-label="Ecrã inteiro"
            >
              <Maximize2 className="size-5" />
            </Button>
          </div>




          <AccountDrawer
            open={accountOpen}
            onOpenChange={setAccountOpen}
            onOpenSettings={() => {
              setAccountOpen(false);
              setSettingsOpen(true);
            }}
          />

          <SettingsCenter open={settingsOpen} onOpenChange={setSettingsOpen} />
        </header>

        <main
          id="conteudo-principal"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-5 lg:py-6"
        >
          {children}
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/60 px-4 py-5 text-xs text-muted-foreground backdrop-blur md:px-6 lg:py-4">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-2 font-semibold text-foreground">
              <span className="inline-flex size-6 items-center justify-center rounded-lg bg-primary-soft text-[10px] font-extrabold text-primary">
                S
              </span>
              SIGA
            </span>
            <span aria-hidden className="hidden h-3 w-px bg-border sm:block" />
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
