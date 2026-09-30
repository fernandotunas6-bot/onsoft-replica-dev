"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { MessageCircle, RefreshCw, UserPlus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { fetchSignupLeads, type SignupLeadRow, type SignupLeadsResult } from "@/lib/saas-api"

async function accessToken(): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return undefined
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}

type Filter = "followup" | "all" | "completed"

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-AO", { dateStyle: "short", timeStyle: "short" }) : "—"
}

function whatsappLink(phone: string | null, lead: SignupLeadRow) {
  const digits = (phone ?? "").replace(/\D/g, "")
  if (digits.length < 9) return null
  const number = digits.length === 9 ? `244${digits}` : digits
  const text = encodeURIComponent(
    `Olá${lead.contactName ? `, ${lead.contactName.split(" ")[0]}` : ""}. Vimos que começou a registar ${lead.schoolName || "a sua escola"} no SIGA Plus. Podemos ajudar a concluir?`,
  )
  return `https://wa.me/${number}?text=${text}`
}

/**
 * Quem começa o registo de uma escola no WEB e não o conclui. Até à confirmação
 * do e-mail só há o passo atingido (sem dados pessoais); depois, há contacto e o
 * SIGA envia até três lembretes automáticos (1, 3 e 7 dias sem actividade).
 */
export default function SignupsPage() {
  const [result, setResult] = useState<SignupLeadsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [filter, setFilter] = useState<Filter>("followup")
  const [days, setDays] = useState(30)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const token = await accessToken()
    const response = await fetchSignupLeads(token, days)
    if (!token || response.error?.includes("Unauthorized") || response.error?.includes("Sem permissão")) {
      setNeedsAuth(true)
      setLoading(false)
      return
    }
    setNeedsAuth(false)
    if (!response.ok || !response.data) setError(response.error || "Falha ao carregar os registos.")
    else setResult(response.data)
    setLoading(false)
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => {
    const leads = result?.leads ?? []
    if (filter === "completed") return leads.filter((l) => l.completedAt)
    if (filter === "followup") return leads.filter((l) => !l.completedAt && l.email)
    return leads
  }, [result, filter])

  const maxReached = Math.max(1, ...(result?.funnel.map((f) => f.reached) ?? [1]))
  const conversion = result && result.started ? Math.round((result.completed / result.started) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-4 sm:flex-row sm:items-end sm:justify-between lg:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registos de escolas</h1>
          <p className="text-muted-foreground">
            Quem começou a criar uma escola no site, até onde chegou, e quem precisa de ajuda para concluir.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Período"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="size-4" />
            Actualizar
          </Button>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        {needsAuth ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Inicie sessão como administrador da plataforma.{" "}
              <Link href="/sign-in?next=/signups" className="font-medium text-primary underline">
                Entrar
              </Link>
            </CardContent>
          </Card>
        ) : null}
        {error ? (
          <p role="alert" className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {result ? (
          <Card className="mb-4">
            <CardContent className="grid gap-4 pt-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
              <div className="grid content-start gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Registos iniciados</p>
                  <p className="text-2xl font-semibold">{result.started}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Escolas criadas</p>
                  <p className="text-2xl font-semibold">
                    {result.completed} <span className="text-sm font-normal text-muted-foreground">({conversion}%)</span>
                  </p>
                </div>
              </div>
              <div>
                <h2 className="mb-2 text-sm font-medium">Até onde chegam</h2>
                <ol className="grid gap-1.5">
                  {result.funnel.map((step) => (
                    <li key={step.step} className="grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {step.step}. {step.label}
                      </span>
                      <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${(step.reached / maxReached) * 100}%` }}
                        />
                      </span>
                      <span className="text-right tabular-nums">{step.reached}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filtro">
          {(
            [
              ["followup", "Por concluir, com contacto"],
              ["completed", "Concluídos"],
              ["all", "Todos"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? "default" : "outline"}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Escola</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Parou em</TableHead>
                  <TableHead>Lembretes</TableHead>
                  <TableHead>Última actividade</TableHead>
                  <TableHead className="text-right">Acção</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      A carregar…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <UserPlus className="size-4" /> Nenhum registo neste filtro.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((lead) => {
                    const wa = whatsappLink(lead.contactPhone, lead)
                    return (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <div>{lead.schoolName || "—"}</div>
                          {lead.planCode ? <div className="text-xs text-muted-foreground">{lead.planCode}</div> : null}
                        </TableCell>
                        <TableCell>
                          {lead.email ? (
                            <>
                              <div>{lead.contactName || "—"}</div>
                              <div className="text-xs text-muted-foreground">{lead.email}</div>
                              {lead.contactPhone ? (
                                <div className="text-xs text-muted-foreground">{lead.contactPhone}</div>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">E-mail por confirmar</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {lead.completedAt ? (
                            <Badge variant="secondary">Escola criada</Badge>
                          ) : (
                            <span>
                              {lead.lastStep}. {lead.lastStepLabel}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {lead.unsubscribedAt ? (
                            <span className="text-xs text-muted-foreground">Pediu para não receber</span>
                          ) : (
                            <span className="text-xs">
                              {lead.reminderCount}/3
                              {lead.lastReminderAt ? ` · ${formatDate(lead.lastReminderAt)}` : ""}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(lead.updatedAt)}</TableCell>
                        <TableCell className="text-right">
                          {!lead.completedAt && lead.email ? (
                            <div className="flex justify-end gap-2">
                              {wa ? (
                                <Button asChild size="sm" variant="outline">
                                  <a href={wa} target="_blank" rel="noreferrer">
                                    <MessageCircle className="size-4" /> WhatsApp
                                  </a>
                                </Button>
                              ) : null}
                              <Button asChild size="sm" variant="outline">
                                <a
                                  href={`mailto:${lead.email}?subject=${encodeURIComponent("Registo da sua escola no SIGA Plus")}`}
                                >
                                  E-mail
                                </a>
                              </Button>
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
