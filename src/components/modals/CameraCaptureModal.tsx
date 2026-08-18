import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CameraCaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
}

export function CameraCaptureModal({
  open,
  onOpenChange,
  onCapture,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!open) {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
      setError(null);
      return;
    }

    let activeStream: MediaStream | null = null;
    async function startCamera() {
      try {
        setError(null);
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("A câmera não é suportada neste navegador ou ambiente.");
          return;
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 640 },
            height: { ideal: 640 },
          },
          audio: false,
        });

        activeStream = newStream;
        setStream(newStream);

        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.warn("[CameraCaptureModal] Camera error:", err);
        setError("Não foi possível aceder à câmera. Verifique as permissões do navegador.");
      }
    }

    void startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [open, facingMode]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    setCapturing(true);

    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 640;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Context2D unavailable");

      // Flip horizontally if facingMode is user (selfie mode)
      if (facingMode === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          setCapturing(false);
          if (!blob) {
            setError("Falha ao capturar a imagem da câmera.");
            return;
          }
          const capturedFile = new File([blob], `camera-avatar-${Date.now()}.jpg`, {
            type: "image/jpeg",
          });
          onCapture(capturedFile);
          onOpenChange(false);
        },
        "image/jpeg",
        0.92
      );
    } catch (err) {
      setCapturing(false);
      setError("Erro ao tirar fotografia.");
    }
  };

  const toggleFacingMode = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-5 text-primary" />
            Tirar Foto com a Câmera
          </DialogTitle>
          <DialogDescription>
            Posicione o rosto no centro e clique no botão para capturar a foto de perfil.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mt-2 flex flex-col items-center justify-center overflow-hidden rounded-xl bg-slate-950 aspect-square border border-border shadow-inner">
          {error ? (
            <div className="p-6 text-center text-sm text-destructive">
              <p className="font-semibold">{error}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Pode usar o botão de ficheiro convencional para escolher uma imagem.
              </p>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`size-full object-cover ${facingMode === "user" ? "-scale-x-100" : ""}`}
            />
          )}

          {stream && !error && (
            <button
              type="button"
              onClick={toggleFacingMode}
              className="absolute top-3 right-3 rounded-full bg-background/80 p-2 text-foreground backdrop-blur hover:bg-background transition"
              title="Alternar Câmera"
            >
              <RefreshCw className="size-4" />
            </button>
          )}
        </div>

        <div className="mt-4 flex justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!stream || !!error || capturing}
            onClick={capturePhoto}
            className="flex-1"
          >
            <Camera className="mr-2 size-4" />
            {capturing ? "A capturar..." : "Tirar Foto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
