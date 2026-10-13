import { AlertTriangle, CloudOff, Cpu, Server, Wifi, WifiOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { AiStatus } from "../gateway.server";

const MODE_LABEL = {
  local: { label: "IA local", icon: Cpu },
  school_server: { label: "Servidor da escola", icon: Server },
  remote: { label: "IA remota", icon: Wifi },
} as const;

/**
 * Indicadores do §4: IA local / servidor escolar / IA remota / indisponível /
 * modelo não instalado — e se o browser está sem rede.
 */
export function AiStatusBanner({ status, online }: { status: AiStatus; online: boolean }) {
  const mode = MODE_LABEL[status.mode];
  const ModeIcon = mode.icon;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status.state === "available" ? "default" : "secondary"} className="gap-1">
          <ModeIcon className="size-3" aria-hidden="true" />
          {mode.label}
        </Badge>
        {status.chatModel ? (
          <Badge variant="outline" className="font-mono text-[11px]">
            {status.chatModel}
          </Badge>
        ) : null}
        <Badge variant="outline" className="gap-1">
          {status.knowledgeBase === "ready"
            ? "Pesquisa documental activa"
            : "Sem pesquisa documental"}
        </Badge>
        {!online ? (
          <Badge variant="secondary" className="gap-1">
            <WifiOff className="size-3" aria-hidden="true" />
            Sem internet — a IA local continua a responder
          </Badge>
        ) : null}
      </div>

      {status.state !== "available" ? (
        <Alert variant="default">
          {status.state === "unreachable" ? (
            <CloudOff className="size-4" aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-4" aria-hidden="true" />
          )}
          <AlertTitle>
            {status.state === "disabled"
              ? "SIGA AI desactivado"
              : status.state === "not_configured"
                ? "SIGA AI por configurar"
                : status.state === "model_missing"
                  ? "Modelo não instalado"
                  : "Serviço de IA indisponível"}
          </AlertTitle>
          <AlertDescription>
            {status.message}
            {status.state === "disabled" || status.state === "not_configured"
              ? " Um administrador activa-o em Configurações → SIGA AI."
              : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      {status.state === "available" && !status.profileAllowed ? (
        <Alert>
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Sem acesso ao assistente</AlertTitle>
          <AlertDescription>
            O seu perfil não está entre os autorizados por esta escola.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
