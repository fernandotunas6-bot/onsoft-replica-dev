"use client"

import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { MarketingAuthShell } from "@/components/marketing/marketing-auth-shell"

interface MarketingErrorPageProps {
  code: string
  title: string
  description: string
}

export function MarketingErrorPage({ code, title, description }: MarketingErrorPageProps) {
  return (
    <MarketingLayout variant="auth" showFooter>
      <MarketingAuthShell maxWidth="lg">
        <div className="text-center">
          <p className="text-sm font-medium text-primary">{code}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-4 text-muted-foreground">{description}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild className="cursor-pointer">
              <Link to="/">Voltar à página inicial</Link>
            </Button>
            <Button variant="outline" asChild className="cursor-pointer">
              <Link to="/#contact">Contacte-nos</Link>
            </Button>
          </div>
        </div>
      </MarketingAuthShell>
    </MarketingLayout>
  )
}
