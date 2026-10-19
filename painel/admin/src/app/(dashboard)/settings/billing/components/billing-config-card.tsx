"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { fetchBillingSettings, saveBillingSettings, type SaasPlanRow } from "@/lib/saas-api"
import {
  BILLING_PERIOD_LABEL,
  DEFAULT_BILLING,
  normalizeBillingSettings,
  periodPrice,
  type BillingSettings,
} from "@/lib/billing-periods"

async function accessToken(): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return undefined
  const { data } = await createClient().auth.getSession()
  return data.session?.access_token
}

const kz = (value: number) =>
  new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(
    value,
  )

/**
 * Cobrança da plataforma: interruptor para não cobrar nenhuma escola,
 * dias de experimental e períodos de pagamento com o desconto de cada um.
 * O site, o SIGA e o PayFlow leem daqui os preços por período.
 */
export function BillingConfigCard({ plans }: { plans: SaasPlanRow[] }) {
  const [settings, setSettings] = useState<BillingSettings>(DEFAULT_BILLING)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  useEffect(() => {
    void accessToken()
      .then((token) => fetchBillingSettings(token))
      .then((result) => {
        if (result.ok && result.settings) setSettings(normalizeBillingSettings(result.settings))
        else if (result.error) setMessage({ tone: "error", text: result.error })
        setLoaded(true)
      })
  }, [])

  const example = plans.find((p) => p.code === "professional") ?? plans[0]

  async function save() {
    setSaving(true)
    setMessage(null)
    const result = await saveBillingSettings(await accessToken(), settings)
    if (result.ok && result.settings) {
      setSettings(normalizeBillingSettings(result.settings))
      setMessage({ tone: "ok", text: "Configuração guardada. O site e o SIGA já usam os novos valores." })
    } else {
      setMessage({ tone: "error", text: result.error || "Não foi possível guardar." })
    }
    setSaving(false)
  }

  const update = (patch: Partial<BillingSettings>) => setSettings((s) => ({ ...s, ...patch }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobrança das assinaturas</CardTitle>
        <CardDescription>
          Periodicidades oferecidas às escolas, desconto de cada uma e cobrança ligada ou desligada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4">
          <div className="max-w-xl space-y-1">
            <Label htmlFor="charging-enabled" className="text-base">
              {settings.chargingEnabled ? "Cobrar assinaturas" : "Não cobrar assinaturas"}
            </Label>
            <p className="text-sm text-muted-foreground">
              {settings.chargingEnabled
                ? "As escolas pagam no fim do período experimental."
                : "Nenhuma escola é cobrada nem bloqueada por falta de pagamento. Os planos e limites continuam a valer."}
            </p>
          </div>
          <Switch
            id="charging-enabled"
            checked={settings.chargingEnabled}
            disabled={!loaded}
            onCheckedChange={(checked) => update({ chargingEnabled: checked })}
          />
        </div>

        {!settings.chargingEnabled ? (
          <div className="space-y-2">
            <Label htmlFor="billing-notice">Mensagem às escolas (opcional)</Label>
            <Textarea
              id="billing-notice"
              maxLength={280}
              placeholder="Ex.: Utilização gratuita durante o lançamento, até 31 de Dezembro."
              value={settings.notice ?? ""}
              onChange={(e) => update({ notice: e.target.value || null })}
            />
          </div>
        ) : null}

        <div className="max-w-xs space-y-2">
          <Label htmlFor="trial-days">Período experimental de novas escolas (dias)</Label>
          <Input
            id="trial-days"
            type="number"
            min={0}
            max={90}
            value={settings.trialDays}
            onChange={(e) => update({ trialDays: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Períodos de cobrança</p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Período</th>
                  <th className="px-3 py-2">Oferecido</th>
                  <th className="px-3 py-2">Desconto (%)</th>
                  <th className="px-3 py-2">
                    Exemplo{example ? ` — ${example.name}` : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {settings.periods.map((period, index) => {
                  const price = example ? periodPrice(example.price_aoa_monthly, period.code, settings) : null
                  const setPeriod = (patch: Partial<typeof period>) =>
                    update({
                      periods: settings.periods.map((p, i) => (i === index ? { ...p, ...patch } : p)),
                    })
                  return (
                    <tr key={period.code} className="border-t">
                      <td className="px-3 py-2">{BILLING_PERIOD_LABEL[period.code]}</td>
                      <td className="px-3 py-2">
                        <Switch
                          aria-label={`Oferecer pagamento ${BILLING_PERIOD_LABEL[period.code].toLowerCase()}`}
                          checked={period.enabled}
                          onCheckedChange={(checked) => setPeriod({ enabled: checked })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          max={50}
                          step={0.01}
                          className="h-8 w-24"
                          aria-label={`Desconto ${BILLING_PERIOD_LABEL[period.code].toLowerCase()}`}
                          value={period.discountPct}
                          onChange={(e) =>
                            setPeriod({ discountPct: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {price ? (
                          <>
                            {kz(price.total)}
                            {price.months > 1 ? ` · ${kz(price.perMonth)}/mês` : ""}
                            {price.savingsKz > 0 ? ` · poupa ${kz(price.savingsKz)}` : ""}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Preço = mensal do plano × meses × (1 − desconto), arredondado a 500 Kz. 16,67% no anual
            equivale a 2 meses grátis. O mensal fica sempre disponível se desligar todos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} disabled={!loaded || saving}>
            {saving ? "A guardar…" : "Guardar configuração"}
          </Button>
          {message ? (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={message.tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
            >
              {message.text}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
