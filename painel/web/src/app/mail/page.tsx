"use client"

import { useState } from "react"
import { Link } from "react-router-dom"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getDocsUrl } from "@/lib/ecosystem-urls"

export default function MailPage() {
  const [sent, setSent] = useState(false)

  return (
    <MarketingLayout
      title="Contacto comercial"
      description="Pedido de informação ou demonstração. Sem caixa de e-mail fictícia."
      eyebrow="Suporte"
    >
      <div className="container mx-auto max-w-xl space-y-6 px-4 py-10 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Escrever-nos</CardTitle>
            <CardDescription>
              Em produção ligue a Resend / CRM. Por agora, o formulário prepara o pedido e aponta
              para o DOC de suporte.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-3 text-sm">
                <p>Pedido registado neste dispositivo. A equipa responde pelo canal institucional.</p>
                <Button asChild>
                  <a href={getDocsUrl("/guide/support.html")} target="_blank" rel="noreferrer">
                    Abrir suporte (DOC)
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/start">Criar escola</Link>
                </Button>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  setSent(true)
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" name="name" required placeholder="Nome da escola ou responsável" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" name="email" type="email" required placeholder="secretaria@escola.ao" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Mensagem</Label>
                  <Textarea
                    id="message"
                    name="message"
                    required
                    rows={5}
                    placeholder="Quero uma demo / dúvida sobre planos…"
                  />
                </div>
                <Button type="submit" className="w-full">
                  Enviar pedido
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          Preferir self-service?{" "}
          <Link className="underline" to="/faqs">
            FAQ
          </Link>{" "}
          ou{" "}
          <Link className="underline" to="/start">
            criar escola
          </Link>
          .
        </p>
      </div>
    </MarketingLayout>
  )
}
