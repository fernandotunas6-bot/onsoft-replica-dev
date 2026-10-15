"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Landmark, Save, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { dateLabel, postBillingAction, type TenantOverview } from "./types"

/**
 * Escola pública: não paga o plano, mas só depois de verificada. Enquanto se
 * revê, as cobranças ficam pausadas (a escola trabalha sem bloqueios).
 */
export function PublicTab({
  overview,
  onSaved,
  onGoToBilling,
}: {
  overview: TenantOverview
  onSaved: () => Promise<void>
  onGoToBilling: () => void
}) {
  const { billing, catalog } = overview
  const profile = billing.profile
  const [requirements, setRequirements] = useState<Record<string, boolean>>(profile.publicRequirements)
  const [officialCode, setOfficialCode] = useState(profile.publicOfficialCode ?? "")
  const [supervisingBody, setSupervisingBody] = useState(profile.publicSupervisingBody ?? "")
  const [notes, setNotes] = useState(profile.publicReviewNotes ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRequirements(profile.publicRequirements)
    setOfficialCode(profile.publicOfficialCode ?? "")
    setSupervisingBody(profile.publicSupervisingBody ?? "")
    setNotes(profile.publicReviewNotes ?? "")
  }, [profile])

  const isPublic = profile.institutionType === "public"
  const status = catalog.reviewStatuses.find((s) => s.id === profile.publicReviewStatus)?.label ?? "—"
  const requiredDone = catalog.publicRequirements.filter((r) => r.required && requirements[r.id]).length
  const requiredTotal = catalog.publicRequirements.filter((r) => r.required).length
  const canApprove =
    isPublic && requiredDone === requiredTotal && officialCode.trim() !== "" && supervisingBody.trim() !== ""

  async function submit(decision: "save" | "approve" | "reject") {
    setSaving(true)
    setError(null)
    try {
      await postBillingAction({
        action: "public_review",
        tenantId: overview.tenant.id,
        decision,
        requirements,
        officialCode,
        supervisingBody,
        notes,
      })
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gravar a revisão.")
    } finally {
      setSaving(false)
    }
  }

  if (!isPublic) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="size-4" /> Escola pública
          </CardTitle>
          <CardDescription>
            As escolas do Estado não pagam o plano, depois de verificadas. Esta escola está registada como{" "}
            {catalog.institutionTypes.find((t) => t.id === profile.institutionType)?.label ?? profile.institutionType}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {billing.suggestedInstitutionType === "public" ? (
            <p>No registo, a escola indicou ser pública.</p>
          ) : null}
          <p className="text-muted-foreground">
            Para abrir a revisão, mude o tipo de instituição para «Pública (do Estado)» no separador Cobrança.
            As cobranças ficam pausadas enquanto se revê.
          </p>
          <Button type="button" variant="outline" className="w-fit" onClick={onGoToBilling}>
            Ir para Cobrança
          </Button>
        </CardContent>
      </Card>
    )
  }

  const disabled = saving || !billing.tableReady

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="size-4" /> Requisitos para isenção
          </CardTitle>
          <CardDescription>
            Confirme cada documento antes de aprovar. Os marcados com * são obrigatórios.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="official-code">Código ou número oficial *</Label>
              <Input id="official-code" value={officialCode} onChange={(e) => setOfficialCode(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="supervising">Órgão de tutela *</Label>
              <Input
                id="supervising"
                value={supervisingBody}
                placeholder="Ex.: Direcção Municipal da Educação de Viana"
                onChange={(e) => setSupervisingBody(e.target.value)}
              />
            </div>
          </div>
          <ul className="grid gap-2">
            {catalog.publicRequirements.map((r) => (
              <li key={r.id}>
                <label className="flex gap-3 rounded-md border p-3 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={requirements[r.id] === true}
                    onCheckedChange={(v) => setRequirements((prev) => ({ ...prev, [r.id]: v === true }))}
                  />
                  <span>
                    <span className="font-medium">
                      {r.label}
                      {r.required ? " *" : ""}
                    </span>
                    <span className="block text-xs text-muted-foreground">{r.hint}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="grid gap-1.5">
            <Label htmlFor="review-notes">Notas da revisão</Label>
            <Textarea
              id="review-notes"
              rows={3}
              value={notes}
              placeholder="Documentos recebidos, contactos feitos, motivo de recusa…"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void submit("save")} disabled={disabled}>
              <Save className="size-4" /> Gravar revisão
            </Button>
            <Button type="button" onClick={() => void submit("approve")} disabled={disabled || !canApprove}>
              <CheckCircle2 className="size-4" /> Aprovar isenção
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void submit("reject")}
              disabled={disabled || notes.trim() === ""}
              title={notes.trim() === "" ? "Escreva nas notas porque recusa" : undefined}
            >
              <XCircle className="size-4" /> Recusar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="content-start">
        <CardHeader>
          <CardTitle className="text-base">Estado</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <Badge variant={profile.publicReviewStatus === "approved" ? "default" : "secondary"} className="w-fit">
            {status}
          </Badge>
          <p className="text-muted-foreground">{billing.state.label}</p>
          <p>
            Obrigatórios: {requiredDone}/{requiredTotal}
          </p>
          {profile.publicReviewedAt ? (
            <p className="text-xs text-muted-foreground">Decidido a {dateLabel(profile.publicReviewedAt)}</p>
          ) : null}
          {billing.publicReadiness.recommendedMissing.length ? (
            <div className="text-xs text-muted-foreground">
              Recomendado ainda em falta:
              <ul className="list-disc pl-4">
                {billing.publicReadiness.recommendedMissing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
