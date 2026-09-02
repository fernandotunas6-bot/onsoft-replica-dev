"use client"

import { Link } from "react-router-dom"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getDocsUrl, getSigaLoginUrl } from "@/lib/ecosystem-urls"

const CHANNELS = [
  {
    title: "Documentação",
    desc: "Manuais WEB, ADMIN, SIGA e integrações",
    href: getDocsUrl("/guide/"),
  },
  {
    title: "FAQ comercial",
    desc: "Perguntas frequentes do portal",
    href: "/faqs",
    internal: true,
  },
  {
    title: "Contacto",
    desc: "Pedido de demo ou informação",
    href: "/mail",
    internal: true,
  },
  {
    title: "Já sou cliente",
    desc: "Entrar na escola (SIGA)",
    href: getSigaLoginUrl(),
  },
]

export default function ChatPage() {
  return (
    <MarketingLayout
      title="Ajuda e canais"
      description="Mesa de ajuda do portal — DOC e contacto reais, não chat demo."
      eyebrow="Suporte"
    >
      <div className="container mx-auto max-w-2xl space-y-4 px-4 py-10 sm:px-6">
        {CHANNELS.map((ch) => (
          <Card key={ch.title}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">{ch.title}</CardTitle>
                <CardDescription>{ch.desc}</CardDescription>
              </div>
              {ch.internal ? (
                <Button size="sm" asChild>
                  <Link to={ch.href}>Abrir</Link>
                </Button>
              ) : (
                <Button size="sm" asChild>
                  <a href={ch.href} target="_blank" rel="noreferrer">
                    Abrir
                  </a>
                </Button>
              )}
            </CardHeader>
          </Card>
        ))}

        <Card>
          <CardContent className="flex flex-wrap gap-2 py-6">
            <Button asChild>
              <Link to="/start">Criar escola</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/pricing">Ver planos</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </MarketingLayout>
  )
}
