"use client"

import { Link } from "react-router-dom"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getDocsUrl, getSigaUrl } from "@/lib/ecosystem-urls"

export default function CalendarPage() {
  return (
    <MarketingLayout
      title="Calendário lectivo no SIGA"
      description="Períodos, ICS móvel e horários vivem na app escolar — aqui explicamos o valor."
      eyebrow="Produto"
    >
      <div className="container mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que a escola configura</CardTitle>
            <CardDescription>
              Trimestres / termos, feriados e sync ICS para professores — módulo Calendário no SIGA.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={getSigaUrl("/calendario")} target="_blank" rel="noreferrer">
                Abrir calendário (SIGA)
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={getDocsUrl("/siga/navegacao.html")} target="_blank" rel="noreferrer">
                Mapa de navegação (DOC)
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ainda sem escola?</CardTitle>
            <CardDescription>Crie o tenant no wizard e configure o ano lectivo no onboarding.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/start">Criar escola</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/dashboard">Área do visitante</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </MarketingLayout>
  )
}
