"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { fetchSaasPlans, updateTenantSubscription, type SaasPlanRow } from "@/lib/saas-api"

/** O que o diálogo grava. Uma acção de cada vez: antes, mudar só o plano levava
 *  também 14 dias de trial (o campo vinha preenchido) e uma escola paga voltava a
 *  trial — e ficava bloqueada quando esse trial acabasse. */
export type SubscriptionAction = "plan" | "trial" | "payment"

const PAID_MONTHS = [
  { months: 1, label: "1 mês" },
  { months: 3, label: "3 meses (trimestre)" },
  { months: 6, label: "6 meses (semestre)" },
  { months: 12, label: "12 meses (ano)" },
] as const

type PaidMonths = (typeof PAID_MONTHS)[number]["months"]

interface TenantSubscriptionDialogProps {
  tenant: {
    id: string
    name: string
    slug: string
    trial_ends_at?: string
    plans?: { name?: string; code?: string }
  }
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => Promise<void>
  /** Acção com que o diálogo abre (ex.: «Registar pagamento» de uma escola em atraso). */
  initialAction?: SubscriptionAction
  /** Meses que a escola costuma pagar (periodicidade do perfil de cobrança). */
  defaultPaidMonths?: PaidMonths
}

export function TenantSubscriptionDialog({
  tenant,
  open,
  onOpenChange,
  onUpdated,
  initialAction = "plan",
  defaultPaidMonths = 1,
}: TenantSubscriptionDialogProps) {
  const [plans, setPlans] = useState<SaasPlanRow[]>([])
  const [action, setAction] = useState<SubscriptionAction>(initialAction)
  const [planCode, setPlanCode] = useState(tenant.plans?.code ?? "")
  const [extendDays, setExtendDays] = useState("")
  const [paidMonths, setPaidMonths] = useState<PaidMonths>(defaultPaidMonths)
  const [reference, setReference] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAction(initialAction)
    setPlanCode(tenant.plans?.code ?? "")
    setExtendDays("")
    setPaidMonths(defaultPaidMonths)
    setReference("")
    setError(null)
    void fetchSaasPlans().then((list) => {
      setPlans(list)
      // fetchSaasPlans devolve [] em falha de rede: sem aviso, o select ficava vazio.
      if (list.length === 0) setError("Não foi possível carregar os planos. Tente novamente.")
    })
  }, [open, tenant.id, tenant.plans?.code, initialAction, defaultPaidMonths])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      if (!isSupabaseConfigured()) throw new Error("Supabase não configurado.")
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const payload: Parameters<typeof updateTenantSubscription>[1] = { tenantId: tenant.id }

      if (action === "plan") {
        if (!planCode || planCode === tenant.plans?.code) {
          throw new Error("Seleccione um plano diferente do actual.")
        }
        payload.plan_code = planCode
      } else if (action === "trial") {
        const days = Number.parseInt(extendDays, 10)
        if (!Number.isInteger(days) || days < 1 || days > 90) {
          throw new Error("Indique entre 1 e 90 dias inteiros.")
        }
        payload.extend_trial_days = days
      } else {
        const confirmed = window.confirm(
          `Registar ${paidMonths === 1 ? "1 mês pago" : `${paidMonths} meses pagos`} por «${tenant.name}»? ` +
            "A escola fica activa até ao fim do período.",
        )
        if (!confirmed) return
        payload.confirm_payment_months = paidMonths
        if (reference.trim()) payload.payment_reference = reference.trim()
      }

      const result = await updateTenantSubscription(token, payload)
      if (!result.ok) throw new Error(result.error || "Falha ao gravar.")
      onOpenChange(false)
      await onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gravar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Subscrição — {tenant.name}</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{tenant.slug}</span>
            {tenant.trial_ends_at ? (
              <> · trial até {new Date(tenant.trial_ends_at).toLocaleDateString("pt-AO")}</>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={action} onValueChange={(value) => setAction(value as SubscriptionAction)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="plan">Mudar plano</TabsTrigger>
            <TabsTrigger value="trial">Prolongar trial</TabsTrigger>
            <TabsTrigger value="payment">Pagamento recebido</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-4 py-2">
          {action === "plan" ? (
            <div className="space-y-2">
              <Label htmlFor="tenant-plan">Novo plano</Label>
              <Select value={planCode} onValueChange={setPlanCode}>
                <SelectTrigger id="tenant-plan" className="w-full">
                  <SelectValue placeholder="Seleccionar plano" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.code}>
                      {plan.name} ({plan.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Muda os limites e o preço de tabela. Não mexe no trial nem no período já pago.
              </p>
            </div>
          ) : action === "trial" ? (
            <div className="space-y-2">
              <Label htmlFor="extend-trial">Dias a acrescentar</Label>
              <Input
                id="extend-trial"
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                step={1}
                value={extendDays}
                onChange={(event) => setExtendDays(event.target.value)}
                placeholder="Ex.: 14"
              />
              <p className="text-xs text-muted-foreground">
                Soma à data actual do trial (ou a partir de hoje, se já terminou). A escola fica em
                trial: só para quem ainda não paga.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="paid-months">Período pago</Label>
                <Select
                  value={String(paidMonths)}
                  onValueChange={(value) => setPaidMonths(Number(value) as PaidMonths)}
                >
                  <SelectTrigger id="paid-months" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAID_MONTHS.map((option) => (
                      <SelectItem key={option.months} value={String(option.months)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-reference">Referência (opcional)</Label>
                <Input
                  id="payment-reference"
                  value={reference}
                  maxLength={120}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Nº da transferência, recibo de numerário…"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Para pagamentos sem comprovativo enviado pelo SIGA (numerário, transferência
                confirmada no banco). A escola fica activa até ao fim do período, contado a partir
                de hoje ou do fim do período ainda em curso.
              </p>
            </div>
          )}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving
              ? "A gravar…"
              : action === "plan"
                ? "Mudar plano"
                : action === "trial"
                  ? "Prolongar trial"
                  : "Registar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
