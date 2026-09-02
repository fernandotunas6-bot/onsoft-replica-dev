import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { registerServiceWorker } from "@/lib/pwa";
import { measureVitals } from "@/lib/vitals";

import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AppearanceProvider } from "@/lib/appearance";
import { AuthGate } from "@/components/auth/AuthGate";
import { RouteAccessGate } from "@/components/auth/RouteAccessGate";
import { SchoolYearProvider } from "@/features/auth/use-school-settings";
import { EntityFocusProvider } from "@/features/intelligence/entity-focus-context";
import { isPublicAppPath } from "@/lib/public-paths";
import { RouteErrorScreen } from "@/components/error/RouteErrorScreen";
import { TenantProvider } from "@/features/saas/tenant-context";
import { PageLoading } from "@/components/ui/page-loading";

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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
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

import { TauriTitlebar } from "@/components/TauriTitlebar";

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
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
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <AppearanceProvider>
          <TauriTitlebar />
          <div className="relative pt-[env(safe-area-inset-top,0)] flex min-h-screen flex-col">
            {isPublic ? (
              <Outlet />
            ) : (
              <AuthGate>
                <SchoolYearProvider>
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
          <Toaster position="top-right" richColors />
        </AppearanceProvider>
      </TenantProvider>
    </QueryClientProvider>
  );
}
