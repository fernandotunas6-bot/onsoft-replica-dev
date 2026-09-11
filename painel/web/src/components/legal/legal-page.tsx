"use client"

import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { MarketingLayout } from "@/components/layouts/marketing-layout"

export function LegalPage({
  title,
  description,
  eyebrow,
  lastUpdated,
  draftNotice,
  children,
}: {
  title: string
  description: string
  eyebrow: string
  lastUpdated: string
  draftNotice?: string
  children: ReactNode
}) {
  return (
    <MarketingLayout title={title} description={description} eyebrow={eyebrow}>
      <div className="container mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {draftNotice ? (
          <div className="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
            {draftNotice}
          </div>
        ) : null}
        <p className="mb-8 text-sm text-muted-foreground">Última actualização: {lastUpdated}</p>
        <Card>
          <CardContent className="space-y-8 py-8">{children}</CardContent>
        </Card>
      </div>
    </MarketingLayout>
  )
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-24">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}
