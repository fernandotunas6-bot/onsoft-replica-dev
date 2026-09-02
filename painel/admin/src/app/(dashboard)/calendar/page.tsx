"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getAdminAccessToken } from "@/lib/admin-session"
import { fetchSaasSubscriptions, type SubscriptionRow } from "@/lib/saas-api"

type CalEvent = {
  id: string
  date: string
  title: string
  kind: "trial_end" | "period_end" | "cancel"
  href: string
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export default function CalendarPage() {
  const [subs, setSubs] = useState<SubscriptionRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const token = await getAdminAccessToken()
    if (!token) {
      setNeedsAuth(true)
      setLoading(false)
      return
    }
    setNeedsAuth(false)
    const result = await fetchSaasSubscriptions(token)
    if (!result.ok) setError(result.error || "Falha ao carregar.")
    setSubs(result.subscriptions ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const viewMonth = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  }, [monthOffset])

  const events = useMemo(() => {
    const items: CalEvent[] = []
    for (const sub of subs) {
      const label = sub.tenant_name || sub.tenant_slug || sub.tenant_id
      const href = `/subscriptions?tenant=${encodeURIComponent(sub.tenant_slug || "")}`
      if (sub.status === "trialing") {
        items.push({
          id: `trial-${sub.id}`,
          date: sub.current_period_end,
          title: `Fim de trial — ${label}`,
          kind: "trial_end",
          href,
        })
      } else {
        items.push({
          id: `period-${sub.id}`,
          date: sub.current_period_end,
          title: `Renovação / fim período — ${label}`,
          kind: "period_end",
          href,
        })
      }
      if (sub.cancel_at_period_end) {
        items.push({
          id: `cancel-${sub.id}`,
          date: sub.current_period_end,
          title: `Cancelamento agendado — ${label}`,
          kind: "cancel",
          href,
        })
      }
    }
    return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [subs])

  const monthEvents = useMemo(() => {
    const y = viewMonth.getFullYear()
    const m = viewMonth.getMonth()
    return events.filter((ev) => {
      const d = new Date(ev.date)
      return d.getFullYear() === y && d.getMonth() === m
    })
  }, [events, viewMonth])

  const upcoming = useMemo(() => {
    const today = startOfDay(new Date())
    return events
      .filter((ev) => new Date(ev.date) >= today)
      .slice(0, 12)
  }, [events])

  const monthLabel = viewMonth.toLocaleDateString("pt-AO", { month: "long", year: "numeric" })

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agenda SaaS</h1>
          <p className="text-muted-foreground">
            Fins de trial, renovações e cancelamentos — dados reais de `subscriptions`.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonthOffset((v) => v - 1)}>
            Mês anterior
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonthOffset(0)}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonthOffset((v) => v + 1)}>
            Próximo mês
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {needsAuth ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            <Link className="underline" href="/sign-in">
              Entrar
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="capitalize">{monthLabel}</CardTitle>
            <CardDescription>{monthEvents.length} evento(s) neste mês</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {monthEvents.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground">Sem eventos neste mês.</p>
            ) : (
              monthEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href={ev.href}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        ev.kind === "trial_end"
                          ? "outline"
                          : ev.kind === "cancel"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {ev.kind === "trial_end"
                        ? "Trial"
                        : ev.kind === "cancel"
                          ? "Cancelar"
                          : "Período"}
                    </Badge>
                    <span>{ev.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(ev.date).toLocaleDateString("pt-AO")}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximos</CardTitle>
            <CardDescription>Ordenados por data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.map((ev) => (
              <Link
                key={ev.id}
                href={ev.href}
                className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <div className="font-medium">{ev.title}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(ev.date).toLocaleString("pt-AO")}
                </div>
              </Link>
            ))}
            {upcoming.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground">Nada agendado.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
