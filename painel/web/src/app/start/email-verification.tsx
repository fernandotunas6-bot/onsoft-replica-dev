import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { requestSignupEmailCode, verifySignupEmailCode, type PlanCode } from "@/lib/saas-api"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Confirmação do e-mail do administrador por código de 6 dígitos. Sem ela o
 * servidor recusa criar a escola: só quem recebe o e-mail pode ficar com a
 * conta.
 */
export function EmailVerification({
  email,
  sessionId,
  verifiedEmail,
  onVerified,
  context,
}: {
  email: string
  sessionId: string
  verifiedEmail: string | null
  onVerified: (email: string, token: string) => void
  context: { contactName?: string; contactPhone?: string; schoolName?: string; planCode?: PlanCode }
}) {
  const normalized = email.trim().toLowerCase()
  const valid = EMAIL_RE.test(normalized)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState<"send" | "verify" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  if (verifiedEmail && verifiedEmail === normalized) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
        <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
        E-mail confirmado. A conta fica com este endereço.
      </p>
    )
  }

  const codeSentHere = sentTo === normalized

  async function send() {
    setBusy("send")
    setError(null)
    const result = await requestSignupEmailCode(normalized, sessionId)
    setBusy(null)
    if (result.ok) {
      setSentTo(normalized)
      setCode("")
      setCooldown(result.cooldownSeconds || 60)
    } else {
      setError(result.error)
      if (result.cooldownSeconds) setCooldown(Math.min(result.cooldownSeconds, 120))
    }
  }

  async function verify() {
    setBusy("verify")
    setError(null)
    const result = await verifySignupEmailCode({ email: normalized, code, sessionId, ...context })
    setBusy(null)
    if (result.ok) onVerified(normalized, result.token)
    else setError(result.error)
  }

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-start gap-2 text-sm">
        <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p>
          Confirme o e-mail: enviamos um código de 6 dígitos para{" "}
          <strong>{valid ? normalized : "o e-mail acima"}</strong>. Só quem o recebe pode ficar com a conta da escola.
        </p>
      </div>
      {codeSentHere ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            aria-label="Código de confirmação"
            className="w-32 font-mono tracking-[0.3em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                if (code.length === 6) void verify()
              }
            }}
          />
          <Button type="button" size="sm" onClick={() => void verify()} disabled={code.length !== 6 || busy !== null}>
            {busy === "verify" ? <Loader2 className="size-4 animate-spin" /> : null}
            Confirmar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void send()} disabled={cooldown > 0 || busy !== null}>
            {cooldown > 0 ? `Reenviar (${cooldown}s)` : "Reenviar código"}
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => void send()} disabled={!valid || busy !== null || cooldown > 0}>
          {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : null}
          {cooldown > 0 ? `Enviar código (${cooldown}s)` : "Enviar código"}
        </Button>
      )}
      {codeSentHere ? (
        <p className="text-xs text-muted-foreground">
          Não chegou? Veja a pasta de spam. O código vale 5 minutos.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
