"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getWebUrl } from "@/lib/ecosystem-urls"

/** Moldura das páginas «Site»: título, ligação ao site público, sessão e erros. */
export function SitePage({
  title,
  description,
  sitePath,
  next,
  needsAuth,
  error,
  actions,
  children,
}: {
  title: string
  description: string
  sitePath: string
  next: string
  needsAuth: boolean
  error: string | null
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 lg:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={getWebUrl(sitePath)} target="_blank" rel="noreferrer" className="gap-1.5">
              Ver no site
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </Button>
          {actions}
        </div>
      </div>
      <div className="space-y-4 px-4 lg:px-6">
        {needsAuth ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Inicie sessão como administrador da plataforma, com 2FA.{" "}
              <Link href={`/sign-in?next=${next}`} className="font-medium text-primary underline">
                Entrar
              </Link>
            </CardContent>
          </Card>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  )
}
