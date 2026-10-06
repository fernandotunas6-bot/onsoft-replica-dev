import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { applyPendingUpdate, registerServiceWorker, SW_UPDATE_READY_EVENT } from "@/lib/pwa";
import { measureVitals } from "@/lib/vitals";

import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AppearanceProvider } from "@/lib/appearance";
import { AuthGate } from "@/components/auth/AuthGate";
import { RouteAccessGate } from "@/components/auth/RouteAccessGate";
import { SchoolYearProvider } from "@/features/auth/use-school-settings";
import { SchoolBrandAppearanceSync } from "@/components/layout/SchoolBrandAppearanceSync";
import { EntityFocusProvider } from "@/features/intelligence/entity-focus-context";
import { isPublicAppPath } from "@/lib/public-paths";
import { RouteErrorScreen } from "@/components/error/RouteErrorScreen";
import { TenantProvider } from "@/features/saas/tenant-context";
import { PageLoading } from "@/components/ui/page-loading";
import { readSessionHint } from "@/features/auth/session-hint";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  return <RouteErrorScreen error={error} reset={reset} fullPage />;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Portal de Gestão Escolar" },
      {
        name: "description",
        content:
          "Plataforma integrada de gestão escolar: estudantes, turmas, secretaria académica, contabilidade e relatórios.",
      },
      { property: "og:title", content: "Portal de Gestão Escolar" },
      {
        property: "og:description",
        content:
          "Plataforma integrada de gestão escolar: estudantes, turmas, secretaria académica, contabilidade e relatórios.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#F8F8FA" },
      { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#0F172A" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "SIGA Plus" },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Inter servida pelo próprio SIGA (ver @font-face em styles.css).
      {
        rel: "preload",
        href: "/fonts/inter/inter-latin.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  // Pista de sessão para o SSR desenhar logo o ecrã de entrada (ver session-hint.ts).
  loader: async () => ({ sessionHint: await readSessionHint() }),
  shellComponent: RootShell,
  component: RootComponent,
  pendingComponent: () => <PageLoading />,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { DesktopIntegration } from "@/components/layout/DesktopIntegration";
import { DesktopVaultGate } from "@/components/layout/DesktopVaultGate";
import { areaToneForPath } from "@/lib/area-tone";

function ClientOnlyToaster() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated ? <Toaster position="top-right" richColors /> : null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { sessionHint } = Route.useLoaderData();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isPublic = isPublicAppPath(pathname);

  useEffect(() => {
    let slowNotified = false;
    measureVitals((inpMs) => {
      if (slowNotified || inpMs < 200) return;
      slowNotified = true;
      if (import.meta.env.DEV) {
        toast.message("Toque lento detectado", {
          description: `${inpMs} ms — abra Definições → Desempenho para detalhes.`,
        });
      }
    });
    registerServiceWorker();

    const onUpdateReady = () => {
      toast.message("Há uma versão nova do SIGA Plus", {
        description: "As suas alterações em curso não se perdem — actualize quando quiser.",
        duration: Infinity,
        action: {
          label: "Actualizar",
          onClick: applyPendingUpdate,
        },
      });
    };
    window.addEventListener(SW_UPDATE_READY_EVENT, onUpdateReady);
    return () => window.removeEventListener(SW_UPDATE_READY_EVENT, onUpdateReady);
  }, []);

  // Tom visual da área (Pedagógica, Financeiro…) em <html data-tone>: o brilho
  // dos cabeçalhos e o texto em gradiente leem-no em CSS. Depois de montar,
  // para não haver diferença entre o HTML do servidor e o do navegador.
  useEffect(() => {
    document.documentElement.dataset.tone = areaToneForPath(pathname);
  }, [pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <AppearanceProvider>
          <DesktopIntegration />
          <DesktopVaultGate />
          <div className="relative pt-[env(safe-area-inset-top,0)] flex min-h-screen flex-col">
            {isPublic ? (
              <Outlet />
            ) : (
              <AuthGate sessionHint={sessionHint}>
                <SchoolYearProvider>
                  <SchoolBrandAppearanceSync />
                  <EntityFocusProvider>
                    <RouteAccessGate>
                      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
                      <Outlet />
                    </RouteAccessGate>
                  </EntityFocusProvider>
                </SchoolYearProvider>
              </AuthGate>
            )}
          </div>
          <ClientOnlyToaster />
        </AppearanceProvider>
      </TenantProvider>
    </QueryClientProvider>
  );
}
