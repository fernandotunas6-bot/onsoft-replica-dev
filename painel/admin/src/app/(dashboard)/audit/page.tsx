"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { RefreshCw, ScrollText } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { fetchSaasAuditLogs, type SaasAuditLogRow } from "@/lib/saas-api"

async function accessToken(): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return undefined
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}

function formatMetadata(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata).filter(([, value]) => value != null && value !== "")
  if (!entries.length) return "—"
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ")
}

function actionLabel(action: string) {
  if (action === "GATEWAY_FAILURE_RATE_ALERT") return "Alerta taxa webhook"
  return action
}

function actionVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  if (action === "GATEWAY_FAILURE_RATE_ALERT") return "destructive"
  return "outline"
}

export default function AuditPage() {
  const [logs, setLogs] = useState<SaasAuditLogRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const token = await accessToken()
    const result = await fetchSaasAuditLogs(token, 50)
    if (!token || result.error?.includes("Unauthorized") || result.error?.includes("Sem permissão")) {
      setNeedsAuth(true)
      setLogs([])
      setLoading(false)
      return
    }
    setNeedsAuth(false)
    if (!result.ok) {
      setError(result.error || "Falha ao carregar.")
      setLoading(false)
      return
    }
    setLogs(result.logs ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-4">
      <div className="px-4 lg:px-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Auditoria SaaS</h1>
          <p className="text-muted-foreground">
            Últimos eventos da plataforma (`saas_audit_logs`) — provisionamento, estado, subscrição e admins.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="size-4" />
          Actualizar
        </Button>
      </div>

      <div className="px-4 lg:px-6">
        {needsAuth ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Inicie sessão como administrador da plataforma.{" "}
              <Link href="/sign-in?next=/audit" className="font-medium text-primary underline">
                Entrar
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <p role="alert" className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Acção</TableHead>
                  <TableHead>Escola</TableHead>
                  <TableHead>Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      A carregar…
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <ScrollText className="size-4" />
                        Nenhum registo de auditoria.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(log.created_at).toLocaleString("pt-AO", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionVariant(log.action)}>{actionLabel(log.action)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.tenant_name ? (
                          <div>
                            <div>{log.tenant_name}</div>
                            {log.tenant_slug ? (
                              <div className="font-mono text-xs text-muted-foreground">{log.tenant_slug}</div>
                            ) : null}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                        {formatMetadata(log.metadata)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
