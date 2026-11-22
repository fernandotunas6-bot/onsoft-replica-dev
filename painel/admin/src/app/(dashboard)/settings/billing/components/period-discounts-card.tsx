"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { fetchPeriodDiscounts, savePeriodDiscounts, type PeriodDiscounts } from "@/lib/saas-api"

const PERIODS: Array<{ id: keyof PeriodDiscounts; label: string }> = [
  { id: "quarterly", label: "Trimestral" },
  { id: "semiannual", label: "Semestral" },
  { id: "yearly", label: "Anual" },
]

async function accessToken(): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return undefined
  const { data } = await createClient().auth.getSession()
  return data.session?.access_token
}

/**
 * Descontos por periodicidade de toda a plataforma (porte da #210). O valor cobrado às
 * escolas já os usava, mas não havia onde os mudar. O desconto próprio de cada escola
 * continua na ficha da escola, além deste.
 */
export function PeriodDiscountsCard() {
  const [values, setValues] = useState<Record<keyof PeriodDiscounts, string>>({
    quarterly: "",
    semiannual: "",
    yearly: "",
  })
  const [max, setMax] = useState(60)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  useEffect(() => {
    void (async () => {
      const result = await fetchPeriodDiscounts(await accessToken())
      if (result.discounts) {
        setValues({
          quarterly: String(result.discounts.quarterly),
          semiannual: String(result.discounts.semiannual),
          yearly: String(result.discounts.yearly),
        })
        if (result.maxDiscountPct) setMax(result.maxDiscountPct)
      } else {
        setMessage({ kind: "error", text: result.error ?? "Não foi possível ler os descontos." })
      }
      setLoading(false)
    })()
  }, [])

  async function save() {
    const discounts = {} as PeriodDiscounts
    for (const { id, label } of PERIODS) {
      const value = Number(values[id].replace(",", "."))
      if (!Number.isFinite(value) || value < 0 || value > max) {
        setMessage({ kind: "error", text: `${label}: indique um desconto entre 0 e ${max} %.` })
        return
      }
      discounts[id] = value
    }
    setSaving(true)
    setMessage(null)
    const result = await savePeriodDiscounts(await accessToken(), discounts)
    setSaving(false)
    setMessage(
      result.discounts
        ? { kind: "ok", text: "Descontos guardados. Aplicam-se às próximas cobranças." }
        : { kind: "error", text: result.error ?? "Não foi possível guardar." },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Descontos por periodicidade</CardTitle>
        <CardDescription>
          Desconto da plataforma quando a escola paga vários meses de uma vez. A mensalidade é a
          referência, sem desconto. O desconto próprio de cada escola soma-se a este, na ficha da
          escola.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {PERIODS.map(({ id, label }) => (
            <div key={id} className="space-y-1.5">
              <Label htmlFor={`discount-${id}`}>{label} (%)</Label>
              <Input
                id={`discount-${id}`}
                inputMode="decimal"
                value={values[id]}
                disabled={loading || saving}
                onChange={(event) => setValues((current) => ({ ...current, [id]: event.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void save()} disabled={loading || saving}>
            {saving ? "A guardar…" : "Guardar descontos"}
          </Button>
          {message ? (
            <p
              role={message.kind === "error" ? "alert" : "status"}
              className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
            >
              {message.text}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
