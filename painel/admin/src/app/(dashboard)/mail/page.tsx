"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Mail as MailIcon, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminAccessToken } from "@/lib/admin-session";
import {
  fetchSaasAuditLogs,
  fetchTenantMailboxes,
  type SaasAuditLogRow,
  type MailboxRow,
} from "@/lib/saas-api";

const ALERT_ACTIONS = new Set([
  "GATEWAY_FAILURE_RATE_ALERT",
  "tenant_suspended",
  "subscription_changed",
  "school_suspended",
]);

function isAlert(log: SaasAuditLogRow) {
  if (ALERT_ACTIONS.has(log.action)) return true;
  const a = log.action.toLowerCase();
  return a.includes("alert") || a.includes("fail") || a.includes("suspend");
}

export default function MailPage() {
  const [logs, setLogs] = useState<SaasAuditLogRow[]>([]);
  const [mailboxes, setMailboxes] = useState<MailboxRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getAdminAccessToken();
    if (!token) {
      setNeedsAuth(true);
      setLoading(false);
      return;
    }
    setNeedsAuth(false);

    const [result, mailboxResult] = await Promise.all([
      fetchSaasAuditLogs(token, 80),
      fetchTenantMailboxes(token),
    ]);

    setLogs(result.logs ?? []);
    setMailboxes(mailboxResult.mailboxes ?? []);

    const errors = [
      !result.ok ? result.error || "Falha ao carregar avisos." : null,
      !mailboxResult.ok ? mailboxResult.error || "Falha ao carregar caixas de correio." : null,
    ].filter(Boolean);
    setError(errors.length ? errors.join(" ") : null);

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const inbox = useMemo(() => {
    const alerts = logs.filter(isAlert);
    const rest = logs.filter((l) => !isAlert(l));
    return [...alerts, ...rest];
  }, [logs]);

  const selected = inbox.find((l) => l.id === selectedId) ?? inbox[0] ?? null;

  useEffect(() => {
    if (!selectedId && inbox[0]) setSelectedId(inbox[0].id);
  }, [inbox, selectedId]);

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6 h-[calc(100vh-4rem)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">E-mail & Comunicações</h1>
          <p className="text-muted-foreground">
            Gestão de caixas de correio profissionais e caixa operacional da plataforma.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {needsAuth ? (
        <Card className="shrink-0">
          <CardContent className="py-8 text-sm text-muted-foreground">
            <Link className="underline" href="/sign-in">
              Entrar
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-destructive/40 shrink-0">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="caixas" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="shrink-0 grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="caixas" className="gap-2">
            <MailIcon className="size-4" /> Caixas Escolas
          </TabsTrigger>
          <TabsTrigger value="operacional" className="gap-2">
            <ShieldAlert className="size-4" /> Operacional
          </TabsTrigger>
        </TabsList>

        <TabsContent value="caixas" className="mt-4 flex-1 overflow-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Caixas institucionais</CardTitle>
              <CardDescription>
                {mailboxes.length} caixa(s) provisionada(s) para as escolas da plataforma.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {mailboxes.map((mailbox) => (
                <div
                  key={mailbox.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{mailbox.email}</div>
                    <div className="text-sm text-muted-foreground">
                      {mailbox.display_name ||
                        mailbox.tenants?.name ||
                        mailbox.tenants?.slug ||
                        "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{mailbox.provider}</Badge>
                    <Badge variant={mailbox.status === "active" ? "default" : "secondary"}>
                      {mailbox.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {mailboxes.length === 0 && !loading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma caixa institucional encontrada.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operacional" className="flex-1 mt-4">
          <div className="grid min-h-[420px] gap-4 lg:grid-cols-[320px_1fr]">
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Entrada</CardTitle>
                <CardDescription>{inbox.length} evento(s)</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[520px] space-y-1 overflow-y-auto p-2">
                {inbox.map((log) => (
                  <button
                    key={log.id}
                    type="button"
                    onClick={() => setSelectedId(log.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      selected?.id === log.id ? "bg-muted" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={isAlert(log) ? "destructive" : "outline"}>{log.action}</Badge>
                    </div>
                    <div className="mt-1 truncate text-muted-foreground">
                      {log.tenant_name || log.tenant_slug || log.entity}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("pt-AO")}
                    </div>
                  </button>
                ))}
                {inbox.length === 0 && !loading ? (
                  <p className="p-3 text-sm text-muted-foreground">Caixa vazia.</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {selected ? selected.action : "Seleccione um aviso"}
                </CardTitle>
                {selected ? (
                  <CardDescription>
                    {selected.tenant_name || selected.tenant_slug || "—"} ·{" "}
                    {new Date(selected.created_at).toLocaleString("pt-AO")}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {selected ? (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Entidade</div>
                      <div>
                        {selected.entity}
                        {selected.entity_id ? ` · ${selected.entity_id}` : ""}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Metadados</div>
                      <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 text-xs">
                        {JSON.stringify(selected.metadata ?? {}, null, 2)}
                      </pre>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" asChild>
                        <Link href="/tenants">Escolas</Link>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link href="/gateway-webhooks">Webhooks</Link>
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Nada seleccionado.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
