"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Globe, Plus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { getSaasApiUrl } from "@/lib/ecosystem-urls"
import {
  fetchTenantDomains,
  registerTenantDomain,
  updateTenantDomainStatus,
  verifyTenantDomainDns,
  type TenantDomainRow,
} from "@/lib/saas-api"

interface TenantOption {
  id: string
  name: string
  slug: string
}

async function accessToken(): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return undefined
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}

async function authHeader(): Promise<HeadersInit> {
  const token = await accessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<TenantDomainRow[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [tenantId, setTenantId] = useState("")
  const [hostname, setHostname] = useState("")
  const [filterSlug, setFilterSlug] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const token = await accessToken()
    const headers = await authHeader()
    const [domainsResult, tenantsRes] = await Promise.all([
      fetchTenantDomains(token),
      fetch(getSaasApiUrl("/api/saas/tenants"), { headers }),
    ])
    if (!token || domainsResult.error?.includes("Unauthorized")) {
      setNeedsAuth(true)
      setDomains([])
      setTenants([])
      setLoading(false)
      return
    }
    setNeedsAuth(false)
    if (!domainsResult.ok) {
      setError(domainsResult.error || "Falha ao carregar domínios.")
      setLoading(false)
      return
    }
    setDomains(domainsResult.domains ?? [])
    if (tenantsRes.ok) {
      const json = (await tenantsRes.json()) as { tenants?: TenantOption[] }
      setTenants(json.tenants ?? [])
    }
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
    if (!filterSlug.trim()) return domains
    return domains.filter((row) => row.tenant_slug === filterSlug.trim())
  }, [domains, filterSlug])

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const token = await accessToken()
    const result = await registerTenantDomain(token, { tenantId, hostname: hostname.trim() })
    if (!result.ok) {
      setError(result.error || "Não foi possível registar.")
      setSaving(false)
      return
    }
    setHostname("")
    await load()
    setSaving(false)
  }

  async function verifyDomain(domainId: string) {
    setError(null)
    const token = await accessToken()
    const result = await verifyTenantDomainDns(token, domainId)
    if (!result.ok) {
      setError(result.error || "Verificação DNS falhou.")
      return
    }
    await load()
  }

  async function setDomainStatus(domainId: string, status: "active" | "failed") {
    setError(null)
    const token = await accessToken()
    const result = await updateTenantDomainStatus(token, { domainId, status })
    if (!result.ok) {
      setError(result.error || "Não foi possível actualizar.")
      return
    }
    await load()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="px-4 lg:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Identidade Digital & Domínios</h1>
        <p className="text-muted-foreground">
          Subdomínios automáticos (<span className="font-mono text-xs">*.{process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "portal-siga.com"}</span>) e domínios personalizados por escola.
        </p>
      </div>

      {/* Métricas rápidas */}
      {!loading && !needsAuth && (
        <div className="px-4 lg:px-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-bold text-foreground">{domains.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total de Domínios</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-bold text-emerald-600">{domains.filter((d) => d.status === "active").length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Activos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-bold text-amber-500">{domains.filter((d) => d.status === "pending").length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Pendentes (DNS)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-bold text-destructive">{domains.filter((d) => d.status === "failed").length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Com Falha</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="px-4 lg:px-6">
        {needsAuth ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Inicie sessão como administrador da plataforma.{" "}
              <Link href="/sign-in?next=/domains" className="font-medium text-primary underline">
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

        <Card className="mb-4">
          <CardContent className="pt-6 space-y-3">
            <h2 className="font-semibold">Registar domínio customizado</h2>
            <form onSubmit={(event) => void handleRegister(event)} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Select value={tenantId} onValueChange={setTenantId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Escola" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="portal.colegio.ao"
                value={hostname}
                onChange={(event) => setHostname(event.target.value)}
                required
              />
              <Button type="submit" disabled={saving || !tenantId || !hostname.trim()} className="gap-2">
                <Plus className="size-4" />
                {saving ? "A registar…" : "Registar"}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Fica em «pending» até verificação DNS. Configure CNAME para{" "}
              <span className="font-mono">{`{slug}.${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "portal-siga.com"}`}</span> ou TXT em{" "}
              <span className="font-mono">_siga-verify.seudominio.ao</span>.
            </p>
          </CardContent>
        </Card>

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
                  <TableHead>Hostname</TableHead>
                  <TableHead>Escola</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acções</TableHead>
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
                        <Globe className="size-4" />
                        Nenhum domínio registado.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell className="font-mono text-sm">{domain.hostname}</TableCell>
                      <TableCell>
                        <div>{domain.tenant_name || "—"}</div>
                        {domain.tenant_slug ? (
                          <div className="text-xs text-muted-foreground">{domain.tenant_slug}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{domain.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            domain.status === "active"
                              ? "secondary"
                              : domain.status === "failed"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {domain.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {domain.type === "custom_domain" && domain.status === "pending" ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void verifyDomain(domain.id)}
                            >
                              Verificar DNS
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void setDomainStatus(domain.id, "active")}
                            >
                              Activar manual
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void setDomainStatus(domain.id, "failed")}
                            >
                              Falhou
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
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
