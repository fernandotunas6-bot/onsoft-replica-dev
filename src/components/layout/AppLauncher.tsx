import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Search, Settings, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useTenant } from "@/features/saas/tenant-context";
import { canAccessPath } from "@/features/auth/access-policy";
import { AppMark } from "@/features/integrations/app-marks";
import {
  allLauncherApps,
  appsForHubSection,
  canOpenLauncherApp,
  compactLauncherSections,
  filterAccessibleApps,
  matchesLauncherQuery,
  hrefForLauncherApp,
  integrationStatusLabel,
  isIntegrationActive,
  isLauncherAppCurrent,
  launcherHubSections,
  requestIntegrationFocus,
  searchLauncherApps,
  sortIntegrationsByStatus,
  teachingBundleApps,
  type LauncherApp,
  type LauncherSectionId,
} from "@/features/integrations/launcher";
import { InstallConsentModal } from "@/features/integrations/InstallConsentModal";
import { isCatalogIntegrationId } from "@/features/integrations/catalog";
import { listInstalledCapabilities } from "@/features/integrations/server";
import { getOrCreateCalendarFeedToken } from "@/features/calendar/feed";
import { calendarIcsFeedUrl } from "@/features/calendar/ics";
import { cn } from "@/lib/utils";

function WaffleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-5", className)}>
      {[4, 10.5, 17].flatMap((y, row) =>
        [4, 10.5, 17].map((x, col) => (
          <rect
            key={`${row}-${col}`}
            x={x}
            y={y}
            width="3"
            height="3"
            rx="0.8"
            fill="currentColor"
          />
        )),
      )}
    </svg>
  );
}

function CompactTile({
  app,
  status,
  current,
  onOpen,
}: {
  app: LauncherApp;
  status?: string | undefined;
  current?: boolean;
  onOpen: (app: LauncherApp) => void;
}) {
  const active = !app.catalogId || isIntegrationActive(status);
  return (
    <button
      type="button"
      onClick={() => onOpen(app)}
      aria-current={current ? "page" : undefined}
      className={cn(
        "group flex flex-col items-center gap-1.5 rounded-xl px-1 py-1.5 text-center transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        current && "bg-primary-soft",
      )}
    >
      <span className="relative">
        <AppMark id={app.mark} className={cn("size-10 drop-shadow-sm", !active && "opacity-70")} />
        {app.catalogId ? (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-popover",
              active ? "bg-success" : "bg-muted-foreground/40",
            )}
            aria-hidden
          />
        ) : null}
      </span>
      <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground">
        {app.shortName}
      </span>
    </button>
  );
}

function HubAppRow({
  app,
  status,
  canConfigure,
  onOpen,
  onConfigure,
}: {
  app: LauncherApp;
  status?: string | undefined;
  canConfigure: boolean;
  onOpen: (app: LauncherApp) => void;
  onConfigure: (app: LauncherApp) => void;
}) {
  const active = !app.catalogId || isIntegrationActive(status);
  return (
    <div className="flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-secondary/70">
      <button
        type="button"
        onClick={() => onOpen(app)}
        className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
      >
        <AppMark id={app.mark} className="size-9 shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{app.name}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {app.description}
          </span>
          {app.catalogId ? (
            <span
              className={cn(
                "mt-1 inline-block text-[11px] font-semibold",
                status === "error"
                  ? "text-destructive"
                  : active
                    ? "text-success"
                    : "text-muted-foreground",
              )}
            >
              {integrationStatusLabel(status ?? "disconnected")}
            </span>
          ) : null}
        </span>
      </button>
      {canConfigure && app.catalogId ? (
        <button
          type="button"
          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary-soft"
          onClick={() => (active ? onConfigure(app) : onOpen(app))}
        >
          {active ? "Configurar" : "Instalar"}
        </button>
      ) : null}
    </div>
  );
}

export function AppLauncher({ onOpenSettings }: { onOpenSettings: (panelId?: string) => void }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const search = useRouterState({
    select: (r) => {
      const raw = r.location.search;
      if (typeof raw === "string") return raw;
      const tab = raw && typeof raw === "object" ? (raw as { tab?: string }).tab : undefined;
      return tab ? `tab=${tab}` : "";
    },
  });
  const currentUser = useCurrentAccount();
  const { activePlan } = useTenant();
  const canManage = canAccessPath(
    "/configuracoes",
    currentUser.role,
    currentUser.grants,
    activePlan,
  );
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [hubSection, setHubSection] = useState<LauncherSectionId>("workspace");
  const [query, setQuery] = useState("");
  const [installProvider, setInstallProvider] = useState<string | null>(null);

  const integrationsQuery = useQuery({
    queryKey: ["school", "integrations", "installed"],
    queryFn: () => listInstalledCapabilities(),
    enabled: popoverOpen || hubOpen || Boolean(installProvider),
    retry: false,
  });

  const statusByProvider = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of integrationsQuery.data ?? []) {
      map.set(item.id, item.status);
    }
    return map;
  }, [integrationsQuery.data]);

  const compactSections = useMemo(() => {
    const sections = compactLauncherSections({
      role: currentUser.role,
      grants: currentUser.grants,
      statusByProvider,
      plan: activePlan,
    });
    if (!query.trim() || hubOpen) return sections;
    return sections
      .map((section) => ({
        ...section,
        apps: section.apps.filter((app) => matchesLauncherQuery(app, query)),
      }))
      .filter((section) => section.apps.length > 0);
  }, [currentUser.role, currentUser.grants, statusByProvider, query, hubOpen, activePlan]);

  const visibleHubSections = useMemo(
    () =>
      launcherHubSections.filter(
        (section) =>
          filterAccessibleApps(
            appsForHubSection(section.id),
            currentUser.role,
            currentUser.grants,
            activePlan,
          ).length > 0,
      ),
    [currentUser.role, currentUser.grants, activePlan],
  );

  const searching = query.trim().length > 0;
  const hubApps = useMemo(() => {
    if (searching) {
      return searchLauncherApps(
        query,
        currentUser.role,
        currentUser.grants,
        statusByProvider,
        activePlan,
      );
    }
    const accessible = filterAccessibleApps(
      appsForHubSection(hubSection),
      currentUser.role,
      currentUser.grants,
      activePlan,
    );
    return hubSection === "workspace"
      ? accessible
      : sortIntegrationsByStatus(accessible, statusByProvider);
  }, [
    hubSection,
    currentUser.role,
    currentUser.grants,
    statusByProvider,
    query,
    searching,
    activePlan,
  ]);

  const bundleApps = useMemo(() => {
    if (searching || hubSection !== "academic") return [];
    return filterAccessibleApps(
      teachingBundleApps(),
      currentUser.role,
      currentUser.grants,
      activePlan,
    );
  }, [searching, hubSection, currentUser.role, currentUser.grants, activePlan]);

  const activeHub = launcherHubSections.find((section) => section.id === hubSection);

  const closeAll = () => {
    setPopoverOpen(false);
    setHubOpen(false);
    setQuery("");
  };

  const openHub = (section: LauncherSectionId = "workspace") => {
    setPopoverOpen(false);
    setHubSection(section);
    setQuery("");
    setHubOpen(true);
  };

  const configure = (app?: LauncherApp) => {
    closeAll();
    if (!canManage) {
      toast.message("Peça ao administrador para ligar esta integração.");
      return;
    }
    if (app?.catalogId) requestIntegrationFocus(app.catalogId);
    onOpenSettings(app?.target.type === "settings" ? app.target.panelId : "integracoes");
  };

  const launch = async (app: LauncherApp) => {
    if (!canOpenLauncherApp(app, currentUser.role, currentUser.grants)) {
      toast.error("Sem permissão para abrir este módulo.");
      return;
    }
    const status = app.catalogId ? statusByProvider.get(app.catalogId) : undefined;
    if (app.catalogId && !isIntegrationActive(status)) {
      if (canManage && isCatalogIntegrationId(app.catalogId)) {
        setPopoverOpen(false);
        setHubOpen(false);
        setInstallProvider(app.catalogId);
        return;
      }
      toast.message(`${app.name} ainda não está instalado.`, {
        description: "Peça ao administrador para permitir este aplicativo no SIGA.",
      });
    }
    closeAll();
    if (app.target.type === "settings") {
      if (canManage) {
        onOpenSettings(app.target.panelId);
        return;
      }
      toast.message("Esta integração é configurada pela administração.");
      return;
    }
    if (app.target.type === "ics") {
      try {
        const feed = await getOrCreateCalendarFeedToken();
        const url = calendarIcsFeedUrl(window.location.origin, feed.token);
        await navigator.clipboard.writeText(url);
        toast.success(
          app.id === "apple_calendar"
            ? "Link ICS copiado. No iPhone: Definições → Calendário → Adicionar conta."
            : "Link ICS copiado. No Google Calendar: Definições → Adicionar → Por URL.",
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível criar o feed ICS.");
      }
      void navigate({ href: "/calendario" });
      return;
    }
    void navigate({ href: hrefForLauncherApp(app) });
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="header-icon-btn"
            aria-label="Abrir aplicativos e integrações"
            title="Aplicativos e integrações"
            aria-haspopup="dialog"
            aria-expanded={popoverOpen || hubOpen}
          >
            <WaffleIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={10}
          className="w-[360px] overflow-hidden rounded-2xl border-border p-0 shadow-float"
        >
          <ScrollArea className="max-h-[min(72vh,640px)]">
            <div className="space-y-5 p-4 pb-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={hubOpen ? "" : query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Procurar Zoom, AGT, tesouraria…"
                  className="h-9 pl-9"
                  aria-label="Procurar aplicativo"
                />
              </div>
              {compactSections.length ? (
                compactSections.map((section) => (
                  <section key={section.id} aria-labelledby={`launcher-${section.id}`}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3
                        id={`launcher-${section.id}`}
                        className="text-sm font-bold text-foreground"
                      >
                        {section.label}
                      </h3>
                      <button
                        type="button"
                        className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
                        onClick={() => openHub(section.id)}
                      >
                        Ver tudo
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-x-2 gap-y-4">
                      {section.apps.map((app) => (
                        <CompactTile
                          key={app.id}
                          app={app}
                          {...(app.catalogId && statusByProvider.get(app.catalogId)
                            ? { status: statusByProvider.get(app.catalogId) }
                            : {})}
                          current={isLauncherAppCurrent(app, pathname, search)}
                          onOpen={launch}
                        />
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhum aplicativo corresponde à pesquisa.
                </p>
              )}
            </div>
          </ScrollArea>
          <div className="border-t border-border p-3">
            <Button
              className="h-10 w-full rounded-xl text-sm font-semibold"
              onClick={() => openHub()}
            >
              Ver todos os aplicativos
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog
        open={hubOpen}
        onOpenChange={(open) => {
          setHubOpen(open);
          if (!open) setQuery("");
        }}
      >
        <DialogContent className="flex max-h-[min(88vh,720px)] w-[min(920px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <div className="grid min-h-0 flex-1 md:grid-cols-[220px_1fr]">
            <aside className="border-b border-border bg-secondary/40 p-3 md:border-b-0 md:border-r md:overflow-y-auto">
              <p className="px-2 pb-2 pt-1 text-[11px] font-bold text-muted-foreground">
                Aplicativos
              </p>
              <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
                {visibleHubSections.map((section) => {
                  const active = section.id === hubSection;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setHubSection(section.id)}
                      className={cn(
                        "flex min-w-max items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                        active
                          ? "bg-primary-soft text-primary"
                          : "text-foreground hover:bg-secondary",
                      )}
                    >
                      {section.label}
                      <ChevronRight
                        className={cn("size-4 shrink-0", active ? "opacity-100" : "opacity-30")}
                      />
                    </button>
                  );
                })}
              </nav>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-6 pr-12">
                <DialogTitle className="text-2xl font-bold tracking-tight">
                  {searching ? "Resultados" : activeHub?.label}
                </DialogTitle>
                <DialogDescription className="mt-1 max-w-xl text-sm">
                  {searching
                    ? `${hubApps.length} aplicativo${hubApps.length === 1 ? "" : "s"} encontrado${hubApps.length === 1 ? "" : "s"}.`
                    : activeHub?.description}
                </DialogDescription>
                {canManage && hubSection !== "workspace" ? (
                  <button
                    type="button"
                    className="mt-1 text-sm font-medium text-primary hover:underline"
                    onClick={() => configure()}
                  >
                    Saiba mais
                  </button>
                ) : null}

                <div className="relative mt-5 max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Procurar aplicativo…"
                    className="h-9 pl-9"
                    aria-label="Procurar aplicativo"
                  />
                </div>

                <div className="mt-5 grid gap-1 sm:grid-cols-2">
                  {hubApps.length ? (
                    hubApps.map((app) => (
                      <HubAppRow
                        key={app.id}
                        app={app}
                        {...(app.catalogId && statusByProvider.get(app.catalogId)
                          ? { status: statusByProvider.get(app.catalogId) }
                          : {})}
                        canConfigure={canManage}
                        onOpen={launch}
                        onConfigure={(target) => configure(target)}
                      />
                    ))
                  ) : (
                    <p className="col-span-full rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      {searching
                        ? "Nenhum aplicativo corresponde à pesquisa."
                        : "Nenhum aplicativo neste grupo."}
                    </p>
                  )}
                </div>

                {bundleApps.length ? (
                  <div className="mt-8 rounded-2xl border border-border bg-secondary/30 p-4">
                    <p className="text-sm font-bold">Pacote de ensino</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      LMS e originalidade ligados à área pedagógica.
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {bundleApps.map((app) => (
                        <button
                          key={app.id}
                          type="button"
                          onClick={() => launch(app)}
                          className="flex flex-col items-center gap-2 rounded-xl p-2 text-center transition-colors hover:bg-background"
                        >
                          <AppMark id={app.mark} className="size-9" />
                          <span className="text-[11px] font-medium">{app.shortName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <footer className="grid gap-3 border-t border-border bg-primary-soft/60 px-6 py-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="flex items-center gap-3 rounded-xl px-1 py-1 text-left transition-colors hover:bg-background/60"
                  onClick={() => configure()}
                >
                  <SlidersHorizontal className="size-5 text-primary" />
                  <span>
                    <span className="block text-sm font-semibold">Configurar integrações</span>
                    <span className="block text-xs text-muted-foreground">
                      Chaves, webhooks e estado de cada canal
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-3 rounded-xl px-1 py-1 text-left transition-colors hover:bg-background/60"
                  onClick={() => {
                    closeAll();
                    if (canManage) onOpenSettings("escola");
                    else toast.message("Peça acesso ao administrador da escola.");
                  }}
                >
                  <Settings className="size-5 text-primary" />
                  <span>
                    <span className="block text-sm font-semibold">Definições do sistema</span>
                    <span className="block text-xs text-muted-foreground">
                      Identidade da escola, cobrança e segurança
                    </span>
                  </span>
                </button>
              </footer>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <InstallConsentModal
        provider={installProvider}
        open={Boolean(installProvider)}
        onOpenChange={(open) => {
          if (!open) setInstallProvider(null);
        }}
        onInstalled={(provider) => {
          const app = allLauncherApps().find((item) => item.catalogId === provider);
          if (app) void navigate({ href: hrefForLauncherApp(app) });
        }}
      />
    </>
  );
}
