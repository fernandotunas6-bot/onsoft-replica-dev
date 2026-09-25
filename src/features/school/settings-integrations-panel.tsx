import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Mail } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AppMark } from "@/features/integrations/app-marks";
import {
  DOC_PATHS,
  getDocUrl,
  getFinanceGatewayConfirmUrl,
  getUnitelGatewayConfirmUrl,
} from "@/lib/ecosystem-urls";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { groupCatalogItems, integrationFieldHints } from "@/features/integrations/catalog";
import { isPendingWorkspaceProvider } from "@/features/integrations/google-workspace-availability";
import { InstallConsentModal } from "@/features/integrations/InstallConsentModal";
import { ZoomIntegrationCard } from "@/features/integrations/ZoomIntegrationCard";
import { installPackageFor } from "@/features/integrations/install";
import {
  consumeIntegrationFocus,
  integrationAnchorId,
  integrationStatusLabel,
} from "@/features/integrations/launcher";
import {
  listSchoolIntegrations,
  revokeSchoolIntegration,
  rotateGatewayWebhookApiKey,
  upsertSchoolIntegration,
  type SchoolIntegrationSummary,
} from "@/features/integrations/server";
import { gatewayWebhookPreviousKeyActive } from "@/features/integrations/gateway-webhook-key";
import { GoogleWorkspaceConnectCard } from "./GoogleWorkspaceConnectCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { listGatewayWebhookEvents } from "@/features/finance/server";

function GatewayWebhookHint({
  provider,
  config,
}: {
  provider: string;
  config: Record<string, unknown>;
}) {
  const queryClient = useQueryClient();
  const [rotating, setRotating] = useState(false);
  const isGateway = provider === "multicaixa_express" || provider === "unitel_money";
  const apiKey = String(config.webhookApiKey ?? "").trim();
  const previousActive = gatewayWebhookPreviousKeyActive(config);
  const previousExpires = String(config.webhookApiKeyPreviousExpiresAt ?? "");

  const eventsQuery = useQuery({
    queryKey: ["gateway-webhook-events", provider],
    queryFn: () =>
      listGatewayWebhookEvents({
        data: { channel: provider as "multicaixa_express" | "unitel_money", limit: 5 },
      }),
    enabled: isGateway && Boolean(apiKey),
    staleTime: 30_000,
  });

  if (!isGateway || !apiKey) return null;

  const recentEvents = eventsQuery.data ?? [];

  const copy = (label: string, value: string) => {
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  };

  const rotateKey = () => {
    setRotating(true);
    void rotateGatewayWebhookApiKey({
      data: { provider: provider as "multicaixa_express" | "unitel_money" },
    })
      .then((result) => {
        toast.success("Nova API key gerada — copiada para a área de transferência.");
        void navigator.clipboard.writeText(result.webhookApiKey);
        return queryClient.invalidateQueries({ queryKey: ["school", "integrations"] });
      })
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Não foi possível rotacionar a key."),
      )
      .finally(() => setRotating(false));
  };

  const webhookUrl =
    provider === "unitel_money" ? getUnitelGatewayConfirmUrl() : getFinanceGatewayConfirmUrl();

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 space-y-2 text-xs">
      <p className="font-semibold text-foreground">
        Webhook de confirmação ({provider === "unitel_money" ? "Unitel → SIGA" : "EMIS → SIGA"})
      </p>
      <p className="text-muted-foreground">
        Configure no portal {provider === "unitel_money" ? "Unitel Money" : "EMIS/Multicaixa"} o
        POST abaixo. Corpo JSON:{" "}
        <code className="text-[10px]">{`{ apiKey, reference, amount, invoiceId? }`}</code>
      </p>
      {provider === "multicaixa_express" ? (
        <p className="text-[11px] text-muted-foreground">
          Entidade EMIS: preencha o campo «Merchant EMIS / Multicaixa» acima (4–6 dígitos). Sem
          valor, usa-se <code className="text-[10px]">99824</code> (demo).
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded bg-background px-2 py-1 font-mono text-[10px]">
          {webhookUrl}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={() => copy("URL", webhookUrl)}>
          Copiar URL
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded bg-background px-2 py-1 font-mono text-[10px]">
          {apiKey}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={() => copy("API key", apiKey)}>
          Copiar API key
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" size="sm" variant="destructive" disabled={rotating}>
              {rotating ? "A gerar…" : "Rotacionar key"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rotacionar API key de webhook?</AlertDialogTitle>
              <AlertDialogDescription>
                Gera uma nova chave e mantém a anterior válida por 24 horas (período de graça).
                Actualize o portal {provider === "unitel_money" ? "Unitel" : "EMIS"} com a nova key
                antes do fim desse prazo — caso contrário os webhooks passam a falhar com HTTP 401.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={rotateKey}>Gerar nova key</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {previousActive && previousExpires ? (
        <p className="text-[11px] text-warning">
          Chave anterior aceite até{" "}
          {new Date(previousExpires).toLocaleString("pt-AO", {
            dateStyle: "short",
            timeStyle: "short",
          })}
          . Actualize o portal banco com a key nova acima.
        </p>
      ) : null}
      {recentEvents.length > 0 ? (
        <div className="space-y-1 border-t border-border pt-2">
          <p className="font-medium text-foreground">Últimos webhooks</p>
          <ul className="space-y-1">
            {recentEvents.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground"
              >
                <Badge
                  variant={event.ok ? "secondary" : "destructive"}
                  className="h-4 px-1 text-[9px] font-normal"
                >
                  {event.ok ? "OK" : "Falha"} {event.http_status}
                </Badge>
                <span>{event.created_at?.slice(0, 16).replace("T", " ")}</span>
                <span className="truncate">{event.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Teste local:{" "}
        <code className="text-[10px]">npm run siga:gateway-simulate -- --invoice-id=…</code>
        {provider === "unitel_money" ? <code className="text-[10px]"> --unitel</code> : null}
        {" · "}
        Operador: <code className="text-[10px]">npm run siga:gateway-events-recent</code>
        {" · "}
        <a
          href={getDocUrl(DOC_PATHS.integracoesEmis)}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Manual EMIS/Unitel
        </a>
        {" · "}
        <a
          href={getDocUrl(DOC_PATHS.integracoesProducao)}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Checklist produção
        </a>
        {" · "}
        <a
          href={getDocUrl(DOC_PATHS.integracoesPortalBanco)}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Pedido ao banco
        </a>
        {" · "}
        <a
          href={getDocUrl(DOC_PATHS.integracoesRunbook)}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Runbook suporte
        </a>
      </p>
    </div>
  );
}

function AcademicIntegrationsCatalog() {
  const queryClient = useQueryClient();
  const [installProvider, setInstallProvider] = useState<string | null>(null);
  const catalogQuery = useQuery({
    queryKey: ["school", "integrations"],
    queryFn: () => listSchoolIntegrations() as Promise<SchoolIntegrationSummary[]>,
    retry: false,
  });
  const items = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const grouped = useMemo(() => groupCatalogItems(items), [items]);

  useEffect(() => {
    const provider = consumeIntegrationFocus();
    if (!provider || !items.length) return;
    const node = document.getElementById(integrationAnchorId(provider));
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
    node?.classList.add("ring-2", "ring-primary/40");
    const timer = window.setTimeout(
      () => node?.classList.remove("ring-2", "ring-primary/40"),
      2400,
    );
    return () => window.clearTimeout(timer);
  }, [items.length]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Catálogo de integrações
        </h5>
        <p className="text-xs text-muted-foreground">
          Configure chaves e webhooks. As chamadas externas ficam prontas a ligar.
        </p>
      </div>
      {grouped.map((entry) => (
        <div key={entry.group} className="space-y-2">
          <h6 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {entry.group}
          </h6>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {entry.items.map((item) => {
              const hints = integrationFieldHints[item.id];
              const config = item.config ?? {};
              const pack = installPackageFor(item.id);
              const workspacePending = isPendingWorkspaceProvider(item.id);
              const installed = !workspacePending && item.status !== "disconnected";
              return (
                <li
                  key={item.id}
                  id={integrationAnchorId(item.id)}
                  className="space-y-2 rounded-xl px-3 py-3 scroll-mt-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <AppMark id={item.id} className="size-8 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant={workspacePending || item.status === "disconnected" ? "secondary" : "default"}>
                        {workspacePending ? "Pendente de consentimento" : integrationStatusLabel(item.status)}
                      </Badge>
                      {workspacePending ? (
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Ligação em preparação
                        </span>
                      ) : installed ? (
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-destructive hover:underline"
                          onClick={() => {
                            void revokeSchoolIntegration({ data: { provider: item.id } })
                              .then(() => {
                                toast.success(`${item.name} desinstalado.`);
                                return queryClient.invalidateQueries({
                                  queryKey: ["school", "integrations"],
                                });
                              })
                              .catch((error) =>
                                toast.error(
                                  error instanceof Error ? error.message : "Falha ao desinstalar.",
                                ),
                              );
                          }}
                        >
                          Desinstalar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-primary hover:underline"
                          onClick={() => setInstallProvider(item.id)}
                        >
                          Instalar
                        </button>
                      )}
                    </div>
                  </div>
                  {pack && item.grantedCapabilities?.length ? (
                    <p className="text-[11px] text-muted-foreground">
                      Funções no SIGA:{" "}
                      {pack.capabilities
                        .filter((capability) => item.grantedCapabilities.includes(capability.id))
                        .map((capability) => capability.label)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {workspacePending ? (
                    <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      A ligação exige consentimento Google independente do login SIGA,
                      autorização por serviço e tokens protegidos no servidor.
                      Nenhuma operação destes serviços Google está activa.
                    </p>
                  ) : item.id === "zoom" ? (
                    <ZoomIntegrationCard item={item} />
                  ) : (
                    <form
                      key={`${item.id}-${item.status}-${String(config["merchantId"] ?? "")}`}
                      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void upsertSchoolIntegration({
                          data: {
                            provider: item.id,
                            status: "configured",
                            merchantId: String(data.get("merchantId") || ""),
                            callbackUrl: String(data.get("callbackUrl") || ""),
                            sandbox: true,
                          },
                        })
                          .then(() => {
                            toast.success(`${item.name} configurado.`);
                            return queryClient.invalidateQueries({
                              queryKey: ["school", "integrations"],
                            });
                          })
                          .catch((error) =>
                            toast.error(
                              error instanceof Error ? error.message : "Falha ao guardar.",
                            ),
                          );
                      }}
                    >
                      <Input
                        name="merchantId"
                        aria-label={`Identificador de comerciante ${item.name}`}
                        defaultValue={String(config["merchantId"] ?? "")}
                        placeholder={hints.merchant}
                        className="h-8 text-xs"
                      />
                      <Input
                        name="callbackUrl"
                        aria-label={`URL de retorno ${item.name}`}
                        defaultValue={String(
                          config["callbackUrl"] ??
                            (item.id === "multicaixa_express" || item.id === "unitel_money"
                              ? getFinanceGatewayConfirmUrl()
                              : ""),
                        )}
                        placeholder={hints.callback}
                        className="h-8 text-xs"
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Guardar
                      </Button>
                    </form>
                  )}
                  <GatewayWebhookHint provider={item.id} config={config} />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <InstallConsentModal
        provider={installProvider}
        open={Boolean(installProvider)}
        onOpenChange={(open) => {
          if (!open) setInstallProvider(null);
        }}
      />
    </div>
  );
}

const otherChannelSeeds = [
  { name: "SMS (operadora local)", installed: () => false },
  { name: "Portal do encarregado", installed: () => false, label: "Fora desta UI" },
  { name: "Comunicados internos (announcements)", installed: () => true },
  { name: "Exportação CSV/PDF nas listas", installed: () => true },
  {
    name: "Pagamentos por referência",
    installed: (i: ReturnType<typeof useInstalledIntegrations>) =>
      i.isInstalled("multicaixa_express") || i.isInstalled("unitel_money"),
  },
  {
    name: "WhatsApp Business",
    installed: (i: ReturnType<typeof useInstalledIntegrations>) =>
      i.isInstalled("whatsapp_business"),
  },
  {
    name: "Resend (e-mail transaccional)",
    installed: (i: ReturnType<typeof useInstalledIntegrations>) => i.isInstalled("resend_email"),
  },
] as const;

export function IntegrationsPanel() {
  const installed = useInstalledIntegrations();
  const otherChannels = otherChannelSeeds.map((channel) => {
    const on = channel.installed(installed);
    const state = "label" in channel && !on ? channel.label : on ? "Instalado" : "Não ligado";
    return {
      name: channel.name,
      state,
      tone: on ? ("success" as const) : ("muted" as const),
    };
  });

  return (
    <div className="space-y-8">
      <AcademicIntegrationsCatalog />
      <GoogleWorkspaceConnectCard />
      {installed.isInstalled("resend_email") ? (
        <p className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          <strong>Resend</strong> permanece como serviço independente para notificações
          transaccionais da escola. O Gmail individual requer consentimento Google próprio.
        </p>
      ) : null}
      <Separator />

      <div className="space-y-3">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Outros canais
        </h5>
        <ul className="divide-y divide-border">
          {otherChannels.map((i) => (
            <li key={i.name} className="flex items-center justify-between py-2.5 text-sm">
              <span>{i.name}</span>
              <Badge
                variant={i.tone === "success" ? "default" : "secondary"}
                className={i.tone === "muted" ? "text-muted-foreground" : undefined}
              >
                {i.state}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
