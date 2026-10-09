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
import { DesktopNotifications } from "./DesktopNotifications";
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
import { requestOpenConversation } from "@/features/messages/unread";
import { useSchoolAlerts } from "@/features/dashboard/use-school-alerts";
import {
  BottomNavigation,
  MobileHeader,
  MoreHub,
  OfflineBanner,
  SchoolSwitcherSheet,
} from "@/components/mobile";
import type { SchoolAlert } from "@/features/dashboard/alerts";

const COLLAPSE_KEY = "siga:sidebar-collapsed";
const SettingsCenter = lazy(() =>
  import("@/components/modals/SettingsCenter").then(({ SettingsCenter }) => ({
    default: SettingsCenter,
  })),
);
// A coluna da direita passou a ter dois separadores (Relacionado e Mensagens):
// o painel contextual deixou de ser o dono do espaço e vive dentro da RightRail.
const RightRail = lazy(() =>
  import("@/components/layout/RightRail").then(({ RightRail }) => ({ default: RightRail })),
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
  /*
   * Shell mobile (§7). O telemóvel não usa a barra lateral do computador: tem
   * header próprio, barra inferior e o hub "Mais". Estes três estados são o que
   * a barra inferior e o header abrem.
   */
  const [moreOpen, setMoreOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

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
    // As folhas mobile têm de fechar na navegação: um toque no hub "Mais"
    // navega, e sem isto a folha ficava aberta por cima da página nova.
    setMoreOpen(false);
    setContextOpen(false);
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
    <div className="flex flex-col min-h-screen bg-background">
      <OfflineBanner />
      <DesktopNotifications />
      <div className="flex flex-1 min-h-0">
        <a href="#conteudo-principal" className="skip-link">
          Saltar para o conteúdo principal
        </a>

        <div
          className="sticky top-0 z-40 hidden h-screen lg:block lg:py-2 lg:pl-2"
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

        <div className="flex min-w-0 flex-1 flex-col lg:my-2 lg:mx-2 lg:overflow-clip lg:rounded-2xl lg:border lg:border-border/60 lg:shadow-sm">
          {/*
              Header mobile (§10): substitui o header de computador abaixo de
              1024px. O de computador continua igual — os dez controlos do topo
              não cabem num telemóvel e nenhum deles é o que se vem fazer.
          */}
          <MobileHeader
            title={navCurrent.label}
            noticeCount={noticeCount}
            onOpenContext={() => setContextOpen(true)}
            onOpenSearch={() => requestOpenCommandPalette()}
            onOpenNotifications={() => setNotificationsOpen(true)}
            onOpenAccount={() => setAccountOpen(true)}
          />

          <header className="sticky top-0 z-30 hidden h-14 items-center gap-2.5 border-b border-border/70 bg-background/95 backdrop-blur-xs px-5 lg:flex">
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
                  className="flex min-w-0 max-w-[min(100%,18rem)] items-center gap-1.5 rounded-lg border border-border/80 bg-secondary/50 px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:border-primary/40"
                >
                  <span className="hidden truncate text-muted-foreground sm:inline">
                    {school?.name ? `${school.name} · ` : ""}
                  </span>
                  <span className="truncate whitespace-nowrap font-semibold">
                    {selectedYearLabel}
                    {selectedYearId && selectedYearId === activeYear?.id ? " (Atual)" : ""}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0 opacity-60" />
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
                    className="hidden min-w-0 items-center gap-1.5 rounded-lg border border-border/80 bg-secondary/50 px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:border-primary/40 md:flex"
                  >
                    <span className="truncate whitespace-nowrap">{selectedTermLabel}</span>
                    <ChevronDown className="size-3.5 shrink-0 opacity-60" />
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
              className="hidden sm:flex items-center gap-2.5 rounded-lg border border-border/80 bg-secondary/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary/70 hover:text-foreground md:w-56 lg:w-72"
              title="Pesquisa global e atalhos rápidos (Ctrl/⌘ K)"
            >
              <Search className="size-3.5 opacity-60 shrink-0" />
              <span className="truncate flex-1 text-left">Pesquisar no SIGA…</span>
              <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border border-border/80 bg-muted/70 px-1 font-mono text-[11px] font-medium text-muted-foreground shrink-0">
                <span className="text-[11px]">⌘</span>K
              </kbd>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="header-icon-btn sm:hidden"
              onClick={() => requestOpenCommandPalette()}
              aria-label="Pesquisar"
              title="Pesquisar (Ctrl/⌘ K)"
            >
              <Search className="size-5" />
            </Button>

            <div className="ml-auto flex items-center gap-1">
              <TopbarCalendar />
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="header-icon-btn hidden sm:inline-flex"
                aria-label="Documentação e Ajuda"
                title="Documentação e Ajuda"
              >
                <a href={getSigaNavDocUrl()} target="_blank" rel="noreferrer">
                  <CircleHelp className="size-5 text-muted-foreground hover:text-foreground" />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="header-icon-btn"
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
                <Star
                  className={cn(
                    "size-5",
                    favorited ? "fill-warning text-warning" : "text-muted-foreground",
                  )}
                />
              </Button>
              <AppLauncher onOpenSettings={openSettings} />
              <CommandPalette />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="header-icon-btn"
                    aria-label="Seletor de tema"
                  >
                    {isDark ? (
                      <Sun className="size-5 text-warning" />
                    ) : (
                      <Moon className="size-5 text-primary" />
                    )}
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
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[11px] font-bold leading-4 text-destructive-foreground">
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
                      key={row.conversationId}
                      type="button"
                      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-secondary/40 px-3 py-3 text-left transition-colors hover:bg-secondary"
                      onClick={() => {
                        setNotificationsOpen(false);
                        requestOpenConversation(row.conversationId);
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
            className="page-enter mx-auto w-full max-w-[1400px] flex-1 px-4 py-4 pb-bottom-nav md:px-5 md:pt-5 lg:px-6 lg:py-5 lg:pb-5 [content-visibility:auto]"
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

          {/* O rodapé institucional é ruído num ecrã de 360px: as duas ligações
              legais vivem no hub "Mais" e o crédito não precisa de estar em todos
              os ecrãs. */}
          <footer className="hidden flex-wrap items-center justify-between gap-3 border-t border-border bg-card/40 px-3.5 py-3 text-xs text-muted-foreground backdrop-blur-xs md:flex md:px-5">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-2 font-semibold text-foreground">
                <span className="inline-flex size-6 items-center justify-center rounded-lg bg-primary-soft text-[11px] font-extrabold text-primary">
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

        <Suspense fallback={null}>
          <RightRail />
        </Suspense>

        <BottomNavigation onOpenMore={() => setMoreOpen(true)} />
        <MoreHub open={moreOpen} onOpenChange={setMoreOpen} onOpenSettings={() => openSettings()} />
        <SchoolSwitcherSheet open={contextOpen} onOpenChange={setContextOpen} />
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
