"use client"

import * as React from "react"
import { lazy, Suspense } from "react"
import { LandingNavbar } from "@/app/landing/components/navbar"
import { MarketingPageHeader } from "@/components/marketing/marketing-page-header"
import { SHOW_THEME_CUSTOMIZER } from "@/lib/feature-flags"
import { cn } from "@/lib/utils"

const LandingFooter = lazy(() =>
  import("@/app/landing/components/footer").then((m) => ({ default: m.LandingFooter })),
)
const LandingThemeCustomizer = lazy(() =>
  import("@/app/landing/components/landing-theme-customizer").then((m) => ({
    default: m.LandingThemeCustomizer,
  })),
)
const LandingThemeCustomizerTrigger = lazy(() =>
  import("@/app/landing/components/landing-theme-customizer").then((m) => ({
    default: m.LandingThemeCustomizerTrigger,
  })),
)

export interface MarketingLayoutProps {
  children: React.ReactNode
  title?: string
  description?: string
  eyebrow?: string
  /** default: página com header; fullBleed: landing (sem header); auth: só main centrado */
  variant?: "default" | "fullBleed" | "auth"
  showFooter?: boolean
  mainClassName?: string
}

export function MarketingLayout({
  children,
  title,
  description,
  eyebrow,
  variant = "default",
  showFooter = true,
  mainClassName,
}: MarketingLayoutProps) {
  const [themeCustomizerOpen, setThemeCustomizerOpen] = React.useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingNavbar />

      <main className={cn("flex flex-1 flex-col", mainClassName)}>
        {variant === "default" && title ? (
          <MarketingPageHeader title={title} description={description} eyebrow={eyebrow} />
        ) : null}
        {children}
      </main>

      {showFooter ? (
        <Suspense fallback={null}>
          <LandingFooter />
        </Suspense>
      ) : null}

      {SHOW_THEME_CUSTOMIZER && variant !== "auth" ? (
        <Suspense fallback={null}>
          <LandingThemeCustomizerTrigger onClick={() => setThemeCustomizerOpen(true)} />
          <LandingThemeCustomizer
            open={themeCustomizerOpen}
            onOpenChange={setThemeCustomizerOpen}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
