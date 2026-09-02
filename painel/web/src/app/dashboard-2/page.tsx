"use client"

import { Link } from "react-router-dom"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getDocsUrl, getSigaUrl } from "@/lib/ecosystem-urls"

const MODULES = [
  { title: "Matrícula pública", desc: "Campanha e candidaturas", href: getDocsUrl("/siga/navegacao.html") },
  { title: "Área pedagógica", desc: "Turmas, pautas, horários", href: getDocsUrl("/guide/features.html") },
  { title: "Tesouraria", desc: "Faturas, Multicaixa, SAFT", href: getDocsUrl("/financeiro/saft-agt-exportacao.html") },
  { title: "Arquivos", desc: "Biblioteca estilo Moodle", href: getDocsUrl("/siga/navegacao.html") },
  { title: "Catracas", desc: "Cartão virtual e acesso", href: getDocsUrl("/siga/navegacao.html") },
  { title: "Integrações", desc: "EMIS, Unitel, WhatsApp", href: getDocsUrl("/integracoes/") },
]

export default function Dashboard2Page() {
  return (
    <MarketingLayout
      title="O que a escola ganha"
      description="Mapa rápido dos módulos SIGA Plus — operação real depois do trial."
      eyebrow="Produto"
    >
      <div className="container mx-auto space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/start">Criar escola</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/pricing">Planos</Link>
          </Button>
          <Button variant="ghost" asChild>
            <a href={getSigaUrl("/")} target="_blank" rel="noreferrer">
              Ver SIGA
            </a>
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((mod) => (
            <Card key={mod.title}>
              <CardHeader>
                <CardTitle className="text-base">{mod.title}</CardTitle>
                <CardDescription>{mod.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" asChild>
                  <a href={mod.href} target="_blank" rel="noreferrer">
                    Ler no DOC
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </MarketingLayout>
  )
}
