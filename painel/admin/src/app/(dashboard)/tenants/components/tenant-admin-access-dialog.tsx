"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Copy, Info, KeyRound, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { getSaasApiUrl } from "@/lib/ecosystem-urls"

/** Espelha `SchoolAdminAccessIssue` (src/features/saas/school-admin-access-rules.ts no SIGA). */
interface AccessIssue {
  code: string
  severity: "blocker" | "warning" | "info"
  fix: "auto" | "access_link" | "subscription" | "user" | "manual"
  message: string
  email?: string | null
}

interface AccessReport {
  school: { id: string; name: string; status: string | null } | null
  admins: { userId: string; email: string | null; roleCodes: string[]; lastSignInAt: string | null }[]
  issues: AccessIssue[]
  ready: boolean
}

interface RepairResult {
  actions: string[]
  accessLinks: { email: string; url: string; emailed: boolean; emailError: string | null }[]
  after: AccessIssue[]
  ready: boolean
}

const FIX_LABEL: Record<AccessIssue["fix"], string> = {
  auto: "Corrige-se ao reparar",
  access_link: "Gerar link de acesso",
  subscription: "Gerir → estender trial ou activar plano",
  user: "O administrador faz no SIGA",
  manual: "Decisão da equipa",
}

async function authHeaders(json = false): Promise<HeadersInit> {
  const headers: Record<string, string> = json ? { "Content-Type": "application/json" } : {}
  if (!isSupabaseConfigured()) return headers
  const { data } = await createClient().auth.getSession()
  if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`
  return headers
}

/**
 * Acesso do administrador de uma escola: diagnóstico e reparação.
 * Corrige as escolas já criadas que ficaram sem acesso administrativo (contas
 * sem perfil, papéis sem permissões, directores que nunca receberam o convite).
 * Nunca concede Administração Global.
 */
export function TenantAdminAccessDialog({
  tenant,
  open,
  onOpenChange,
  onManageSubscription,
}: {
  tenant: { id: string; name: string; slug: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  onManageSubscription: () => void
}) {
  const [report, setReport] = useState<AccessReport | null>(null)
  const [result, setResult] = useState<RepairResult | null>(null)
  const [issueLinks, setIssueLinks] = useState(true)
  const [loading, setLoading] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        getSaasApiUrl(`/api/saas/tenants/admin-access?tenantId=${encodeURIComponent(tenant.id)}`),
        { headers: await authHeaders() },
      )
      const data = (await res.json().catch(() => ({}))) as AccessReport & { error?: string }
      if (!res.ok) throw new Error(data.error || "Não foi possível verificar o acesso.")
      setReport(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha de rede.")
    } finally {
      setLoading(false)
    }
  }, [tenant.id])

  useEffect(() => {
    if (!open) return
    setResult(null)
    void load()
  }, [open, load])

  async function repair() {
    setRepairing(true)
    setError(null)
    try {
      const res = await fetch(getSaasApiUrl("/api/saas/tenants/admin-access"), {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify({ tenantId: tenant.id, issueAccessLinks: issueLinks }),
      })
      const data = (await res.json().catch(() => ({}))) as RepairResult & { error?: string }
      if (!res.ok) throw new Error(data.error || "Não foi possível reparar o acesso.")
      setResult(data)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha de rede.")
    } finally {
      setRepairing(false)
    }
  }

  const issues = report?.issues ?? []
  const canRepair = issues.some((i) => i.fix === "auto" || (issueLinks && i.fix === "access_link"))
  const needsSubscription = issues.some((i) => i.fix === "subscription")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Acesso do administrador · {tenant.name}</DialogTitle>
          <DialogDescription>
            O administrador entra no painel administrativo e no portal escolar com a mesma conta. A
            Administração Global continua reservada à equipa da plataforma.
          </DialogDescription>
        </DialogHeader>

        {loading && !report ? (
          <p className="text-sm text-muted-foreground">A verificar…</p>
        ) : report ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {report.ready ? (
                <Badge className="gap-1">
                  <CheckCircle2 className="size-3.5" /> Pronta a entrar
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="size-3.5" /> Acesso bloqueado
                </Badge>
              )}
              <span className="text-muted-foreground">
                {report.admins.length} administrador(es):{" "}
                {report.admins.map((a) => a.email ?? a.userId).join(", ") || "nenhum"}
              </span>
            </div>

            {issues.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada a corrigir.</p>
            ) : (
              <ul className="space-y-2">
                {issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className="flex gap-2 rounded-md border p-2.5 text-sm">
                    {issue.severity === "info" ? (
                      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <AlertTriangle
                        className={
                          issue.severity === "blocker"
                            ? "mt-0.5 size-4 shrink-0 text-destructive"
                            : "mt-0.5 size-4 shrink-0 text-amber-600"
                        }
                      />
                    )}
                    <div className="min-w-0">
                      <p>
                        {issue.message}
                        {issue.email ? <span className="text-muted-foreground"> · {issue.email}</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">{FIX_LABEL[issue.fix]}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {issues.some((i) => i.fix === "access_link") ? (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="issue-links"
                  checked={issueLinks}
                  onCheckedChange={(checked) => setIssueLinks(checked === true)}
                />
                <Label htmlFor="issue-links" className="text-sm font-normal leading-snug">
                  Gerar link de definição de senha para quem nunca entrou (e tentar enviá-lo por e-mail)
                </Label>
              </div>
            ) : null}

            {result ? (
              <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
                {result.actions.length ? (
                  <ul className="list-disc pl-5">
                    {result.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Não havia correcções automáticas por fazer.</p>
                )}
                {result.accessLinks.map((link) => (
                  <div key={link.email} className="space-y-1 rounded border bg-background p-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium">
                      <KeyRound className="size-3.5" /> {link.email}
                      {link.emailed ? " · enviado por e-mail" : " · entregue este link ao director"}
                    </p>
                    <div className="flex gap-2">
                      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                        {link.url}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void navigator.clipboard.writeText(link.url)}
                      >
                        <Copy className="size-3.5" /> Copiar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          {needsSubscription ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false)
                onManageSubscription()
              }}
            >
              Gerir assinatura
            </Button>
          ) : null}
          <Button type="button" onClick={() => void repair()} disabled={!canRepair || repairing || loading}>
            <Wrench className="size-4" />
            {repairing ? "A reparar…" : "Reparar acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
