"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { PlatformAdminGate } from "@/components/platform-admin-gate";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ThemeCustomizerTrigger } from "@/components/theme-customizer";
import { DynamicThemeCustomizer } from "@/components/dynamic-imports";
import {
  SHOW_THEME_CUSTOMIZER,
  SHOW_UPGRADE_BUTTON,
  isPlatformRoute,
} from "@/lib/feature-flags";
import { UpgradeToProButton } from "@/components/upgrade-to-pro-button";
import { useSidebarConfig } from "@/hooks/use-sidebar-config";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [themeCustomizerOpen, setThemeCustomizerOpen] = React.useState(false);
  const { config } = useSidebarConfig();
  const pathname = usePathname();
  // A exportação Pages é estática: proteger também a moldura do painel no
  // cliente evita expor navegação administrativa antes da confirmação remota.
  const needsGate = isPlatformRoute(pathname);

  const dashboard = (
    <SidebarProvider
      style={{
        "--sidebar-width": "16rem",
        "--sidebar-width-icon": "3rem",
        "--header-height": "calc(var(--spacing) * 14)",
      } as React.CSSProperties}
      className={config.collapsible === "none" ? "sidebar-none-mode" : ""}
    >
      {config.side === "left" ? (
        <>
          <AppSidebar
            variant={config.variant}
            collapsible={config.collapsible}
            side={config.side}
          />
          <SidebarInset>
            <SiteHeader />
            <div className="flex flex-1 flex-col">
              <div className="@container/main flex flex-1 flex-col gap-2">
                <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                  {children}
                </div>
              </div>
            </div>
            <SiteFooter />
          </SidebarInset>
        </>
      ) : (
        <>
          <SidebarInset>
            <SiteHeader />
            <div className="flex flex-1 flex-col">
              <div className="@container/main flex flex-1 flex-col gap-2">
                <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                  {children}
                </div>
              </div>
            </div>
            <SiteFooter />
          </SidebarInset>
          <AppSidebar
            variant={config.variant}
            collapsible={config.collapsible}
            side={config.side}
          />
        </>
      )}

      {SHOW_THEME_CUSTOMIZER ? (
        <>
          <ThemeCustomizerTrigger onClick={() => setThemeCustomizerOpen(true)} />
          {themeCustomizerOpen ? (
            <DynamicThemeCustomizer
              open={themeCustomizerOpen}
              onOpenChange={setThemeCustomizerOpen}
            />
          ) : null}
        </>
      ) : null}
      {SHOW_UPGRADE_BUTTON ? <UpgradeToProButton /> : null}
    </SidebarProvider>
  );

  return needsGate ? <PlatformAdminGate>{dashboard}</PlatformAdminGate> : dashboard;
}
