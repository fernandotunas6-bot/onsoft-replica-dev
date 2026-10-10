"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ExternalLink, Library, RefreshCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  fetchEducationCatalog,
  type CatalogVerificationStatus,
  type EducationCatalogOverview,
} from "@/lib/saas-api"

/**
 * Inteligência Educacional → Catálogos globais.
 *
 * Só consulta: o que o catálogo do SIGA tem carregado, por país, com a fonte e
 * o nível de confiança de cada registo. Nada aqui é estimado — vem de
 * GET /api/saas/education-catalog, gerado dos mesmos dados que a escola usa.
 * Aprovar propostas e publicar versões fica para quando as tabelas do
 * catálogo estiverem aplicadas na base.
 */

const STATUS_VARIANT: Record<CatalogVerificationStatus, "default" | "secondary" | "outline" | "destructive"> = {
  official_verified: "default",
  institutional_approved: "secondary",
  in_review: "outline",
  outdated: "destructive",
  archived: "destructive",
}

const STATUS_LABEL: Record<CatalogVerificationStatus, string> = {
  official_verified: "Oficial verificado",
  institutional_approved: "Institucional aprovado",
  in_review: "Em revisão",
  outdated: "Desactualizado",
  archived: "Arquivado",
}

function StatusBadge({ status, label }: { status: CatalogVerificationStatus; label?: string }) {
  return <Badge variant={STATUS_VARIANT[status]}>{label ?? STATUS_LABEL[status]}</Badge>
}

export default function EducationCatalogPage() {
  const [catalog, setCatalog] = useState<EducationCatalogOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [country, setCountry] = useState("all")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await fetchEducationCatalog()
    if (!result.ok || !result.catalog) {
      setError(result.error || "Não foi possível carregar o catálogo.")
      setCatalog(null)
    } else {
      setCatalog(result.catalog)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const stages = useMemo(
    () => (catalog?.stages ?? []).filter((s) => country === "all" || s.country === country),
    [catalog, country],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="px-4 lg:px-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Library className="size-6" aria-hidden /> Catálogos globais
          </h1>
          <p className="text-muted-foreground">
            Inteligência educacional: classificações ISCED, etapas de ensino por país, cursos e
            disciplinas de referência — com fonte e nível de confiança.
            {catalog ? ` Versão ${catalog.version}.` : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden /> Actualizar
        </Button>
      </div>

      {error ? (
        <div className="px-4 lg:px-6">
          <Card>
            <CardContent className="py-6 text-sm text-destructive" role="alert">
              {error}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {catalog ? (
        <div className="px-4 lg:px-6 flex flex-col gap-4">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {[
              ["Países com etapas", `${catalog.totals.countriesWithStages} / ${catalog.totals.countries}`],
              ["Etapas de ensino", catalog.totals.stages],
              ["Disciplinas de referência", catalog.totals.subjects],
              ["Cursos de referência", catalog.totals.courses],
            ].map(([label, value]) => (
              <Card key={String(label)}>
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold tabular-nums">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cobertura real por país</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>País</TableHead>
                    <TableHead className="text-right">Etapas</TableHead>
                    <TableHead className="text-right">Classes/anos</TableHead>
                    <TableHead className="text-right">Etapas com plano</TableHead>
                    <TableHead className="text-right">Disciplinas nos planos</TableHead>
                    <TableHead className="text-right">Cursos</TableHead>
                    <TableHead>Confiança</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catalog.coverage.map((c) => (
                    <TableRow key={c.country}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.stages}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.grades}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.stagesWithPlan}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.subjectsInPlans}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.courses}</TableCell>
                      <TableCell>
                        {c.stages ? (
                          <div className="flex flex-wrap gap-1">
                            {(Object.keys(c.byStatus) as CatalogVerificationStatus[]).map((s) => (
                              <StatusBadge key={s} status={s} label={`${STATUS_LABEL[s]} · ${c.byStatus[s]}`} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Por carregar</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Etapas de ensino</CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="catalog-country" className="text-xs">
                  País
                </Label>
                <select
                  id="catalog-country"
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  <option value="all">Todos</option>
                  {catalog.coverage
                    .filter((c) => c.stages > 0)
                    .map((c) => (
                      <option key={c.country} value={c.country}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa</TableHead>
                    <TableHead>ISCED</TableHead>
                    <TableHead>Via</TableHead>
                    <TableHead>Classes/anos</TableHead>
                    <TableHead className="text-right">Cursos</TableHead>
                    <TableHead className="text-right">Entradas do plano</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stages.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="max-w-sm whitespace-normal">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.id} · {s.version}
                          {s.notes ? ` · ${s.notes}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.isced} · {s.iscedName}
                      </TableCell>
                      <TableCell className="text-xs">{s.track}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {s.grades.length ? `${s.grades[0]}–${s.grades[s.grades.length - 1]}` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.courses}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.planEntries}</TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} label={s.statusLabel} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fontes</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {catalog.sources.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.authority} · {s.version}
                        {s.country ? ` · ${s.country}` : ""} · registado a {s.recordedOn}
                      </p>
                      {s.notes ? <p className="text-xs text-muted-foreground">{s.notes}</p> : null}
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                        >
                          Abrir fonte <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : null}
                    </div>
                    <StatusBadge status={s.status} label={s.statusLabel} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
