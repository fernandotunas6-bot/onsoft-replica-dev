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
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { fetchSaasPlans, updateTenantSubscription, type SaasPlanRow } from "@/lib/saas-api"

interface TenantSubscriptionDialogProps {
  tenant: {
    id: string
    name: string
    slug: string
    trial_ends_at?: string
    plans?: { name?: string; code?: string }
    billing_exempt?: boolean
    billing_exempt_reason?: string | null
  }
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => Promise<void>
}

export function TenantSubscriptionDialog({
  tenant,
  open,
  onOpenChange,
  onUpdated,
}: TenantSubscriptionDialogProps) {
  const [plans, setPlans] = useState<SaasPlanRow[]>([])
  const [planCode, setPlanCode] = useState(tenant.plans?.code ?? "")
  const [extendDays, setExtendDays] = useState("")
  const [exempt, setExempt] = useState(tenant.billing_exempt === true)
  const [exemptReason, setExemptReason] = useState(tenant.billing_exempt_reason ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPlanCode(tenant.plans?.code ?? "")
    setExtendDays("")
    setExempt(tenant.billing_exempt === true)
    setExemptReason(tenant.billing_exempt_reason ?? "")
    setError(null)
    void fetchSaasPlans().then(setPlans)
  }, [open, tenant.id, tenant.plans?.code, tenant.billing_exempt, tenant.billing_exempt_reason])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      if (!isSupabaseConfigured()) throw new Error("Supabase não configurado.")
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const extend = extendDays.trim() ? Number(extendDays) : undefined
      const payload: {
        tenantId: string
        plan_code?: string
        extend_trial_days?: number
        billing_exempt?: boolean
        billing_exempt_reason?: string
      } = {
        tenantId: tenant.id,
      }
      if (planCode && planCode !== tenant.plans?.code) payload.plan_code = planCode
      if (extend && Number.isFinite(extend) && extend > 0) payload.extend_trial_days = extend
      const reasonChanged = exempt && exemptReason.trim() !== (tenant.billing_exempt_reason ?? "")
      if (exempt !== (tenant.billing_exempt === true) || reasonChanged) {
        payload.billing_exempt = exempt
        if (exempt && exemptReason.trim()) payload.billing_exempt_reason = exemptReason.trim()
      }
      if (!payload.plan_code && !payload.extend_trial_days && payload.billing_exempt == null) {
        throw new Error("Seleccione um plano diferente, indique dias de trial ou mude a isenção.")
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
            Alterar plano, prolongar trial ou isentar de pagamento a escola <span className="font-mono">{tenant.slug}</span>.
            {tenant.trial_ends_at ? (
              <>
                {" "}
                Trial actual até{" "}
                {new Date(tenant.trial_ends_at).toLocaleDateString("pt-AO")}.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="tenant-plan">Plano</Label>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="extend-trial">Prolongar trial (dias)</Label>
            <Input
              id="extend-trial"
              type="number"
              min={1}
              max={90}
              value={extendDays}
              onChange={(event) => setExtendDays(event.target.value)}
              placeholder="14"
            />
            <p className="text-xs text-muted-foreground">
              Soma dias à data actual de trial (ou a partir de hoje se expirado).
            </p>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="billing-exempt">Não cobrar esta escola</Label>
                <p className="text-xs text-muted-foreground">
                  Parceria, piloto ou escola pública: não é bloqueada no fim do trial nem por atraso.
                </p>
              </div>
              <Switch id="billing-exempt" checked={exempt} onCheckedChange={setExempt} />
            </div>
            {exempt ? (
              <Input
                aria-label="Motivo da isenção"
                placeholder="Motivo (ex.: piloto até Julho)"
                maxLength={200}
                value={exemptReason}
                onChange={(e) => setExemptReason(e.target.value)}
              />
            ) : null}
          </div>

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
            {saving ? "A gravar…" : "Gravar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
