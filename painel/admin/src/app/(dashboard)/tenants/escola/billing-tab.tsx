"use client"

import { useEffect, useState } from "react"
import { PauseCircle, PlayCircle, Save } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { postBillingAction, kz, dateLabel, type BillingProfile, type TenantOverview } from "./types"

type Draft = {
  institutionType: string
  pricingModel: BillingProfile["pricingModel"]
  pricePerStudentAoa: string
  minBillableStudents: string
  fixedAmountAoa: string
  billingPeriod: BillingProfile["billingPeriod"]
  discountPct: string
  dueDay: string
  paymentTermsDays: string
  graceDays: string
  autoSuspend: boolean
  paymentMethods: string[]
  invoiceByEmail: boolean
  billingContactName: string
  billingEmail: string
  billingPhone: string
  billingNif: string
  billingAddress: string
  notes: string
}

function draftFrom(p: BillingProfile): Draft {
  const s = (v: number | string | null | undefined) => (v == null ? "" : String(v))
  return {
    institutionType: p.institutionType,
    pricingModel: p.pricingModel,
    pricePerStudentAoa: s(p.pricePerStudentAoa),
    minBillableStudents: s(p.minBillableStudents),
    fixedAmountAoa: s(p.fixedAmountAoa),
    billingPeriod: p.billingPeriod,
    discountPct: s(p.discountPct),
    dueDay: s(p.dueDay),
    paymentTermsDays: s(p.paymentTermsDays),
    graceDays: s(p.graceDays),
    autoSuspend: p.autoSuspend,
    paymentMethods: p.paymentMethods,
    invoiceByEmail: p.invoiceByEmail,
    billingContactName: p.billingContactName ?? "",
    billingEmail: p.billingEmail ?? "",
    billingPhone: p.billingPhone ?? "",
    billingNif: p.billingNif ?? "",
    billingAddress: p.billingAddress ?? "",
    notes: p.notes ?? "",
  }
}

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")))

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function BillingTab({
  overview,
  onSaved,
}: {
  overview: TenantOverview
  onSaved: () => Promise<void>
}) {
  const { billing, catalog } = overview
  const [draft, setDraft] = useState<Draft>(() => draftFrom(billing.profile))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pauseReason, setPauseReason] = useState("")
  const [pauseUntil, setPauseUntil] = useState("")

  useEffect(() => setDraft(draftFrom(billing.profile)), [billing.profile])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(false)
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function run(action: () => Promise<void>) {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await action()
      await onSaved()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gravar.")
    } finally {
      setSaving(false)
    }
  }

  const save = () =>
    run(() =>
      postBillingAction({
        action: "save",
        tenantId: overview.tenant.id,
        profile: {
          institutionType: draft.institutionType,
          pricingModel: draft.pricingModel,
          pricePerStudentAoa: numOrNull(draft.pricePerStudentAoa),
          minBillableStudents: numOrNull(draft.minBillableStudents) ?? 0,
          fixedAmountAoa: numOrNull(draft.fixedAmountAoa),
          billingPeriod: draft.billingPeriod,
          discountPct: numOrNull(draft.discountPct) ?? 0,
          dueDay: numOrNull(draft.dueDay) ?? 10,
          paymentTermsDays: numOrNull(draft.paymentTermsDays) ?? 15,
          graceDays: numOrNull(draft.graceDays) ?? 7,
          autoSuspend: draft.autoSuspend,
          paymentMethods: draft.paymentMethods,
          invoiceByEmail: draft.invoiceByEmail,
          billingContactName: draft.billingContactName,
          billingEmail: draft.billingEmail,
          billingPhone: draft.billingPhone,
          billingNif: draft.billingNif,
          billingAddress: draft.billingAddress,
          notes: draft.notes,
        },
      }),
    )

  const pause = () =>
    run(async () => {
      await postBillingAction({
        action: "pause",
        tenantId: overview.tenant.id,
        reason: pauseReason,
        until: pauseUntil || null,
      })
      setPauseReason("")
      setPauseUntil("")
    })

  const resume = () => run(() => postBillingAction({ action: "resume", tenantId: overview.tenant.id }))

  const disabled = saving || !billing.tableReady
  const toggleMethod = (id: string, on: boolean) =>
    set(
      "paymentMethods",
      on ? [...new Set([...draft.paymentMethods, id])] : draft.paymentMethods.filter((m) => m !== id),
    )
  const periodDiscount = (id: string) =>
    billing.periodDiscounts[id] ?? catalog.periods.find((p) => p.id === id)?.defaultDiscountPct ?? 0

  return (
    <div className="grid gap-4">
      {!billing.tableReady ? (
        <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          A cobrança por escola ainda não está activa na base de dados: falta aplicar a migração{" "}
          <code className="font-mono text-xs">{billing.migration}</code>. Até lá estes valores são só
          os de omissão e não se podem gravar.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Modelo de cobrança</CardTitle>
              <CardDescription>Como se calcula o valor que a escola paga.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Modelo de cobrança">
                {catalog.pricingModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    role="radio"
                    aria-checked={draft.pricingModel === model.id}
                    onClick={() => set("pricingModel", model.id as Draft["pricingModel"])}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                      draft.pricingModel === model.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="font-medium">{model.label}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{model.hint}</span>
                  </button>
                ))}
              </div>

              {draft.pricingModel === "per_student" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="pps" label="Valor por aluno activo (Kz/mês)">
                    <Input
                      id="pps"
                      inputMode="decimal"
                      value={draft.pricePerStudentAoa}
                      onChange={(e) => set("pricePerStudentAoa", e.target.value)}
                    />
                  </Field>
                  <Field
                    id="min"
                    label="Mínimo facturável (alunos)"
                    hint="Abaixo deste número, cobra-se o mínimo."
                  >
                    <Input
                      id="min"
                      inputMode="numeric"
                      value={draft.minBillableStudents}
                      onChange={(e) => set("minBillableStudents", e.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
              {draft.pricingModel === "fixed" ? (
                <Field id="fixed" label="Valor fixo (Kz/mês)">
                  <Input
                    id="fixed"
                    inputMode="decimal"
                    value={draft.fixedAmountAoa}
                    onChange={(e) => set("fixedAmountAoa", e.target.value)}
                  />
                </Field>
              ) : null}
              {draft.pricingModel === "plan" ? (
                <p className="text-sm text-muted-foreground">
                  Plano {overview.tenant.plans?.name ?? "—"}: {kz(overview.tenant.plans?.price_aoa_monthly)} /mês
                  {overview.tenant.plans?.price_aoa_yearly
                    ? ` · ${kz(overview.tenant.plans.price_aoa_yearly)} /ano`
                    : ""}
                  . Muda-se o plano em «Plano e assinatura».
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="period" label="Periodicidade">
                  <select
                    id="period"
                    className={selectClass}
                    value={draft.billingPeriod}
                    onChange={(e) => set("billingPeriod", e.target.value as Draft["billingPeriod"])}
                  >
                    {catalog.periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                        {periodDiscount(p.id) ? ` (−${periodDiscount(p.id)}%)` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="discount" label="Desconto da escola (%)" hint="Além do da periodicidade.">
                  <Input
                    id="discount"
                    inputMode="decimal"
                    value={draft.discountPct}
                    onChange={(e) => set("discountPct", e.target.value)}
                  />
                </Field>
                <Field id="itype" label="Tipo de instituição">
                  <select
                    id="itype"
                    className={selectClass}
                    value={draft.institutionType}
                    onChange={(e) => set("institutionType", e.target.value)}
                  >
                    {catalog.institutionTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {draft.institutionType === "public" && billing.profile.institutionType !== "public" ? (
                <p className="text-xs text-muted-foreground">
                  Ao gravar como Pública, abre-se a revisão (separador «Escola pública») e as cobranças
                  ficam pausadas enquanto se revê.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prazos</CardTitle>
              <CardDescription>
                A factura sai com antecedência, vence num dia fixo e há tolerância antes de suspender.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <Field id="due" label="Dia de vencimento" hint="1 a 28 (existe em todos os meses).">
                <Input id="due" inputMode="numeric" value={draft.dueDay} onChange={(e) => set("dueDay", e.target.value)} />
              </Field>
              <Field id="terms" label="Prazo de pagamento (dias)" hint="Emissão antes do vencimento.">
                <Input
                  id="terms"
                  inputMode="numeric"
                  value={draft.paymentTermsDays}
                  onChange={(e) => set("paymentTermsDays", e.target.value)}
                />
              </Field>
              <Field id="grace" label="Tolerância (dias)" hint="Depois do vencimento, antes de suspender.">
                <Input id="grace" inputMode="numeric" value={draft.graceDays} onChange={(e) => set("graceDays", e.target.value)} />
              </Field>
              <div className="flex items-center gap-3 sm:col-span-3">
                <Switch
                  id="autosuspend"
                  checked={draft.autoSuspend}
                  onCheckedChange={(v) => set("autoSuspend", v)}
                />
                <Label htmlFor="autosuspend" className="font-normal">
                  Passar a só consulta quando acaba a tolerância sem pagamento
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Modos de pagamento</CardTitle>
              <CardDescription>O que a escola pode usar para pagar o plano.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {catalog.paymentMethods.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 rounded-md border p-2.5 text-sm">
                    <Checkbox
                      checked={draft.paymentMethods.includes(m.id)}
                      onCheckedChange={(v) => toggleMethod(m.id, v === true)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="invoice-email"
                  checked={draft.invoiceByEmail}
                  onCheckedChange={(v) => set("invoiceByEmail", v)}
                />
                <Label htmlFor="invoice-email" className="font-normal">
                  Enviar a factura por e-mail
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados de facturação</CardTitle>
              <CardDescription>A quem se envia a factura e em nome de quem sai.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field id="bname" label="Responsável financeiro">
                <Input id="bname" value={draft.billingContactName} onChange={(e) => set("billingContactName", e.target.value)} />
              </Field>
              <Field id="bemail" label="E-mail de facturação">
                <Input id="bemail" type="email" value={draft.billingEmail} onChange={(e) => set("billingEmail", e.target.value)} />
              </Field>
              <Field id="bphone" label="Telefone">
                <Input id="bphone" value={draft.billingPhone} onChange={(e) => set("billingPhone", e.target.value)} />
              </Field>
              <Field id="bnif" label="NIF de facturação" hint={overview.school?.nif ? `NIF da escola: ${overview.school.nif}` : undefined}>
                <Input id="bnif" value={draft.billingNif} onChange={(e) => set("billingNif", e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field id="baddr" label="Morada de facturação">
                  <Input id="baddr" value={draft.billingAddress} onChange={(e) => set("billingAddress", e.target.value)} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field id="notes" label="Notas internas" hint="Só a equipa da plataforma vê.">
                  <Textarea id="notes" rows={3} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
                </Field>
              </div>
            </CardContent>
          </Card>

          {error ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="button" onClick={() => void save()} disabled={disabled}>
              <Save className="size-4" />
              {saving ? "A gravar…" : "Gravar cobrança"}
            </Button>
            {saved ? <span className="text-sm text-muted-foreground">Gravado.</span> : null}
          </div>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Próxima cobrança</CardTitle>
              <CardDescription>Com o que está gravado e os alunos activos de hoje.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <Badge variant={billing.state.charging ? "default" : "secondary"} className="w-fit">
                {billing.state.label}
              </Badge>
              <p className="text-2xl font-semibold tabular-nums">{kz(billing.charge.total)}</p>
              {billing.schedule.overdue ? (
                <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                  Pagamento em atraso: a tolerância acabou e a escola passa a só consulta na próxima
                  verificação diária. Confirme o pagamento em Subscrições para a manter activa.
                </p>
              ) : null}
              <ul className="grid gap-0.5 text-xs text-muted-foreground">
                {billing.charge.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {billing.state.charging ? (
                <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
                  <dt className="text-muted-foreground">Emissão</dt>
                  <dd>{dateLabel(billing.schedule.issueOn)}</dd>
                  <dt className="text-muted-foreground">Vencimento</dt>
                  <dd>{dateLabel(billing.schedule.dueOn)}</dd>
                  <dt className="text-muted-foreground">Pago até</dt>
                  <dd>{dateLabel(billing.schedule.paidUntil)}</dd>
                  <dt className="text-muted-foreground">Só consulta após</dt>
                  <dd>
                    {!billing.profile.autoSuspend
                      ? "Nunca (manual)"
                      : billing.schedule.suspendAfter
                        ? dateLabel(billing.schedule.suspendAfter)
                        : "Sem período pago"}
                  </dd>
                </dl>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pausar cobranças</CardTitle>
              <CardDescription>
                Enquanto pausada, a escola não paga e o fim do trial ou um atraso não a bloqueiam.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {billing.profile.billingPaused ? (
                <>
                  <p className="text-sm">
                    Pausada{billing.profile.billingPausedUntil ? ` até ${dateLabel(billing.profile.billingPausedUntil)}` : " sem data de fim"}
                    {billing.profile.billingPausedReason ? ` — ${billing.profile.billingPausedReason}` : ""}.
                  </p>
                  <Button type="button" variant="outline" onClick={() => void resume()} disabled={disabled}>
                    <PlayCircle className="size-4" />
                    Retomar cobranças
                  </Button>
                </>
              ) : (
                <>
                  <Field id="preason" label="Motivo">
                    <Input
                      id="preason"
                      value={pauseReason}
                      placeholder="Ex.: acordo com o Gabinete Provincial"
                      onChange={(e) => setPauseReason(e.target.value)}
                    />
                  </Field>
                  <Field id="puntil" label="Até (opcional)" hint="Sem data, fica pausada até ser retomada.">
                    <Input id="puntil" type="date" value={pauseUntil} onChange={(e) => setPauseUntil(e.target.value)} />
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void pause()}
                    disabled={disabled || pauseReason.trim().length < 3}
                  >
                    <PauseCircle className="size-4" />
                    Pausar cobranças
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
