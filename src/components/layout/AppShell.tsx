import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";

import { Bell, ChevronDown, FileText, Maximize2, Menu, Moon, Sun, Users, Wallet } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { AccountDrawer } from "./AccountDrawer";
import { AppLauncher } from "./AppLauncher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/ui/user-avatar";
import { IconChip } from "@/components/ui/icon-chip";
import type { ChipTone } from "@/components/ui/icon-chip";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useAppearance } from "@/lib/appearance";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { canAccessPath } from "@/features/auth/access-policy";
import { consumeSettingsOpen, OPEN_SETTINGS_EVENT } from "@/lib/settings-deep-link";
import { scheduleIdleRouteWarmup } from "@/lib/idle-route-warmup";
import { useInboxUnread } from "@/features/messages/use-inbox-unread";
import { initialsFromName } from "@/features/messages/recent-contacts";
import { requestOpenDirectMessage } from "@/features/messages/unread";
import { useSchoolAlerts } from "@/features/dashboard/use-school-alerts";
import type { SchoolAlert } from "@/features/dashboard/alerts";

const COLLAPSE_KEY = "siga:sidebar-collapsed";
const SettingsCenter = lazy(() =>
  import("@/components/modals/SettingsCenter").then(({ SettingsCenter }) => ({
    default: SettingsCenter,
  })),
);

export function AppShell({ children }: { children: ReactNode }) {
  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}

function AuthenticatedAppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const router = useRouter();
  const currentUser = useCurrentAccount();
  const { unread, unreadCount } = useInboxUnread();
  const { alerts, alertCount } = useSchoolAlerts();
  const noticeCount = unreadCount + alertCount;
  const { selectedYearLabel, selectedYearId, activeYear, yearOptions, setSelectedYearId } =
    useSchoolSettings();
  const activeYearLabel = activeYear?.label ?? selectedYearLabel;

  const [open, setOpen] = useState(false);
  const [pinnedCollapsed, setPinnedCollapsed] = useState(true);
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverLeaveTimer = useRef<number>(0);
  const { isDark, toggleDark } = useAppearance();
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPanelId, setSettingsPanelId] = useState<string | undefined>(undefined);
  const openSettings = (panelId?: string) => {
    setSettingsPanelId(panelId);
    setSettingsOpen(true);
  };
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [legalDoc, setLegalDoc] = useState<"politicas" | "termos" | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === "0") setPinnedCollapsed(false);
    return () => window.clearTimeout(hoverLeaveTimer.current);
  }, []);

  useEffect(() => {
    const panelId = consumeSettingsOpen();
    if (panelId !== undefined && canAccessPath("/configuracoes", currentUser.role, currentUser.grants)) {
      setSettingsPanelId(panelId);
      setSettingsOpen(true);
    }
  }, [currentUser.role, currentUser.grants]);

  useEffect(() => {
    const onOpenSettings = (event: Event) => {
      if (!canAccessPath("/configuracoes", currentUser.role, currentUser.grants)) return;
      const panelId = (event as CustomEvent<{ panelId?: string }>).detail?.panelId;
      setSettingsPanelId(panelId);
      setSettingsOpen(true);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpenSettings);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onOpenSettings);
  }, [currentUser.role, currentUser.grants]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Pré-carrega até 4 rotas adjacentes uma vez por sessão (sem repetir a cada navegação).
  useEffect(() => {
    const routes = [
      "/alunos",
      "/pedagogica",
      "/calendario",
      "/documentos",
      "/financeiro",
      "/comunicacoes",
    ].filter((to) => canAccessPath(to, currentUser.role, currentUser.grants));

    return scheduleIdleRouteWarmup(routes, (to) => {
      void router.preloadRoute({ to }).catch(() => {});
    });
  }, [router, currentUser.role, currentUser.grants]);

  const collapsed = pinnedCollapsed && !hoverOpen;

  const toggleCollapsed = () =>
    setPinnedCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });

  const selectYear = (yearId: string) => {
    if (yearId === "fallback") return;
    setSelectedYearId(yearId);
    const option = yearOptions.find((year) => year.id === yearId);
    toast.success("Ano lectivo alterado", {
      description: option
        ? `A mostrar dados de ${option.label}.`
        : "A interface vai filtrar turmas e matrículas deste ano.",
    });
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      toast.error("Não foi possível alternar o ecrã inteiro neste browser.");
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <a href="#conteudo-principal" className="skip-link">
        Saltar para o conteúdo principal
      </a>

      <div
        className="sticky top-0 z-40 hidden h-screen lg:block"
        onMouseEnter={() => {
          window.clearTimeout(hoverLeaveTimer.current);
          setHoverOpen(true);
        }}
        onMouseLeave={() => {
          hoverLeaveTimer.current = window.setTimeout(() => setHoverOpen(false), 220);
        }}
      >
        <AppSidebar
          collapsed={collapsed}
          className="h-full"
          onOpenSettings={() => openSettings()}
          onOpenProfile={() => openSettings("conta.perfil")}
        />
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[260px] border-none p-0">
          <AppSidebar
            onOpenSettings={() => openSettings()}
            onOpenProfile={() => openSettings("conta.perfil")}
          />
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
                  {selectedYearLabel}
                  {selectedYearId && selectedYearId === activeYear?.id ? " (Atual)" : ""}
                </span>
                <ChevronDown className="size-4 shrink-0 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Ano lectivo</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {yearOptions.map((y) => (
                <DropdownMenuItem key={y.id} onClick={() => selectYear(y.id)}>
                  {y.label}
                  {y.id === activeYear?.id || y.label === activeYearLabel ? " (Atual)" : ""}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-1">
            <AppLauncher onOpenSettings={openSettings} />
            <Button
              variant="ghost"
              size="icon"
              className="header-icon-btn"
              onClick={toggleDark}
              aria-label="Alternar tema"
            >
              {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="header-icon-btn relative"
              aria-label="Notificações"
              aria-haspopup="dialog"
              onClick={() => setNotificationsOpen(true)}
            >
              <Bell className="size-5" />
              {noticeCount ? (
                <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-background" />
              ) : null}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="header-icon-btn hidden sm:inline-flex"
              aria-label={isFullscreen ? "Sair do ecrã inteiro" : "Ecrã inteiro"}
              onClick={toggleFullscreen}
            >
              <Maximize2 className="size-5" />
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            data-account-trigger=""
            aria-label="Abrir painel da conta"
            aria-haspopup="dialog"
            aria-expanded={accountOpen}
            className="flex items-center gap-3 rounded-full px-1.5 py-1 transition-colors hover:bg-secondary"
          >
            <span className="relative">
              <UserAvatar
                url={currentUser.avatarUrl}
                initials={currentUser.initials}
                className="size-9 bg-primary text-sm font-semibold text-primary-foreground ring-2 ring-primary/20"
              />
              {unreadCount ? (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-4 text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-semibold">{currentUser.name}</span>
              <span className="block text-xs text-muted-foreground">{currentUser.role}</span>
            </span>
            <ChevronDown className="hidden size-4 opacity-60 sm:block" />
          </button>

          <AccountDrawer
            open={accountOpen}
            onOpenChange={setAccountOpen}
            onOpenSettings={(panelId) => {
              setAccountOpen(false);
              openSettings(panelId);
            }}
          />

          <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <SheetContent side="right" className="w-[320px] sm:w-[360px]">
              <SheetHeader>
                <SheetTitle>Notificações</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-3">
                {alerts.map((alert) => (
                  <SchoolAlertRow
                    key={alert.id}
                    alert={alert}
                    onClose={() => setNotificationsOpen(false)}
                    onOpenSettings={(panelId) => {
                      setNotificationsOpen(false);
                      openSettings(panelId);
                    }}
                  />
                ))}
                {unread.map((row) => (
                  <button
                    key={row.peerId}
                    type="button"
                    className="flex w-full items-start gap-3 rounded-2xl border border-border bg-secondary/40 px-3 py-3 text-left transition-colors hover:bg-secondary"
                    onClick={() => {
                      setNotificationsOpen(false);
                      setAccountOpen(true);
                      requestOpenDirectMessage(row.peerId);
                    }}
                  >
                    <UserAvatar
                      url={row.avatar_url}
                      initials={initialsFromName(row.full_name)}
                      className="size-9 bg-primary-soft text-xs font-bold text-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{row.full_name}</span>
                      <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {row.lastBody}
                      </span>
                    </span>
                  </button>
                ))}
                {!alerts.length && !unread.length ? (
                  <p className="rounded-2xl border border-border bg-secondary/40 px-4 py-5 text-sm text-muted-foreground">
                    Sem notificações novas. Candidaturas, documentos, faturas em atraso e mensagens
                    internas aparecem aqui.
                  </p>
                ) : null}
                {canAccessPath("/comunicacoes", currentUser.role) ? (
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/comunicacoes" onClick={() => setNotificationsOpen(false)}>
                      Abrir comunicações
                    </Link>
                  </Button>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>

          <Dialog open={legalDoc !== null} onOpenChange={(next) => !next && setLegalDoc(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {legalDoc === "termos" ? "Termos de uso" : "Políticas de privacidade"}
                </DialogTitle>
                <DialogDescription>
                  {legalDoc === "termos"
                    ? "O SIGA é destinado à gestão académica da escola. Os utilizadores devem proteger as suas credenciais e usar apenas os módulos autorizados pelo seu perfil."
                    : "Os dados pessoais de alunos, encarregados e colaboradores são tratados apenas para fins escolares, com acesso controlado por função e auditoria de alterações sensíveis."}
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>

          {settingsOpen && canAccessPath("/configuracoes", currentUser.role) ? (
            <Suspense fallback={null}>
              <SettingsCenter
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                initialPanelId={settingsPanelId}
              />
            </Suspense>
          ) : null}
        </header>

        <main
          id="conteudo-principal"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-5 lg:py-6 [content-visibility:auto]"
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
            <button
              type="button"
              onClick={() => setLegalDoc("politicas")}
              className="transition-colors hover:text-foreground"
            >
              Políticas
            </button>
            <button
              type="button"
              onClick={() => setLegalDoc("termos")}
              className="transition-colors hover:text-foreground"
            >
              Termos de uso
            </button>
          </div>
          <span>© SIGA — Sistema Integrado de Gestão Académica</span>
        </footer>
      </div>
    </div>
  );
}

const alertChip: Record<SchoolAlert["kind"], { icon: typeof FileText; tone: ChipTone }> = {
  candidaturas: { icon: Users, tone: "info" },
  matricula: { icon: Users, tone: "primary" },
  documentos: { icon: FileText, tone: "warning" },
  faturas: { icon: Wallet, tone: "destructive" },
};

function SchoolAlertRow({
  alert,
  onClose,
  onOpenSettings,
}: {
  alert: SchoolAlert;
  onClose: () => void;
  onOpenSettings: (panelId: string) => void;
}) {
  const chip = alertChip[alert.kind];
  const body = (
    <>
      <IconChip icon={chip.icon} tone={chip.tone} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{alert.title}</span>
        <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{alert.detail}</span>
      </span>
    </>
  );
  const className =
    "flex w-full items-start gap-3 rounded-2xl border border-border bg-secondary/40 px-3 py-3 text-left transition-colors hover:bg-secondary";

  if (alert.settingsPanel) {
    return (
      <button type="button" className={className} onClick={() => onOpenSettings(alert.settingsPanel!)}>
        {body}
      </button>
    );
  }
  if (alert.href === "/alunos") {
    return (
      <Link to="/alunos" search={{ action: "confirmar" }} className={className} onClick={onClose}>
        {body}
      </Link>
    );
  }
  if (alert.href === "/documentos") {
    return (
      <Link to="/documentos" className={className} onClick={onClose}>
        {body}
      </Link>
    );
  }
  return (
    <Link to="/faturas" className={className} onClick={onClose}>
      {body}
    </Link>
  );
}
