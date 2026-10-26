import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import jsQR from "jsqr";
import {
  CheckCircle2,
  Clock,
  QrCode,
  RefreshCw,
  UploadCloud,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { SCHOOL_QR_PREFIX } from "@/features/pedagogica/school-qr";
import {
  submitPresenceScan,
  type PresenceScanResult,
} from "@/features/pedagogica/school-qr-server";
import {
  enqueuePresenceScan,
  isNetworkError,
  newOpId,
  readPresenceQueue,
  removeQueuedPresenceScan,
  type QueuedPresenceScan,
} from "@/features/pedagogica/presence-scan-queue";

type ScanOutcome =
  | { kind: "result"; result: PresenceScanResult }
  | { kind: "queued" }
  | { kind: "error"; message: string };

type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

function createDetector(): Detector | null {
  const Ctor = (
    globalThis as unknown as {
      BarcodeDetector?: new (options: { formats: string[] }) => Detector;
    }
  ).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

function currentPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  });
}

/**
 * «Ler QR da escola» no portal do professor: câmara, localização e fila sem rede.
 * Funciona no navegador do telemóvel; a app Flutter faz o mesmo com o ecrã próprio.
 */
export function TeacherSchoolQrScanner() {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [queue, setQueue] = useState<QueuedPresenceScan[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const flushing = useRef(false);

  const refreshAfterScan = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["teacher-attendance-sessions"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }, [queryClient]);

  const flushQueue = useCallback(async () => {
    if (flushing.current) return;
    const items = readPresenceQueue();
    setQueue(items);
    if (!items.length || !navigator.onLine) return;
    flushing.current = true;
    let sent = 0;
    try {
      for (const item of items) {
        try {
          const result = await submitPresenceScan({
            data: { ...item, offline: true, deviceNow: new Date().toISOString() },
          });
          removeQueuedPresenceScan(item.opId);
          sent += 1;
          if (result.decision !== "accepted") {
            toast.warning("Leitura sem rede enviada", { description: result.message });
          }
        } catch (error) {
          if (isNetworkError(error)) break;
          // Recusa definitiva (QR anulado, outra escola…): não fica a repetir.
          removeQueuedPresenceScan(item.opId);
          toast.error("Uma leitura guardada foi recusada", {
            description: error instanceof Error ? error.message : undefined,
          });
        }
      }
    } finally {
      flushing.current = false;
      setQueue(readPresenceQueue());
    }
    if (sent) {
      toast.success(`${sent} leitura(s) guardada(s) sem rede enviada(s)`);
      refreshAfterScan();
    }
  }, [refreshAfterScan]);

  useEffect(() => {
    void flushQueue();
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushQueue]);

  const stopCamera = useCallback(() => {
    if (frameRef.current != null) window.clearTimeout(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const handleToken = useCallback(
    async (token: string) => {
      stopCamera();
      setBusy(true);
      const deviceScannedAt = new Date().toISOString();
      const position = await currentPosition();
      const scan: QueuedPresenceScan = {
        opId: newOpId(),
        token,
        deviceScannedAt,
        latitude: position?.coords.latitude ?? null,
        longitude: position?.coords.longitude ?? null,
        accuracy: position?.coords.accuracy ?? null,
      };
      try {
        if (!navigator.onLine) throw new TypeError("offline");
        const result = await submitPresenceScan({
          data: { ...scan, offline: false, deviceNow: new Date().toISOString() },
        });
        setOutcome({ kind: "result", result });
        refreshAfterScan();
      } catch (error) {
        if (isNetworkError(error)) {
          enqueuePresenceScan(scan);
          setQueue(readPresenceQueue());
          setOutcome({ kind: "queued" });
        } else {
          setOutcome({
            kind: "error",
            message: error instanceof Error ? error.message : "Não foi possível ler o QR.",
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [refreshAfterScan, stopCamera],
  );

  const startCamera = async () => {
    setOutcome(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setOutcome({
        kind: "error",
        message: "Este navegador não dá acesso à câmara. Use a app SIGA ou o Chrome.",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      const detector = createDetector();
      const loop = async () => {
        if (!streamRef.current || !videoRef.current || !canvasRef.current) return;
        const v = videoRef.current;
        let value: string | null = null;
        if (v.readyState >= 2 && v.videoWidth) {
          if (detector) {
            const found = await detector.detect(v).catch(() => []);
            value = found[0]?.rawValue ?? null;
          } else {
            const canvas = canvasRef.current;
            const scale = Math.min(1, 640 / v.videoWidth);
            canvas.width = Math.round(v.videoWidth * scale);
            canvas.height = Math.round(v.videoHeight * scale);
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
              value = jsQR(frame.data, frame.width, frame.height)?.data ?? null;
            }
          }
        }
        if (value && value.startsWith(`${SCHOOL_QR_PREFIX}.`)) {
          void handleToken(value.trim());
          return;
        }
        frameRef.current = window.setTimeout(() => void loop(), 200);
      };
      void loop();
    } catch {
      stopCamera();
      setOutcome({
        kind: "error",
        message:
          "Sem acesso à câmara. Autorize a câmara para este site nas definições do navegador.",
      });
    }
  };

  return (
    <section
      id="ler-qr"
      aria-label="Ler QR da escola"
      className="scroll-mt-24 rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <QrCode className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold">Ler QR da escola</p>
            <p className="text-xs text-muted-foreground">
              Antes da aula, aponte a câmara ao QR da Direcção. Funciona sem internet.
            </p>
          </div>
        </div>
        {scanning ? (
          <Button type="button" variant="ghost" onClick={stopCamera} className="gap-1.5">
            <X className="size-4" /> Cancelar
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => void startCamera()}
            disabled={busy}
            className="h-11 gap-1.5 px-5 text-sm font-semibold touch-manipulation"
          >
            <QrCode className="size-4" /> {busy ? "A registar…" : "Abrir câmara"}
          </Button>
        )}
      </div>

      <div className={scanning ? "mt-4" : "hidden"}>
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-foreground">
          <video ref={videoRef} className="size-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-[12%] rounded-2xl border-4 border-background/80" />
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {outcome ? <ScanOutcomeCard outcome={outcome} /> : null}

      {queue.length ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5">
            <WifiOff className="size-3.5" aria-hidden /> {queue.length} leitura(s) guardada(s), à
            espera de internet
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            onClick={() => void flushQueue()}
          >
            <UploadCloud className="size-3.5" /> Enviar agora
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ScanOutcomeCard({ outcome }: { outcome: ScanOutcome }) {
  if (outcome.kind === "queued") {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <WifiOff className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold">Leitura guardada sem rede</p>
          <p className="text-xs text-muted-foreground">
            A hora e o local ficaram registados. É enviada sozinha quando houver internet.
          </p>
        </div>
      </div>
    );
  }
  if (outcome.kind === "error") {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <p className="text-sm">{outcome.message}</p>
      </div>
    );
  }
  const { result } = outcome;
  const tone =
    result.decision === "accepted"
      ? { box: "border-success/30 bg-success/5", icon: "text-success", Icon: CheckCircle2 }
      : result.decision === "review"
        ? { box: "border-warning/40 bg-warning/10", icon: "text-warning-strong", Icon: Clock }
        : {
            box: "border-destructive/30 bg-destructive/5",
            icon: "text-destructive",
            Icon: XCircle,
          };
  return (
    <div className={`mt-4 flex items-start gap-3 rounded-lg border p-3 ${tone.box}`}>
      <tone.Icon className={`mt-0.5 size-6 shrink-0 ${tone.icon}`} aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">
          {result.decision === "accepted"
            ? "Presença confirmada"
            : result.decision === "review"
              ? "Leitura por rever"
              : "Leitura recusada"}
        </p>
        <p className="text-xs text-muted-foreground">{result.message}</p>
        {result.lessons.length ? (
          <ul className="mt-1 space-y-0.5 text-xs">
            {result.lessons.map((lesson) => (
              <li key={lesson.sessionId}>
                {lesson.startsAt?.slice(0, 5)} · {lesson.label}
                {lesson.lateMinutes && lesson.lateMinutes > 5
                  ? ` · ${lesson.lateMinutes} min de atraso`
                  : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {result.decision !== "accepted" ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="size-3" aria-hidden /> Pode ler outra vez o QR do ecrã.
          </p>
        ) : null}
      </div>
    </div>
  );
}
