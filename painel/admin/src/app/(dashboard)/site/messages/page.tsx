"use client"

import { useCallback, useEffect, useState } from "react"
import { Archive, Check, Mail, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SitePage } from "@/components/site/site-page"
import { formatDate, siteApi, type ContactMessageRow, type ContactStatus } from "@/lib/site-api"

const TABS: { value: ContactStatus; label: string }[] = [
  { value: "new", label: "Por responder" },
  { value: "answered", label: "Respondidas" },
  { value: "archived", label: "Arquivadas" },
]

function replyHref(message: ContactMessageRow) {
  const subject = encodeURIComponent(`Re: ${message.subject}`)
  const quoted = message.message
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
  const body = encodeURIComponent(`Olá ${message.name},\n\n\n\n${quoted}`)
  return `mailto:${message.email}?subject=${subject}&body=${body}`
}

export default function SiteMessagesPage() {
  const [tab, setTab] = useState<ContactStatus>("new")
  const [messages, setMessages] = useState<ContactMessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)

  const load = useCallback(async (status: ContactStatus) => {
    setLoading(true)
    const result = await siteApi.messages(status)
    setLoading(false)
    if (!result.ok) {
      setNeedsAuth(result.needsAuth)
      setError(result.needsAuth ? null : result.error)
      return
    }
    setNeedsAuth(false)
    setError(null)
    setMessages(result.data.messages)
  }, [])

  useEffect(() => {
    void load(tab)
  }, [load, tab])

  async function move(message: ContactMessageRow, status: ContactStatus) {
    const result = await siteApi.setMessageStatus(message.id, status)
    if (!result.ok) setError(result.error)
    await load(tab)
  }

  return (
    <SitePage
      title="Mensagens do site"
      description="O que as escolas escrevem no formulário de contacto do site. Responda por e-mail e marque como respondida."
      sitePath="/#contact"
      next="/site/messages"
      needsAuth={needsAuth}
      error={error}
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as ContactStatus)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : messages.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Nenhuma mensagem aqui.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {messages.map((message) => (
            <Card key={message.id}>
              <CardHeader className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{message.subject}</CardTitle>
                  <span className="text-xs text-muted-foreground">{formatDate(message.createdAt)}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {message.name}
                  {message.school ? ` · ${message.school}` : ""} ·{" "}
                  <a href={`mailto:${message.email}`} className="text-primary hover:underline">
                    {message.email}
                  </a>
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-wrap text-sm">{message.message}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" className="gap-1.5" asChild>
                    <a href={replyHref(message)}>
                      <Mail className="size-4" aria-hidden="true" />
                      Responder
                    </a>
                  </Button>
                  {message.status !== "answered" ? (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void move(message, "answered")}>
                      <Check className="size-4" aria-hidden="true" />
                      Marcar respondida
                    </Button>
                  ) : null}
                  {message.status !== "archived" ? (
                    <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => void move(message, "archived")}>
                      <Archive className="size-4" aria-hidden="true" />
                      Arquivar
                    </Button>
                  ) : null}
                  {message.status !== "new" ? (
                    <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => void move(message, "new")}>
                      <RotateCcw className="size-4" aria-hidden="true" />
                      Voltar a «por responder»
                    </Button>
                  ) : null}
                  {message.handledAt ? (
                    <Badge variant="secondary">Tratada {formatDate(message.handledAt)}</Badge>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </SitePage>
  )
}
