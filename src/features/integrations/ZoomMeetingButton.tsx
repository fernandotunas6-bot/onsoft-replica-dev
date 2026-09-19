import { useState } from "react";
import { Video, Loader2, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createZoomLessonMeeting, getZoomLessonMeeting } from "./zoom";
import { meetingRoomLink } from "./actions";

interface ZoomMeetingButtonProps {
  attendanceSessionId?: string | null;
  lessonTitle?: string;
  className?: string;
  size?: "default" | "sm" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
}

/**
 * Botão integrado para aulas online Zoom.
 * Conecta a aula física/síncrona à reunião Zoom correspondente
 * garantindo rigorosamente que o título da aula permaneça limpo (sem "Zoom").
 */
export function ZoomMeetingButton({
  attendanceSessionId,
  lessonTitle,
  className = "",
  size = "sm",
  variant = "outline",
}: ZoomMeetingButtonProps) {
  const [loading, setLoading] = useState(false);

  const cleanTopic = lessonTitle?.trim() || "Aula Síncrona";

  const handleOpenOrJoinMeeting = async () => {
    setLoading(true);
    try {
      if (attendanceSessionId) {
        // Tentar obter reunião existente ou criar uma nova vinculada à sessão de aula
        let meeting: { join_url?: string | null; status?: string | null } | null =
          await getZoomLessonMeeting({ data: { attendanceSessionId } });
        if (!meeting || meeting.status !== "active") {
          meeting = await createZoomLessonMeeting({
            data: {
              attendanceSessionId,
              topic: cleanTopic, // REGRA: Título da Aula independente do Zoom
            },
          });
        }

        const joinUrl = meeting?.join_url;
        if (joinUrl) {
          window.open(joinUrl, "_blank", "noopener,noreferrer");
          toast.success("A abrir reunião Zoom da aula", {
            description: `Tópico: ${cleanTopic}`,
            action: {
              label: "Copiar Link",
              onClick: () => {
                void navigator.clipboard.writeText(joinUrl);
                toast.success("Link copiado para a área de transferência!");
              },
            },
          });
          return;
        }
      }

      // Fallback gracioso se não houver attendanceSessionId fornecida
      const fallbackUrl = meetingRoomLink("zoom");
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      toast.success("A abrir sala Zoom", { description: fallbackUrl });
    } catch (err) {
      // Se o Zoom corporativo ainda não estiver ligado via OAuth, orientar o utilizador
      const msg = (err as Error)?.message || "";
      if (msg.includes("Zoom não está ligado") || msg.includes("Configuração Zoom em falta")) {
        toast.info("Conta Zoom não conectada", {
          description:
            "Conecte o Zoom da escola em Definições → Integrações para gerar reuniões automáticas.",
        });
        const fallbackUrl = meetingRoomLink("zoom");
        window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error("Não foi possível gerar a reunião Zoom", {
          description: msg || "Tente novamente ou use o link manual.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={loading}
      onClick={handleOpenOrJoinMeeting}
      className={`gap-1.5 text-xs ${className}`}
      title={`Entrar na aula online: ${cleanTopic}`}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Video className="size-3.5 text-primary" />
      )}
      <span>Entrar na Aula Online</span>
    </Button>
  );
}
