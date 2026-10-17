import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, LoaderCircle, Unlink, Video } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { startZoomOAuth, disconnectZoom } from "./zoom";
import type { SchoolIntegrationSummary } from "./server";

interface ZoomIntegrationCardProps {
  item: SchoolIntegrationSummary;
}

export function ZoomIntegrationCard({ item }: ZoomIntegrationCardProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const isConnected = item.status === "connected";
  const config = (item.config || {}) as Record<string, unknown>;
  const accountEmail = String(config.accountEmail || "");
  const accountName = String(config.accountName || "");

  const handleConnect = async () => {
    setLoading(true);
    try {
      const { authorizeUrl } = await startZoomOAuth();
      if (authorizeUrl) {
        window.location.href = authorizeUrl;
      }
    } catch (err) {
      toast.error("Falha ao iniciar autenticação com Zoom", {
        description: (err as Error)?.message || "Verifique se ZOOM_CLIENT_ID está configurado.",
      });
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await disconnectZoom();
      toast.success("Zoom desconectado com sucesso.");
      await queryClient.invalidateQueries({ queryKey: ["school", "integrations"] });
    } catch (err) {
      toast.error("Falha ao desligar Zoom", {
        description: (err as Error)?.message || "Ocorreu um erro ao revogar os segredos.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="space-y-0.5">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <Video className="size-3.5 text-primary" /> Integração com Zoom Video Communications
          </p>
          <p className="text-muted-foreground text-[11px]">
            Permite aos professores gerar reuniões síncronas diretamente a partir do horário e
            sessões de aula.
          </p>
        </div>

        {isConnected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={loading}
            className="text-xs text-destructive hover:bg-destructive/10 gap-1.5 self-start sm:self-auto"
          >
            {loading ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : (
              <Unlink className="size-3" />
            )}
            Desconectar
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleConnect}
            disabled={loading}
            className="text-xs gap-1.5 self-start sm:self-auto font-semibold"
          >
            {loading ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : (
              <ExternalLink className="size-3" />
            )}
            Conectar com Zoom
          </Button>
        )}
      </div>

      {isConnected ? (
        <div className="flex items-center gap-2 p-2 rounded-md bg-success/10 border border-success/20 text-success text-[11px]">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span>
            Conta autorizada: <strong>{accountName || "Zoom User"}</strong> (
            {accountEmail || "Email não disponível"})
          </span>
        </div>
      ) : (
        <div className="p-2 rounded-md bg-secondary/50 text-[11px] text-muted-foreground">
          Clique em &quot;Conectar com Zoom&quot; para autorizar o acesso da sua escola através da
          conta corporativa Zoom.
        </div>
      )}
    </div>
  );
}
