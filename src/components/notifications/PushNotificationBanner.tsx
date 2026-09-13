import React, { useState } from "react";
import { Bell, BellRing, Check, X } from "lucide-react";
import { useFirebaseNotifications } from "@/integrations/firebase/messaging";
import { toast } from "sonner";

export interface PushNotificationBannerProps {
  onTokenRegistered?: (token: string) => void;
  className?: string;
}

export const PushNotificationBanner: React.FC<PushNotificationBannerProps> = ({
  onTokenRegistered,
  className = "",
}) => {
  const { isSupported, permission, token, isLoading, enableNotifications } =
    useFirebaseNotifications();
  const [isDismissed, setIsDismissed] = useState(false);

  // Não renderizar se não for suportado, se já tiver permissão concedida e token, ou se o utilizador fechar o banner
  if (!isSupported || isDismissed || (permission === "granted" && token)) {
    return null;
  }

  // Se o utilizador já bloqueou as notificações no navegador
  if (permission === "denied") {
    return null;
  }

  const handleEnable = async () => {
    try {
      const deviceToken = await enableNotifications();
      if (deviceToken) {
        toast.success("Notificações ativadas com sucesso!");
        if (onTokenRegistered) {
          onTokenRegistered(deviceToken);
        }
      } else {
        toast.info("Permissão de notificações não concedida.");
      }
    } catch {
      toast.error("Não foi possível ativar as notificações no momento.");
    }
  };

  return (
    <div
      role="region"
      aria-label="Ativação de Notificações"
      className={`flex items-center justify-between gap-3 p-3.5 rounded-lg border border-primary/20 bg-primary/5 text-foreground transition-all duration-200 ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {permission === "granted" ? (
            <Check className="h-5 w-5" />
          ) : (
            <Bell className="h-5 w-5 animate-pulse" />
          )}
        </div>
        <div className="text-sm">
          <p className="font-semibold text-foreground leading-snug">
            Receber Alertas e Notificações Push
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ative para receber avisos de faltas, pautas, notas e lembretes escolares em tempo real
            no seu Android/Web.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={isLoading}
          onClick={handleEnable}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
        >
          <BellRing className="h-3.5 w-3.5" />
          {isLoading ? "A ativar..." : "Ativar"}
        </button>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          aria-label="Ignorar ativação de notificações"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default PushNotificationBanner;
