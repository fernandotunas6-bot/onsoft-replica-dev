"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Building2, ExternalLink, MoreHorizontal, RefreshCw, Search } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { setTenantStatus, syncSaasUsage } from "@/lib/saas-api"
import {
  TenantSubscriptionDialog,
  type SubscriptionAction,
} from "./components/tenant-subscription-dialog"
import { TenantAdminAccessDialog } from "./components/tenant-admin-access-dialog"

interface TenantRow {
  id: string
  name: string
  slug: string
  status: string
  subscription_status?: string | null
  contact_email?: string
  trial_ends_at?: string
  active_students_count?: number
  max_students?: number
  usage_last_calculated_at?: string
  plans?: { name?: string; code?: string }
  /** Cobranças pausadas ou escola pública isenta (mantido pelo servidor). */
  billing_exempt?: boolean | null
  billing_exempt_reason?: string | null
}

interface Stats {
  totalTenants: number
  activeTenants: number
  trialTenants: number
  suspendedTenants: number
  pastDueTenants?: number
  trialExpiredTenants?: number
  exemptTenants?: number
  totalStudents: number
  mrrAoa: number
}

/** Trial terminado sem isenção: o SIGA não deixa a escola gravar. */
function trialExpired(tenant: TenantRow, now = Date.now()) {
  if (tenant.billing_exempt) return false
  if (tenant.status !== "trial" && tenant.subscription_status !== "trialing") return false
  const end = tenant.trial_ends_at ? Date.parse(tenant.trial_ends_at) : Number.NaN
  return Number.isFinite(end) && end < now
}

/** Ainda não paga: `trial`, ou `active` com a assinatura em `trialing` (mesma regra do servidor). */
function inTrial(tenant: TenantRow) {
  return (
    tenant.status === "trial" ||
    (tenant.status === "active" && tenant.subscription_status === "trialing")
  )
}

type TenantFilter = "all" | "active" | "trial" | "trial_expired" | "past_due" | "suspended" | "exempt"

const FILTERS: Array<{ id: TenantFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "active", label: "Activas (a pagar)" },
  { id: "trial", label: "Em trial" },
  { id: "trial_expired", label: "Trial expirado" },
  { id: "past_due", label: "Em atraso" },
  { id: "suspended", label: "Suspensas" },
  { id: "exempt", label: "Isentas / pausadas" },
]

function matchesFilter(tenant: TenantRow, filter: TenantFilter) {
  switch (filter) {
    case "all":
      return true
    case "active":
      return tenant.status === "active" && !inTrial(tenant) && !tenant.billing_exempt
    case "trial":
      return inTrial(tenant) && !trialExpired(tenant)
    case "trial_expired":
      return trialExpired(tenant)
    case "exempt":
      return Boolean(tenant.billing_exempt)
    default:
      return tenant.status === filter
  }
}

function tenantStatusLabel(status: string) {
  const map: Record<string, string> = {
    active: "Activa",
    suspended: "Suspensa",
    trial: "Trial",
    past_due: "Em atraso",
    cancelled: "Cancelada",
    archived: "Arquivada",
    provisioning: "A criar",
    provisioning_failed: "Criação falhou",
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
  const [manageAction, setManageAction] = useState<SubscriptionAction>("plan")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<TenantFilter>("all")
  const [accessTenant, setAccessTenant] = useState<TenantRow | null>(null)

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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tenants.filter(
      (tenant) =>
        matchesFilter(tenant, filter) &&
        (!q ||
          tenant.name.toLowerCase().includes(q) ||
          tenant.slug.toLowerCase().includes(q) ||
          (tenant.contact_email ?? "").toLowerCase().includes(q)),
    )
  }, [tenants, query, filter])

  function openSubscription(tenant: TenantRow, action: SubscriptionAction) {
    setManageAction(action)
    setManageTenant(tenant)
  }

  async function setStatus(tenant: TenantRow, status: "active" | "suspended") {
    if (
      status === "suspended" &&
      !window.confirm(`Suspender «${tenant.name}»? A escola fica só de consulta até ser reactivada.`)
    ) {
      return
    }
    setError(null)
    const supabase = isSupabaseConfigured() ? createClient() : null
    const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null
    const result = await setTenantStatus(token, tenant.id, status)
    if (!result.ok) {
      setError(result.error || "Não foi possível actualizar o estado.")
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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Metric title="Escolas" value={stats?.totalTenants} icon={Building2} />
          <Metric title="Activas" value={stats?.activeTenants} />
          <Metric title="Em trial" value={stats?.trialTenants} />
          <Metric title="Trial expirado" value={stats?.trialExpiredTenants} tone="warning" />
          <Metric title="Em atraso" value={stats?.pastDueTenants} tone="warning" />
          <Metric title="Suspensas" value={stats?.suspendedTenants} />
          <Metric title="Isentas / pausadas" value={stats?.exemptTenants} />
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
            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Procurar por nome, slug ou e-mail"
                  aria-label="Procurar escolas"
                  className="pl-9"
                />
              </div>
              <Select value={filter} onValueChange={(value) => setFilter(value as TenantFilter)}>
                <SelectTrigger className="sm:w-56" aria-label="Filtrar por estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTERS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                ) : visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      {tenants.length === 0
                        ? "Nenhuma escola registada."
                        : "Nenhuma escola corresponde à pesquisa ou ao filtro."}
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <Link
                          href={`/tenants/escola?id=${encodeURIComponent(tenant.id)}`}
                          className="font-medium hover:underline"
                        >
                          {tenant.name}
                        </Link>
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
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">{tenantStatusLabel(tenant.status)}</Badge>
                          {trialExpired(tenant) ? (
                            <Badge variant="destructive">Trial expirado</Badge>
                          ) : null}
                          {tenant.billing_exempt ? (
                            <Badge variant="secondary" title={tenant.billing_exempt_reason ?? undefined}>
                              {tenant.billing_exempt_reason?.startsWith("Escola pública")
                                ? "Isenta"
                                : "Cobrança pausada"}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{tenant.contact_email || "—"}</div>
                        {tenant.trial_ends_at &&
                        (tenant.status === "trial" || tenant.subscription_status === "trialing") ? (
                          <div className="text-xs text-muted-foreground">
                            {trialExpired(tenant) ? "Trial terminou a " : "Trial até "}
                            {new Date(tenant.trial_ends_at).toLocaleDateString("pt-AO")}
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
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/tenants/escola?id=${encodeURIComponent(tenant.id)}`}>
                              Configurações
                            </Link>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Mais acções: ${tenant.name}`}>
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {tenant.status === "past_due" && !tenant.billing_exempt ? (
                                <DropdownMenuItem onSelect={() => openSubscription(tenant, "payment")}>
                                  Registar pagamento
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem onSelect={() => openSubscription(tenant, "plan")}>
                                Mudar plano
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openSubscription(tenant, "trial")}>
                                Prolongar trial
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openSubscription(tenant, "payment")}>
                                Pagamento recebido
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setAccessTenant(tenant)}>
                                Acesso do administrador
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link href={`/subscriptions?tenant=${encodeURIComponent(tenant.slug)}`}>
                                  Subscrição
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/domains?tenant=${encodeURIComponent(tenant.slug)}`}>
                                  Domínios
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <a href={getSigaSchoolUrl(tenant.slug)}>
                                  Abrir no SIGA <ExternalLink className="size-3" />
                                </a>
                              </DropdownMenuItem>
                              {tenant.status === "cancelled" || tenant.status === "archived" ? null : (
                                <>
                                  <DropdownMenuSeparator />
                                  {tenant.status === "suspended" ||
                                  (tenant.status === "past_due" && tenant.billing_exempt) ? (
                                    <DropdownMenuItem onSelect={() => void setStatus(tenant, "active")}>
                                      Reactivar
                                    </DropdownMenuItem>
                                  ) : tenant.status !== "past_due" ? (
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onSelect={() => void setStatus(tenant, "suspended")}
                                    >
                                      Suspender…
                                    </DropdownMenuItem>
                                  ) : null}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {accessTenant ? (
          <TenantAdminAccessDialog
            tenant={accessTenant}
            open={Boolean(accessTenant)}
            onOpenChange={(open) => {
              if (!open) setAccessTenant(null)
            }}
            onManageSubscription={() => openSubscription(accessTenant, "plan")}
          />
        ) : null}

        {manageTenant ? (
          <TenantSubscriptionDialog
            tenant={manageTenant}
            open={Boolean(manageTenant)}
            onOpenChange={(open) => {
              if (!open) setManageTenant(null)
            }}
            onUpdated={load}
            initialAction={manageAction}
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
  tone,
}: {
  title: string
  value?: number
  icon?: typeof Building2
  /** «warning» realça contagens que pedem acção (trial expirado, em atraso). */
  tone?: "warning"
}) {
  const alert = tone === "warning" && (value ?? 0) > 0
  return (
    <Card className={alert ? "border-amber-500/50" : "border"}>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          {Icon ? <Icon className="text-muted-foreground size-6" /> : <span />}
        </div>
        <p className="text-muted-foreground text-sm font-medium">{title}</p>
        <div className={alert ? "text-2xl font-bold text-amber-600 dark:text-amber-400" : "text-2xl font-bold"}>
          {value ?? "—"}
        </div>
      </CardContent>
    </Card>
  )
}
