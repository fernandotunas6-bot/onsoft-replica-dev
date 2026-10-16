"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSaasApiUrl, getSigaSchoolUrl } from "@/lib/ecosystem-urls"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { TenantSubscriptionDialog } from "../components/tenant-subscription-dialog"
import { TenantAdminAccessPanel } from "../components/tenant-admin-access-dialog"
import { BillingTab } from "./billing-tab"
import { PublicTab } from "./public-tab"
import { dateLabel, fetchTenantOverview, kz, type TenantOverview } from "./types"

const TENANT_STATUS: Record<string, string> = {
  active: "Activa",
  trial: "Trial",
  suspended: "Suspensa",
  past_due: "Em atraso",
  cancelled: "Cancelada",
  archived: "Arquivada",
  provisioning: "Em criação",
  provisioning_failed: "Criação falhou",
}

const SUBSCRIPTION_STATUS: Record<string, string> = {
  trialing: "Período experimental",
  active: "Activa",
  past_due: "Em atraso",
  canceled: "Cancelada",
  unpaid: "Por pagar",
}

const TABS = ["geral", "plano", "cobranca", "publica", "acesso", "registo"] as const
type TabId = (typeof TABS)[number]

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value || "—"}</dd>
    </div>
  )
}

/**
 * Página da escola no ADMIN: todas as configurações num só sítio — dados,
 * plano e assinatura, cobrança (modelo, prazos, pagamentos, pausa), escola
 * pública, acesso do administrador, domínios e registo de alterações.
 * Exportação estática: a escola vem de `?id=`.
 */
export default function TenantDetailPage() {
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [overview, setOverview] = useState<TenantOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabId>("geral")
  const [subscriptionOpen, setSubscriptionOpen] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setTenantId(params.get("id"))
    const fromUrl = params.get("tab") as TabId | null
    if (fromUrl && TABS.includes(fromUrl)) setTab(fromUrl)
  }, [])

  const load = useCallback(async () => {
    if (!tenantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setOverview(await fetchTenantOverview(tenantId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha de rede.")
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    void load()
  }, [load])

  const changeTab = (next: string) => {
    setTab(next as TabId)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", next)
    window.history.replaceState(null, "", url)
  }

  async function setStatus(status: string) {
    if (!overview) return
    setError(null)
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (isSupabaseConfigured()) {
      const { data } = await createClient().auth.getSession()
      if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`
    }
    const res = await fetch(getSaasApiUrl("/api/saas/tenants/status"), {
      method: "POST",
      headers,
      body: JSON.stringify({ tenantId: overview.tenant.id, status }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) setError(data.error || "Não foi possível actualizar o estado.")
    await load()
  }

  if (!loading && !tenantId) {
    return (
      <div className="px-4 lg:px-6">
        <p className="text-sm text-muted-foreground">
          Escola não indicada. <Link href="/tenants" className="text-primary underline">Voltar às escolas</Link>
        </p>
      </div>
    )
  }

  const t = overview?.tenant
  const billing = overview?.billing

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 px-4 sm:flex-row sm:items-start sm:justify-between lg:px-6">
        <div className="min-w-0">
          <Link href="/tenants" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Escolas
          </Link>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight">
            {overview?.school?.name ?? t?.name ?? (loading ? "A carregar…" : "Escola")}
          </h1>
          {t ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{t.slug}</span>
              <Badge variant="outline">{TENANT_STATUS[t.status] ?? t.status}</Badge>
              {t.subscription_status ? (
                <Badge variant="outline">{SUBSCRIPTION_STATUS[t.subscription_status] ?? t.subscription_status}</Badge>
              ) : null}
              {billing ? (
                <Badge variant={billing.state.charging ? "secondary" : "default"}>{billing.state.label}</Badge>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="size-4" /> Actualizar
          </Button>
          {t ? (
            <Button variant="outline" size="sm" asChild>
              <a href={getSigaSchoolUrl(t.slug)}>
                Abrir no SIGA <ExternalLink className="size-4" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mx-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive lg:mx-6">
          {error}
        </p>
      ) : null}

      {overview && t && billing ? (
        <Tabs value={tab} onValueChange={changeTab} className="px-4 lg:px-6">
          <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
            <TabsTrigger className="flex-none" value="geral">Visão geral</TabsTrigger>
            <TabsTrigger className="flex-none" value="plano">Plano e assinatura</TabsTrigger>
            <TabsTrigger className="flex-none" value="cobranca">Cobrança</TabsTrigger>
            <TabsTrigger className="flex-none" value="publica">Escola pública</TabsTrigger>
            <TabsTrigger className="flex-none" value="acesso">Acesso</TabsTrigger>
            <TabsTrigger className="flex-none" value="registo">Domínios e registo</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Instituição</CardTitle>
              </CardHeader>
              <CardContent>
                <dl>
                  <Row label="Nome comercial" value={overview.school?.commercial_name} />
                  <Row label="NIF" value={overview.school?.nif} />
                  <Row label="Director(a)" value={overview.school?.director_name} />
                  <Row
                    label="Localização"
                    value={[overview.school?.municipality, overview.school?.province].filter(Boolean).join(", ")}
                  />
                  <Row label="E-mail" value={overview.school?.email} />
                  <Row label="Telefone" value={overview.school?.phone} />
                  <Row label="Contacto do registo" value={[t.contact_name, t.contact_email, t.contact_phone].filter(Boolean).join(" · ")} />
                  <Row
                    label="Tipo"
                    value={overview.catalog.institutionTypes.find((x) => x.id === billing.profile.institutionType)?.label}
                  />
                  <Row label="Código público" value={overview.school?.public_code} />
                  <Row label="Criada a" value={dateLabel(t.created_at)} />
                </dl>
              </CardContent>
            </Card>
            <div className="grid content-start gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Uso</CardTitle>
                  <CardDescription>
                    {overview.usage.calculatedAt ? `Calculado a ${dateLabel(overview.usage.calculatedAt)}` : "Por calcular"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <dl>
                    <Row
                      label="Alunos activos"
                      value={`${overview.usage.students}${t.max_students ? ` / ${t.max_students}` : ""}`}
                    />
                    <Row label="Pessoal" value={String(overview.usage.staff)} />
                    <Row
                      label="Armazenamento"
                      value={`${formatBytes(overview.usage.storageBytes)}${t.max_storage_gb ? ` / ${t.max_storage_gb} GB` : ""}`}
                    />
                  </dl>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Próxima cobrança</CardTitle>
                  <CardDescription>{billing.state.label}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-1 text-sm">
                  <p className="text-xl font-semibold tabular-nums">{kz(billing.charge.total)}</p>
                  {billing.state.charging ? (
                    <p className="text-xs text-muted-foreground">Vence a {dateLabel(billing.schedule.dueOn)}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{billing.state.reason}</p>
                  )}
                  <Button variant="link" className="h-auto w-fit p-0" onClick={() => changeTab("cobranca")}>
                    Configurar cobrança
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="plano" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Plano contratado</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <dl>
                  <Row label="Plano" value={t.plans?.name} />
                  <Row label="Preço de tabela" value={`${kz(t.plans?.price_aoa_monthly)} /mês${t.plans?.price_aoa_yearly ? ` · ${kz(t.plans.price_aoa_yearly)} /ano` : ""}`} />
                  <Row label="Limite de alunos" value={t.max_students ? String(t.max_students) : "—"} />
                  <Row label="Estado" value={SUBSCRIPTION_STATUS[overview.subscription?.status ?? ""] ?? overview.subscription?.status} />
                  <Row label="Fim do trial" value={dateLabel(t.trial_ends_at)} />
                  <Row label="Período pago até" value={dateLabel(overview.subscription?.current_period_end)} />
                </dl>
                <Button className="w-fit" onClick={() => setSubscriptionOpen(true)}>
                  Mudar plano ou estender trial
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Estado da escola</CardTitle>
                <CardDescription>
                  Suspender deixa a escola só de consulta. Para não cobrar sem bloquear, use «Pausar cobranças»
                  em Cobrança.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {t.status !== "suspended" && t.status !== "past_due" ? (
                  <Button variant="outline" onClick={() => void setStatus("suspended")}>
                    Suspender
                  </Button>
                ) : (
                  <Button onClick={() => void setStatus("active")}>Activar</Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cobranca" className="mt-4">
            <BillingTab overview={overview} onSaved={load} />
          </TabsContent>

          <TabsContent value="publica" className="mt-4">
            <PublicTab overview={overview} onSaved={load} onGoToBilling={() => changeTab("cobranca")} />
          </TabsContent>

          <TabsContent value="acesso" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Acesso do administrador</CardTitle>
                <CardDescription>
                  O administrador entra no painel administrativo e no portal escolar com a mesma
                  conta. Diagnóstico e reparação: perfil, permissões, e-mail e links de acesso para
                  quem nunca entrou. A Administração Global continua só da equipa da plataforma.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TenantAdminAccessPanel
                  tenant={{ id: t.id, name: t.name, slug: t.slug }}
                  active={tab === "acesso"}
                  onManageSubscription={() => setSubscriptionOpen(true)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="registo" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Domínios</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {overview.domains.length === 0 ? <p className="text-muted-foreground">Nenhum domínio.</p> : null}
                {overview.domains.map((d) => (
                  <div key={d.hostname} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs">{d.hostname}</span>
                    <Badge variant="outline">{d.status}</Badge>
                  </div>
                ))}
                <Button variant="link" className="h-auto w-fit p-0" asChild>
                  <Link href={`/domains?tenant=${encodeURIComponent(t.slug)}`}>Gerir domínios</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Últimas alterações</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-1.5 text-sm">
                  {overview.audit.length === 0 ? <li className="text-muted-foreground">Sem registos.</li> : null}
                  {overview.audit.map((a, i) => (
                    <li key={`${a.created_at}-${i}`} className="flex justify-between gap-3">
                      <span className="font-mono text-xs">{a.action}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{dateLabel(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : loading ? (
        <p className="px-4 text-sm text-muted-foreground lg:px-6">A carregar…</p>
      ) : null}

      {overview && t ? (
        <>
          <TenantSubscriptionDialog
            tenant={{
              id: t.id,
              name: t.name,
              slug: t.slug,
              trial_ends_at: t.trial_ends_at ?? undefined,
              plans: t.plans ?? undefined,
            }}
            open={subscriptionOpen}
            onOpenChange={setSubscriptionOpen}
            onUpdated={load}
          />
        </>
      ) : null}
    </div>
  )
}
