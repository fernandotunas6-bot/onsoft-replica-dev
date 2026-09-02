"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Receipt, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { fetchSaasSubscriptions, backfillSaasSubscriptions, type SubscriptionRow } from "@/lib/saas-api"

async function accessToken(): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return undefined
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-AO", { dateStyle: "short" })
}

function statusVariant(status: SubscriptionRow["status"]) {
  if (status === "active") return "secondary" as const
  if (status === "trialing") return "outline" as const
  if (status === "past_due" || status === "unpaid") return "destructive" as const
  return "outline" as const
}

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [filterSlug, setFilterSlug] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const token = await accessToken()
    const result = await fetchSaasSubscriptions(token)
    if (!token || result.error?.includes("Unauthorized") || result.error?.includes("Sem permissão")) {
      setNeedsAuth(true)
      setSubscriptions([])
      setLoading(false)
      return
    }
    setNeedsAuth(false)
    if (!result.ok) {
      setError(result.error || "Falha ao carregar subscrições.")
      setLoading(false)
      return
    }
    setSubscriptions(result.subscriptions ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    if (typeof window !== "undefined") {
      const slug = new URLSearchParams(window.location.search).get("tenant")
      if (slug) setFilterSlug(slug)
    }
  }, [load])

  const filtered = useMemo(() => {
    if (!filterSlug.trim()) return subscriptions
    return subscriptions.filter((row) => row.tenant_slug === filterSlug.trim())
  }, [subscriptions, filterSlug])

  async function handleBackfill() {
    setBackfilling(true)
    setError(null)
    setBackfillMessage(null)
    const token = await accessToken()
    const result = await backfillSaasSubscriptions(token)
    if (!result.ok) {
      setError(result.error || "Falha ao sincronizar.")
      setBackfilling(false)
      return
    }
    setBackfillMessage(
      result.created
        ? `${result.created} subscrição(ões) criada(s) a partir dos tenants.`
        : "Nenhuma subscrição em falta.",
    )
    await load()
    setBackfilling(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="px-4 lg:px-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscrições</h1>
          <p className="text-muted-foreground">
            Histórico de subscrições por escola (`subscriptions`) — plano, estado e período actual.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="size-4" />
            Actualizar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleBackfill()}
            disabled={loading || backfilling || needsAuth}
          >
            {backfilling ? "A sincronizar…" : "Sincronizar em falta"}
          </Button>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        {needsAuth ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Inicie sessão como administrador da plataforma.{" "}
              <Link href="/sign-in?next=/subscriptions" className="font-medium text-primary underline">
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

        {backfillMessage ? (
          <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {backfillMessage}
          </p>
        ) : null}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Filtrar por slug (ex.: demo)"
            value={filterSlug}
            onChange={(event) => setFilterSlug(event.target.value)}
            className="max-w-xs"
          />
          {filterSlug ? (
            <Button variant="ghost" size="sm" onClick={() => setFilterSlug("")}>
              Limpar filtro
            </Button>
          ) : null}
        </div>

        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Escola</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">MRR (AOA)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      A carregar…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Receipt className="size-4" />
                        Nenhuma subscrição registada. Use «Sincronizar em falta» ou «Gerir» em /tenants.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div>{row.tenant_name || "—"}</div>
                        {row.tenant_slug ? (
                          <div className="text-xs text-muted-foreground font-mono">{row.tenant_slug}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div>{row.plan_name || "—"}</div>
                        {row.plan_code ? (
                          <div className="text-xs text-muted-foreground">{row.plan_code}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                        {row.cancel_at_period_end ? (
                          <div className="text-xs text-muted-foreground mt-1">Cancela no fim</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(row.current_period_start)} → {formatDate(row.current_period_end)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.price_aoa_monthly != null
                          ? row.price_aoa_monthly.toLocaleString("pt-AO")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
