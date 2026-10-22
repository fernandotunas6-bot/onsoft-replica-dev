"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CheckCircle2, Circle, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getAdminAccessToken } from "@/lib/admin-session"
import {
  fetchSaasTenants,
  fetchTenantDomains,
  type SaasTenantRow,
  type TenantDomainRow,
} from "@/lib/saas-api"

type TaskItem = {
  id: string
  title: string
  detail: string
  href: string
  severity: "high" | "medium" | "low"
}

const SEVERITY_LABEL: Record<TaskItem["severity"], string> = {
  high: "Urgente",
  medium: "Esta semana",
  low: "Quando puder",
}

function schoolHref(tenant: SaasTenantRow, tab: string) {
  return `/tenants/escola?id=${encodeURIComponent(tenant.id)}&tab=${tab}`
}

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export default function TasksPage() {
  const [tenants, setTenants] = useState<SaasTenantRow[]>([])
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
    const [s, d] = await Promise.all([fetchSaasTenants(token), fetchTenantDomains(token)])
    // Uma das fontes a falhar escondia tarefas sem aviso: mostra-se qual falhou.
    const failures = [s.ok ? null : s.error, d.ok ? null : d.error].filter(Boolean)
    if (failures.length) setError(failures.join(" · ") || "Falha ao carregar fila.")
    setTenants(s.tenants ?? [])
    setDomains(d.domains ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const tasks = useMemo(() => {
    const items: TaskItem[] = []

    // Escolas isentas (cobrança pausada ou pública aprovada) não geram tarefas
    // de cobrança nem de trial: não há nada a cobrar.
    for (const tenant of tenants) {
      const name = tenant.name || tenant.slug
      if (tenant.status === "provisioning_failed") {
        items.push({
          id: `tenant-failed-${tenant.id}`,
          title: `Criação falhou — ${name}`,
          detail: "Rever o registo e voltar a criar a escola.",
          href: schoolHref(tenant, "registo"),
          severity: "high",
        })
      }
      if (tenant.billing_exempt) continue
      if (tenant.status === "past_due") {
        items.push({
          id: `tenant-due-${tenant.id}`,
          title: `Escola em atraso — ${name}`,
          detail: "Só de consulta. Registar o pagamento recebido ou pausar as cobranças.",
          href: schoolHref(tenant, "plano"),
          severity: "high",
        })
      }
      const inTrial = tenant.status === "trial" || tenant.subscription_status === "trialing"
      if (inTrial && tenant.trial_ends_at && tenant.status !== "suspended") {
        const left = daysUntil(tenant.trial_ends_at)
        const end = new Date(tenant.trial_ends_at).toLocaleDateString("pt-AO")
        if (left < 0) {
          items.push({
            id: `tenant-trial-expired-${tenant.id}`,
            title: `Trial expirado — ${name}`,
            detail: `Terminou a ${end}. Prolongar o trial, registar pagamento ou pausar as cobranças.`,
            href: schoolHref(tenant, "plano"),
            severity: "high",
          })
        } else if (left <= 7) {
          items.push({
            id: `tenant-trial-${tenant.id}`,
            title: `Trial a expirar em ${left} dia(s) — ${name}`,
            detail: `Fim: ${end}`,
            href: schoolHref(tenant, "plano"),
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
  }, [tenants, domains])

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fila operacional</h1>
          <p className="text-muted-foreground">
            Escolas em atraso, trials a acabar, criações falhadas e domínios por verificar.
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
                    {SEVERITY_LABEL[task.severity]}
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
