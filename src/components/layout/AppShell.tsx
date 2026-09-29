import {
  PersonalNotificationsList,
  usePersonalNotifications,
} from "@/features/notifications/PersonalNotificationsList";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";

import {
  Bell,
  ChevronDown,
  CircleHelp,
  FileText,
  Maximize2,
  Menu,
  Moon,
  Palette,
  Search,
  Star,
  Sun,
  Users,
  Wallet,
} from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { AccountDrawer } from "./AccountDrawer";
import { AppLauncher } from "./AppLauncher";
import { CommandPalette, requestOpenCommandPalette } from "./CommandPalette";
import { TopbarCalendar } from "./TopbarCalendar";
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
import { useNavigationMemory } from "@/features/auth/use-navigation-memory";
import { useAppearance } from "@/lib/appearance";
import { cn } from "@/lib/utils";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { canAccessPath } from "@/features/auth/access-policy";
import { useTenant } from "@/features/saas/tenant-context";
import { planIncludesPath, trialDaysRemaining } from "@/features/saas/plan-features";
import { buildStudentCapacity } from "@/features/saas/tenant-limits";
import { getPricingUrl, getSigaNavDocUrl } from "@/lib/ecosystem-urls";
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
const ContextualActionsPanelHost = lazy(() =>
  import("@/features/intelligence/components/ContextualActionsPanelHost").then(
    ({ ContextualActionsPanelHost }) => ({ default: ContextualActionsPanelHost }),
  ),
);

export function AppShell({ children }: { children: ReactNode }) {
  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}

function AuthenticatedAppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const router = useRouter();
  const currentUser = useCurrentAccount();
  const { activePlan, activeTenant } = useTenant();
  const trialDaysLeft = trialDaysRemaining(activeTenant?.trial_ends_at);
  const studentCapacity = buildStudentCapacity(
    activeTenant?.active_students_count ?? 0,
    activeTenant,
    activePlan,
  );
  const { unread, unreadCount } = useInboxUnread();
  const { alerts, alertCount } = useSchoolAlerts();
  const personalNotifications = usePersonalNotifications();
  const personalUnread = personalNotifications.data?.unread ?? 0;
  const personalCount = personalNotifications.data?.items.length ?? 0;
  const noticeCount = unreadCount + alertCount + personalUnread;
  const {
    selectedYearLabel,
    selectedYearId,
    activeYear,
    yearOptions,
    setSelectedYearId,
    school,
    terms,
    selectedTermId,
    selectedTermLabel,
    setSelectedTermId,
  } = useSchoolSettings();
  const activeYearLabel = activeYear?.label ?? selectedYearLabel;

  const [open, setOpen] = useState(false);
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverLeaveTimer = useRef<number>(0);
  const { isDark, toggleDark } = useAppearance();
  const { favorited, toggleFavorite, current: navCurrent } = useNavigationMemory();
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
    // O sidebar deve sempre iniciar expandido
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored === "1") {
      setPinnedCollapsed(true);
    } else {
      setPinnedCollapsed(false);
    }
    return () => window.clearTimeout(hoverLeaveTimer.current);
  }, []);

  useEffect(() => {
    const panelId = consumeSettingsOpen();
    if (
      panelId !== undefined &&
      canAccessPath("/configuracoes", currentUser.role, currentUser.grants)
    ) {
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
    if (!activePlan || pathname === "/" || pathname.startsWith("/api/")) return;
    if (!planIncludesPath(pathname, activePlan)) {
      toast.error("Este módulo não está incluído no plano da sua escola.");
      void router.navigate({ to: "/" });
    }
  }, [pathname, activePlan, router]);

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
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <div className="flex flex-1 min-h-0">
        <a href="#conteudo-principal" className="skip-link">
          Saltar para o conteúdo principal
        </a>

        <div
          className="sticky top-[var(--titlebar-h,0px)] z-40 hidden h-[calc(100dvh-var(--titlebar-h,0px))] lg:block lg:py-2 lg:pl-2"
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
            onOpenSettings={(panelId) => openSettings(panelId)}
          />
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-[272px] max-w-[85vw] border-none bg-sidebar p-0">
            <AppSidebar onOpenSettings={(panelId) => openSettings(panelId)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col lg:m-2 lg:overflow-clip lg:rounded-xl lg:border lg:border-border/70 lg:bg-card/40 lg:shadow-subtle">
          <header className="sticky top-[var(--titlebar-h,0px)] z-30 flex h-14 items-center gap-1.5 border-b border-border/60 bg-background/80 px-3 backdrop-blur-md backdrop-saturate-150 sm:gap-2 md:px-4 lg:px-5">
            <Button
              variant="ghost"
              size="icon"
              className="header-icon-btn lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="size-[18px]" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="header-icon-btn hidden lg:inline-flex"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              <Menu className="size-[18px]" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 min-w-0 max-w-[min(100%,18rem)] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.05] data-[state=open]:bg-foreground/[0.05]"
                >
                  <span className="hidden truncate text-muted-foreground sm:inline">
                    {school?.name ? `${school.name} · ` : ""}
                  </span>
                  <span className="truncate whitespace-nowrap">{selectedYearLabel}</span>
                  {selectedYearId && selectedYearId === activeYear?.id ? (
                    <span className="hidden rounded-sm bg-success/12 px-1 py-px text-[11px] font-medium text-success-strong sm:inline">
                      Actual
                    </span>
                  ) : null}
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>
                  {school?.name ? `${school.name} · Ano lectivo` : "Ano lectivo"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {yearOptions.map((y) => (
                  <DropdownMenuItem key={y.id} onClick={() => selectYear(y.id)}>
                    {y.label}
                    {y.id === activeYear?.id || y.label === activeYearLabel ? " (Atual)" : ""}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {terms.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="hidden h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground data-[state=open]:bg-foreground/[0.05] md:flex"
                  >
                    <span className="truncate whitespace-nowrap">{selectedTermLabel}</span>
                    <ChevronDown className="size-3.5 shrink-0 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Período lectivo</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {terms.map((term) => (
                    <DropdownMenuItem key={term.id} onClick={() => setSelectedTermId(term.id)}>
                      {term.label}
                      {term.id === selectedTermId ? " (Actual)" : ""}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            <button
              type="button"
              onClick={() => requestOpenCommandPalette()}
              className="ml-1 hidden h-8 items-center gap-2 rounded-md border border-border/80 bg-background px-2.5 text-xs text-muted-foreground shadow-subtle transition-colors hover:border-border hover:bg-secondary/60 hover:text-foreground sm:flex md:w-56 lg:w-72"
              title="Pesquisa global e atalhos rápidos (Ctrl/⌘ K)"
            >
              <Search className="size-3.5 shrink-0" />
              <span className="truncate flex-1 text-left">Pesquisar no SIGA…</span>
              <kbd className="pointer-events-none hidden h-5 shrink-0 select-none items-center gap-0.5 rounded border border-border/70 bg-muted/60 px-1.5 font-sans text-[11px] font-medium text-muted-foreground md:inline-flex">
                ⌘K
              </kbd>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="header-icon-btn ml-auto sm:hidden"
              onClick={() => requestOpenCommandPalette()}
              aria-label="Pesquisar"
              title="Pesquisar (Ctrl/⌘ K)"
            >
              <Search className="size-[18px]" />
            </Button>

            <div className="flex items-center gap-0.5 sm:ml-auto">
              <div className="hidden sm:contents">
                <TopbarCalendar />
              </div>
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="header-icon-btn hidden sm:inline-flex"
                aria-label="Documentação e Ajuda"
                title="Documentação e Ajuda"
              >
                <a href={getSigaNavDocUrl()} target="_blank" rel="noreferrer">
                  <CircleHelp className="size-[18px]" />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="header-icon-btn hidden md:inline-flex"
                aria-label={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                title={favorited ? "Remover dos favoritos" : "Favoritar página"}
                onClick={() => {
                  toggleFavorite();
                  toast.success(
                    favorited
                      ? `«${navCurrent.label}» removido dos favoritos`
                      : `«${navCurrent.label}» nos favoritos`,
                  );
                }}
              >
                <Star className={cn("size-[18px]", favorited && "fill-warning text-warning")} />
              </Button>
              <div className="hidden sm:contents">
                <AppLauncher onOpenSettings={openSettings} />
              </div>
              <CommandPalette />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="header-icon-btn hidden sm:inline-flex"
                    aria-label="Seletor de tema"
                  >
                    {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuLabel>Tema de Apresentação</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={(e) => toggleDark(e)} className="gap-2 cursor-pointer">
                    {isDark ? (
                      <Sun className="size-4 text-warning" />
                    ) : (
                      <Moon className="size-4 text-primary" />
                    )}
                    {isDark ? "Modo Claro" : "Modo Escuro"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => openSettings("sistema.cores")}
                    className="gap-2 cursor-pointer"
                  >
                    <Palette className="size-4 text-primary" />
                    Personalizar Aparência…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                className="header-icon-btn relative"
                aria-label="Notificações"
                aria-haspopup="dialog"
                onClick={() => setNotificationsOpen(true)}
              >
                <Bell className="size-[18px]" />
                {noticeCount ? (
                  <span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive ring-2 ring-background" />
                ) : null}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="header-icon-btn hidden lg:inline-flex"
                aria-label={isFullscreen ? "Sair do ecrã inteiro" : "Ecrã inteiro"}
                onClick={toggleFullscreen}
              >
                <Maximize2 className="size-[18px]" />
              </Button>
            </div>

            <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              data-account-trigger=""
              aria-label="Abrir painel da conta"
              aria-haspopup="dialog"
              aria-expanded={accountOpen}
              className="flex shrink-0 items-center gap-2.5 rounded-md p-1 transition-colors hover:bg-foreground/[0.05] lg:pr-2"
            >
              <span className="relative">
                <UserAvatar
                  url={currentUser.avatarUrl}
                  initials={currentUser.initials}
                  className="size-8 bg-primary-soft text-xs font-semibold text-primary-strong"
                />
                {unreadCount ? (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[11px] font-bold leading-4 text-destructive-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </span>
              <span className="hidden max-w-[10rem] text-left leading-tight lg:block">
                <span className="block truncate text-xs font-medium">{currentUser.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {currentUser.role}
                </span>
              </span>
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
                  <PersonalNotificationsList open={notificationsOpen} />
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
                        <span className="block truncate text-sm font-semibold">
                          {row.full_name}
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {row.lastBody}
                        </span>
                      </span>
                    </button>
                  ))}
                  {!alerts.length && !unread.length && !personalCount ? (
                    <p className="rounded-2xl border border-border bg-secondary/40 px-4 py-5 text-sm text-muted-foreground">
                      Sem notificações novas. Candidaturas, documentos, faturas em atraso e
                      mensagens internas aparecem aqui.
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
            className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-8 pt-5 md:px-6 md:pt-6 lg:px-8 lg:pt-7 [content-visibility:auto]"
          >
            {studentCapacity.nearLimit || studentCapacity.atLimit ? (
              <div
                className={cn(
                  "mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm",
                  studentCapacity.atLimit
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-warning/30 bg-warning/10 text-warning",
                )}
              >
                <span>
                  {studentCapacity.atLimit
                    ? `Limite de alunos atingido (${studentCapacity.activeStudents}/${studentCapacity.maxStudents}).`
                    : `Quase no limite de alunos — ${studentCapacity.activeStudents}/${studentCapacity.maxStudents} (${studentCapacity.remaining} restantes).`}
                </span>
                <a
                  href={getPricingUrl()}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline-offset-2 hover:underline"
                >
                  Actualizar plano
                </a>
              </div>
            ) : null}
            {activeTenant?.status === "trial" && trialDaysLeft !== null ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
                <span>
                  Período experimental — <strong>{trialDaysLeft}</strong> dia(s) restantes.
                </span>
                <a
                  href={getPricingUrl()}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Ver planos
                </a>
              </div>
            ) : null}
            {children}
          </main>

          <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border/60 px-4 py-3 text-[11px] text-muted-foreground md:px-6 lg:px-8">
            <div className="flex items-center gap-4">
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
            <span className="hidden sm:inline">© SIGA · Sistema Integrado de Gestão Académica</span>
          </footer>
        </div>

        <Suspense fallback={null}>
          <ContextualActionsPanelHost />
        </Suspense>
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
      <button
        type="button"
        className={className}
        onClick={() => onOpenSettings(alert.settingsPanel!)}
      >
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
