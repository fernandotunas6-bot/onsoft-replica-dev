"use client"

import { Link } from "react-router-dom"
import { CheckCircle2, Circle } from "lucide-react"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getDocsUrl, getSigaLoginUrl } from "@/lib/ecosystem-urls"

const STEPS = [
  { title: "Ver planos", href: "/pricing", doneHint: "Escolher código de plano" },
  { title: "Criar escola", href: "/start", doneHint: "Wizard · trial 14 dias" },
  { title: "Ler onboarding", href: getDocsUrl("/web/onboarding-pos-criacao.html"), external: true, doneHint: "Ano lectivo e propinas" },
  { title: "Entrar no SIGA", href: getSigaLoginUrl(), external: true, doneHint: "Operação diária" },
]

export default function TasksPage() {
  return (
    <MarketingLayout
      title="Checklist: criar a escola"
      description="Passos reais do funil comercial WEB → SIGA. Não é a lista demo do template."
      eyebrow="Onboarding"
    >
      <div className="container mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tarefas</CardTitle>
            <CardDescription>Siga pela ordem — cada item abre a superfície correcta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className="flex items-start gap-3 rounded-md border px-3 py-3 text-sm"
              >
                {index === 0 ? (
                  <Circle className="mt-0.5 size-4 text-primary" />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-4 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {index + 1}. {step.title}
                  </div>
                  <p className="text-muted-foreground">{step.doneHint}</p>
                </div>
                {step.external ? (
                  <Button size="sm" variant="outline" asChild>
                    <a href={step.href} target="_blank" rel="noreferrer">
                      Abrir
                    </a>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={step.href}>Abrir</Link>
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Button asChild>
          <Link to="/start">Começar agora</Link>
        </Button>
      </div>
    </MarketingLayout>
  )
}
