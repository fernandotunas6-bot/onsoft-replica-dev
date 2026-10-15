"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Building2, ExternalLink, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { getCreateSchoolUrl, getSaasApiUrl, getSigaSchoolUrl } from "@/lib/ecosystem-urls"
import { syncSaasUsage } from "@/lib/saas-api"
import { TenantSubscriptionDialog } from "./components/tenant-subscription-dialog"

interface TenantRow {
  id: string
  name: string
  slug: string
  status: string
  contact_email?: string
  trial_ends_at?: string
  active_students_count?: number
  max_students?: number
  usage_last_calculated_at?: string
  plans?: { name?: string; code?: string }
}

interface Stats {
  totalTenants: number
  activeTenants: number
  trialTenants: number
  suspendedTenants: number
  totalStudents: number
  mrrAoa: number
}

function tenantStatusLabel(status: string) {
  const map: Record<string, string> = {
    active: "Activa",
    suspended: "Suspensa",
    trial: "Trial",
    past_due: "Em atraso",
  }
  return map[status] || status
}

async function authHeader(): Promise<HeadersInit> {
  if (!isSupabaseConfigured()) return {}
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function TenantsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [manageTenant, setManageTenant] = useState<TenantRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await authHeader()
      const [statsRes, tenantsRes] = await Promise.all([
        fetch(getSaasApiUrl("/api/saas/stats"), { headers }),
        fetch(getSaasApiUrl("/api/saas/tenants"), { headers }),
      ])
      if (statsRes.status === 401 || tenantsRes.status === 401) {
        setNeedsAuth(true)
        setStats(null)
        setTenants([])
        return
      }
      setNeedsAuth(false)
      const statsJson = (await statsRes.json()) as { stats?: Stats; error?: string }
      const tenantsJson = (await tenantsRes.json()) as { tenants?: TenantRow[]; error?: string }
      if (!statsRes.ok) throw new Error(statsJson.error || "Não foi possível carregar métricas.")
      if (!tenantsRes.ok) throw new Error(tenantsJson.error || "Não foi possível listar escolas.")
      setStats(statsJson.stats ?? null)
      setTenants(tenantsJson.tenants ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha de rede.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function setStatus(tenantId: string, status: string) {
    setError(null)
    const headers = {
      ...(await authHeader()),
      "Content-Type": "application/json",
    }
    const res = await fetch(getSaasApiUrl("/api/saas/tenants/status"), {
      method: "POST",
      headers,
      body: JSON.stringify({ tenantId, status }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      setError(data.error || "Não foi possível actualizar o estado.")
      return
    }
    await load()
  }

  async function syncUsage() {
    setSyncing(true)
    setError(null)
    try {
      if (!isSupabaseConfigured()) throw new Error("Supabase não configurado.")
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const result = await syncSaasUsage(data.session?.access_token)
      if (!result.ok) throw new Error(result.error || "Falha ao sincronizar utilização.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao sincronizar utilização.")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="px-4 lg:px-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Escolas clientes</h1>
          <p className="text-muted-foreground">
            Tenants, subscrições e estado SaaS. A operação escolar continua no SIGA.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || syncing}>
            <RefreshCw className="size-4" />
            Actualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void syncUsage()}
            disabled={loading || syncing || needsAuth}
          >
            {syncing ? "A sincronizar…" : "Sync utilização"}
          </Button>
          <Button size="sm" asChild>
            <a href={getCreateSchoolUrl()}>
              Nova escola
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Metric title="Escolas" value={stats?.totalTenants} icon={Building2} />
          <Metric title="Activas" value={stats?.activeTenants} />
          <Metric title="Trial" value={stats?.trialTenants} />
          <Metric title="Suspensas" value={stats?.suspendedTenants} />
          <Metric title="Alunos (uso)" value={stats?.totalStudents} />
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6">
        {needsAuth ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Inicie sessão como administrador da plataforma.{" "}
              <Link href="/sign-in?next=/tenants" className="font-medium text-primary underline">
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

        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Escola</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Alunos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Trial / Contacto</TableHead>
                  <TableHead className="text-right">Acções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      A carregar…
                    </TableCell>
                  </TableRow>
                ) : tenants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Nenhuma escola registada.
                    </TableCell>
                  </TableRow>
                ) : (
                  tenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <div className="font-medium">{tenant.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{tenant.slug}</div>
                      </TableCell>
                      <TableCell>{tenant.plans?.name || tenant.plans?.code || "—"}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            {tenant.active_students_count ?? 0}
                            {tenant.max_students ? ` / ${tenant.max_students}` : ""}
                          </span>
                          {tenant.max_students &&
                          (tenant.active_students_count ?? 0) >= tenant.max_students ? (
                            <Badge variant="destructive">Limite</Badge>
                          ) : tenant.max_students &&
                            (tenant.active_students_count ?? 0) >=
                              Math.floor(tenant.max_students * 0.9) ? (
                            <Badge variant="secondary">Quase no limite</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{tenantStatusLabel(tenant.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{tenant.contact_email || "—"}</div>
                        {tenant.trial_ends_at ? (
                          <div className="text-xs text-muted-foreground">
                            Trial até {new Date(tenant.trial_ends_at).toLocaleDateString("pt-AO")}
                          </div>
                        ) : null}
                        {tenant.usage_last_calculated_at ? (
                          <div className="text-xs text-muted-foreground">
                            Sync{" "}
                            {new Date(tenant.usage_last_calculated_at).toLocaleString("pt-AO", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/subscriptions?tenant=${encodeURIComponent(tenant.slug)}`}>
                            Subscrição
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/domains?tenant=${encodeURIComponent(tenant.slug)}`}>
                            Domínios
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setManageTenant(tenant)}>
                          Gerir
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <a href={getSigaSchoolUrl(tenant.slug)}>
                            SIGA <ExternalLink className="size-3" />
                          </a>
                        </Button>
                        {tenant.status !== "suspended" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void setStatus(tenant.id, "suspended")}
                          >
                            Suspender
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void setStatus(tenant.id, "active")}
                          >
                            Activar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {manageTenant ? (
          <TenantSubscriptionDialog
            tenant={manageTenant}
            open={Boolean(manageTenant)}
            onOpenChange={(open) => {
              if (!open) setManageTenant(null)
            }}
            onUpdated={load}
          />
        ) : null}
      </div>
    </div>
  )
}

function Metric({
  title,
  value,
  icon: Icon,
}: {
  title: string
  value?: number
  icon?: typeof Building2
}) {
  return (
    <Card className="border">
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          {Icon ? <Icon className="text-muted-foreground size-6" /> : <span />}
        </div>
        <p className="text-muted-foreground text-sm font-medium">{title}</p>
        <div className="text-2xl font-bold">{value ?? "—"}</div>
      </CardContent>
    </Card>
  )
}
