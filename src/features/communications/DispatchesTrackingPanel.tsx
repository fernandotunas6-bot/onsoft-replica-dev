import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  LoaderCircle,
  Mail,
  MessageSquare,
  Radio,
  RotateCw,
  Smartphone,
  Users,
  XCircle,
} from "lucide-react";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listSchoolCommunicationDispatches,
  getCommunicationDispatchStats,
} from "./dispatches-server";
import { syncSchoolContactsToResendFn } from "./contacts-sync-server";
import { errorMessage } from "@/lib/error-message";

export function DispatchesTrackingPanel() {
  const queryClient = useQueryClient();
  const [channelFilter, setChannelFilter] = React.useState<"all" | "email" | "sms" | "whatsapp">(
    "all",
  );
  const [isSyncing, setIsSyncing] = React.useState(false);

  const statsQuery = useQuery({
    queryKey: ["communications", "dispatch_stats"],
    queryFn: () => getCommunicationDispatchStats(),
    refetchInterval: 10000,
  });

  const dispatchesQuery = useQuery({
    queryKey: ["communications", "dispatches", channelFilter],
    queryFn: () =>
      listSchoolCommunicationDispatches({
        data: { channel: channelFilter, limit: 30 },
      }),
    refetchInterval: 10000,
  });

  const handleSyncContacts = async () => {
    setIsSyncing(true);
    try {
      const res = await syncSchoolContactsToResendFn();
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao sincronizar contactos."));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["communications", "dispatch_stats"] });
    void queryClient.invalidateQueries({ queryKey: ["communications", "dispatches"] });
    toast.info("A atualizar estado das entregas...");
  };

  const stats = statsQuery.data ?? {
    total: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    failed: 0,
    bounced: 0,
    byChannel: { email: 0, sms: 0, whatsapp: 0 },
  };

  const dispatches = dispatchesQuery.data ?? [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "delivered":
        return (
          <Badge variant="outline" className="gap-1 border-primary text-primary">
            <CheckCircle2 className="size-3" /> Entregue
          </Badge>
        );
      case "opened":
      case "clicked":
        return (
          <Badge variant="outline" className="gap-1 border-primary text-primary font-bold">
            <Eye className="size-3" /> Aberto
          </Badge>
        );
      case "sent":
        return (
          <Badge variant="secondary" className="gap-1">
            <Radio className="size-3" /> Enviado
          </Badge>
        );
      case "bounced":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="size-3" /> Bounce
          </Badge>
        );
      case "failed":
      default:
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="size-3" /> Falhou
          </Badge>
        );
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "whatsapp":
        return <MessageSquare className="size-4 text-primary" />;
      case "sms":
        return <Smartphone className="size-4 text-primary" />;
      case "email":
      default:
        return <Mail className="size-4 text-primary" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Resumo Estatístico de Entregas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-xs font-medium text-muted-foreground">Disparos Totais</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-xs font-medium text-muted-foreground">Entregues</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {stats.delivered}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-xs font-medium text-muted-foreground">Abertos / Lidos</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {stats.opened + stats.clicked}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-xs font-medium text-muted-foreground">Bounces</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-destructive">{stats.bounced}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-xs font-medium text-muted-foreground">Falhas</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-destructive">{stats.failed}</p>
        </div>
      </div>

      <Panel
        title="Histórico de Entregas em Tempo Real"
        description="Monitorização de e-mails (Resend), mensagens de WhatsApp e SMS com atualização de status."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncContacts}
              disabled={isSyncing}
              className="gap-1.5 text-xs"
            >
              {isSyncing ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Users className="size-3.5" />
              )}
              Sincronizar Audiência
            </Button>

            <Button variant="ghost" size="sm" onClick={handleRefresh} className="size-8 p-0">
              <RotateCw className="size-3.5" />
            </Button>
          </div>
        }
      >
        {/* Filtro de Canais */}
        <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
          <Button
            variant={channelFilter === "all" ? "default" : "ghost"}
            size="sm"
            onClick={() => setChannelFilter("all")}
            className="text-xs"
          >
            Todos os Canais
          </Button>
          <Button
            variant={channelFilter === "email" ? "default" : "ghost"}
            size="sm"
            onClick={() => setChannelFilter("email")}
            className="gap-1.5 text-xs"
          >
            <Mail className="size-3.5" /> E-mail (Resend)
          </Button>
          <Button
            variant={channelFilter === "whatsapp" ? "default" : "ghost"}
            size="sm"
            onClick={() => setChannelFilter("whatsapp")}
            className="gap-1.5 text-xs"
          >
            <MessageSquare className="size-3.5" /> WhatsApp
          </Button>
          <Button
            variant={channelFilter === "sms" ? "default" : "ghost"}
            size="sm"
            onClick={() => setChannelFilter("sms")}
            className="gap-1.5 text-xs"
          >
            <Smartphone className="size-3.5" /> SMS
          </Button>
        </div>

        {dispatchesQuery.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            A carregar registos de entrega…
          </p>
        ) : dispatches.length === 0 ? (
          <div className="py-12 text-center">
            <Mail className="mx-auto size-8 text-muted-foreground opacity-50" />
            <p className="mt-2 text-sm font-semibold text-foreground">
              Nenhum registo de envio encontrado
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Os disparos de verificação OTP, cobranças Payflow e comunicados aparecerão aqui em
              tempo real.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="pb-3 font-medium">Canal</th>
                  <th className="pb-3 font-medium">Destinatário</th>
                  <th className="pb-3 font-medium">Assunto / Finalidade</th>
                  <th className="pb-3 font-medium">Provedor</th>
                  <th className="pb-3 font-medium">Estado</th>
                  <th className="pb-3 font-medium text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dispatches.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/40 transition-colors">
                    <td className="py-3">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                        {getChannelIcon(d.channel)}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-xs text-foreground">{d.recipient}</td>
                    <td className="py-3 text-xs text-foreground font-medium">
                      {d.subjectOrTemplate || "Notificação do Sistema"}
                    </td>
                    <td className="py-3 text-xs text-muted-foreground">{d.provider}</td>
                    <td className="py-3">{getStatusBadge(d.status)}</td>
                    <td className="py-3 text-right text-xs text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString("pt-PT", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
