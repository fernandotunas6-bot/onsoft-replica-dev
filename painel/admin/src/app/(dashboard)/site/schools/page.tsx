"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SitePage } from "@/components/site/site-page"
import { formatDate, siteApi, type ShowcaseRow } from "@/lib/site-api"

/**
 * Vitrine «Escolas que usam o SIGA Plus». A escola decide no SIGA (Definições → Escola);
 * aqui só se vê quem aceitou e se esconde uma escola, se for preciso.
 */
export default function SiteSchoolsPage() {
  const [schools, setSchools] = useState<ShowcaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const result = await siteApi.showcase()
    setLoading(false)
    if (!result.ok) {
      setNeedsAuth(result.needsAuth)
      setError(result.needsAuth ? null : result.error)
      return
    }
    setNeedsAuth(false)
    setError(null)
    setSchools(result.data.schools)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = term ? schools.filter((s) => s.name.toLowerCase().includes(term)) : schools
    return [...list].sort((a, b) => Number(b.optedIn) - Number(a.optedIn))
  }, [schools, search])

  const onSite = schools.filter((s) => s.optedIn && !s.hidden && s.status === "active").length

  async function toggleHidden(school: ShowcaseRow, hidden: boolean) {
    const reason = hidden ? window.prompt("Motivo (fica só no ADMIN):") ?? undefined : undefined
    const result = await siteApi.setShowcaseHidden(school.id, hidden, reason)
    if (!result.ok) setError(result.error)
    await load()
  }

  return (
    <SitePage
      title="Escolas no site"
      description={`Só aparecem as escolas activas que aceitaram no SIGA (Definições → Escola). Agora no site: ${onSite}.`}
      sitePath="/#schools"
      next="/site/schools"
      needsAuth={needsAuth}
      error={error}
    >
      <Input
        placeholder="Procurar escola…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="max-w-sm"
        aria-label="Procurar escola"
      />
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Escola</TableHead>
                <TableHead>Escolha da escola</TableHead>
                <TableHead className="text-right">Esconder do site</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    A carregar…
                  </TableCell>
                </TableRow>
              ) : visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    Nenhuma escola.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((school) => (
                  <TableRow key={school.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {school.logoUrl ? (
                          <img src={school.logoUrl} alt="" className="size-8 rounded object-contain" />
                        ) : (
                          <div className="size-8 rounded bg-muted" />
                        )}
                        <div>
                          <div className="font-medium">{school.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {school.city || "Sem cidade"} · {school.status}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {school.optedIn ? (
                        <Badge>Aceitou · {formatDate(school.optedInAt)}</Badge>
                      ) : (
                        <Badge variant="secondary">Não aceitou</Badge>
                      )}
                      {school.hidden && school.hiddenReason ? (
                        <div className="mt-1 text-xs text-muted-foreground">Escondida: {school.hiddenReason}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={school.hidden}
                        onCheckedChange={(value) => void toggleHidden(school, value)}
                        aria-label={`Esconder ${school.name} do site`}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </SitePage>
  )
}
