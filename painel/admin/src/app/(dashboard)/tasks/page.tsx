"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CheckCircle2, Circle, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getAdminAccessToken } from "@/lib/admin-session"
import {
  fetchSaasSubscriptions,
  fetchTenantDomains,
  type SubscriptionRow,
  type TenantDomainRow,
} from "@/lib/saas-api"

type TaskItem = {
  id: string
  title: string
  detail: string
  href: string
  severity: "high" | "medium" | "low"
}

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export default function TasksPage() {
  const [subs, setSubs] = useState<SubscriptionRow[]>([])
  const [domains, setDomains] = useState<TenantDomainRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)

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
    const [s, d] = await Promise.all([
      fetchSaasSubscriptions(token),
      fetchTenantDomains(token),
    ])
    if (!s.ok && !d.ok) {
      setError(s.error || d.error || "Falha ao carregar fila.")
    }
    setSubs(s.subscriptions ?? [])
    setDomains(d.domains ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const tasks = useMemo(() => {
    const items: TaskItem[] = []

    for (const sub of subs) {
      if (sub.status === "past_due" || sub.status === "unpaid") {
        items.push({
          id: `sub-due-${sub.id}`,
          title: `Subscrição em atraso — ${sub.tenant_name || sub.tenant_slug || sub.tenant_id}`,
          detail: `${sub.plan_name || sub.plan_code || "plano"} · ${sub.status}`,
          href: `/subscriptions?tenant=${encodeURIComponent(sub.tenant_slug || "")}`,
          severity: "high",
        })
      }
      if (sub.status === "trialing") {
        const left = daysUntil(sub.current_period_end)
        if (left <= 7) {
          items.push({
            id: `sub-trial-${sub.id}`,
            title: `Trial a expirar em ${left} dia(s) — ${sub.tenant_name || sub.tenant_slug}`,
            detail: `Fim: ${new Date(sub.current_period_end).toLocaleDateString("pt-AO")}`,
            href: `/tenants`,
            severity: left <= 2 ? "high" : "medium",
          })
        }
      }
    }

    for (const domain of domains) {
      if (domain.status === "pending") {
        items.push({
          id: `dom-pending-${domain.id}`,
          title: `DNS pendente — ${domain.hostname}`,
          detail: domain.tenant_name || domain.tenant_slug || domain.tenant_id,
          href: "/domains",
          severity: "medium",
        })
      }
      if (domain.status === "failed") {
        items.push({
          id: `dom-failed-${domain.id}`,
          title: `DNS falhou — ${domain.hostname}`,
          detail: domain.tenant_name || domain.tenant_slug || domain.tenant_id,
          href: "/domains",
          severity: "high",
        })
      }
    }

    const order = { high: 0, medium: 1, low: 2 }
    return items.sort((a, b) => order[a.severity] - order[b.severity])
  }, [subs, domains])

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fila operacional</h1>
          <p className="text-muted-foreground">
            Tarefas reais derivadas de subscrições e domínios — não é a lista demo do template.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {needsAuth ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            <Link className="underline" href="/sign-in">
              Entrar
            </Link>{" "}
            como administrador da plataforma.
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Abertas</CardDescription>
            <CardTitle>{loading ? "…" : tasks.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Prioridade alta</CardDescription>
            <CardTitle className="text-destructive">
              {loading ? "…" : tasks.filter((t) => t.severity === "high").length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Domínios a verificar</CardDescription>
            <CardTitle>
              {loading
                ? "…"
                : domains.filter((d) => d.status === "pending" || d.status === "failed").length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens</CardTitle>
          <CardDescription>
            {tasks.length === 0 && !loading
              ? "Nada pendente — plataforma em dia."
              : "Clique para abrir a superfície correcta."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {tasks.map((task) => (
            <Link
              key={task.id}
              href={task.href}
              className="flex items-start gap-3 rounded-md border px-3 py-3 text-sm transition-colors hover:bg-muted/50"
            >
              {task.severity === "high" ? (
                <Circle className="mt-0.5 size-4 text-destructive" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{task.title}</span>
                  <Badge variant={task.severity === "high" ? "destructive" : "secondary"}>
                    {task.severity}
                  </Badge>
                </div>
                <p className="text-muted-foreground">{task.detail}</p>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
