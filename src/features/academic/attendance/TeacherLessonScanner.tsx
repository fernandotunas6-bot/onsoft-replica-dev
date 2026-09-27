import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, AlertTriangle, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";

type ScanResult = { accepted: boolean; message: string };
type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
};
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

export function TeacherLessonScanner({
  lessonId,
  operation,
  submitChallenge,
}: {
  lessonId: string;
  operation: "check_in" | "check_out";
  // The authenticated backend must verify the QR signature, nonce, lesson, teacher,
  // school, time window and idempotency. Never trust the client scan alone.
  submitChallenge: (input: {
    lessonId: string;
    operation: "check_in" | "check_out";
    qrPayload: string;
  }) => Promise<ScanResult>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [running, setRunning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [accepted, setAccepted] = useState(false);
  const lastScan = useRef("");
  const inFlight = useRef(false);
  const currentContext = useRef(`${lessonId}:${operation}`);
  currentContext.current = `${lessonId}:${operation}`;
  useEffect(() => {
    setRunning(false);
    setManualCode("");
    setMessage("");
    setAccepted(false);
    lastScan.current = "";
  }, [lessonId, operation]);
  const submit = async (qrPayload: string) => {
    const payload = qrPayload.trim();
    if (!payload || inFlight.current || accepted || lastScan.current === payload) return;
    const context = `${lessonId}:${operation}`;
    inFlight.current = true;
    lastScan.current = payload;
    setBusy(true);
    try {
      const result = await submitChallenge({ lessonId, operation, qrPayload: payload });
      if (currentContext.current !== context) return;
      setMessage(result.message);
      setAccepted(result.accepted);
      if (!result.accepted) lastScan.current = "";
      if (result.accepted) setRunning(false);
    } catch {
      if (currentContext.current !== context) return;
      lastScan.current = "";
      setAccepted(false);
      setMessage(
        "Não foi possível confirmar a leitura. Tente novamente; a aula permanece pendente.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!running || busy || accepted) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    let frame = 0;
    const Detector = (
      globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setMessage(
        "Este navegador não suporta leitura por câmara. Utilize um leitor externo ou introduza o código.",
      );
      setRunning(false);
      return;
    }
    const detector = new Detector({ formats: ["qr_code"] });
    const scan = async () => {
      if (cancelled || !video.current) return;
      try {
        const found = await detector.detect(video.current);
        if (found[0]?.rawValue) {
          setRunning(false);
          void submit(found[0].rawValue);
          return;
        }
      } catch {
        // A frame may be unavailable while the camera is initializing.
      }
      if (!cancelled)
        frame = requestAnimationFrame(() => {
          void scan();
        });
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(async (camera) => {
        if (cancelled) {
          camera.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = camera;
        if (video.current) {
          video.current.srcObject = camera;
          await video.current.play();
          if (!cancelled) void scan();
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRunning(false);
          setMessage("Não foi possível aceder à câmara. Verifique as permissões.");
        }
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (video.current) video.current.srcObject = null;
    };
    // submit is intentionally not a dependency: restarting the camera on every state change
    // would interrupt an active scan. The effect is restarted by running/busy/accepted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, busy, accepted, lessonId, operation]);

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 space-y-3"
      aria-label="Confirmar aula por QR Code"
    >
      <div className="flex items-center gap-2">
        <ScanLine className="size-5 text-primary" />
        <h3 className="font-semibold">
          {operation === "check_in" ? "Confirmar início da aula" : "Confirmar fim da aula"}
        </h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Leia o QR Code apresentado pela escola. A confirmação depende da validação no servidor.
      </p>
      {running && (
        <video
          ref={video}
          playsInline
          muted
          className="w-full max-w-sm rounded-xl bg-black"
          aria-label="Leitor de QR Code"
        />
      )}
      <Button
        type="button"
        variant="outline"
        disabled={busy || accepted}
        onClick={() => setRunning((value) => !value)}
      >
        <Camera className="mr-2 size-4" />
        {running ? "Desligar câmara" : "Abrir scanner"}
      </Button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(manualCode);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
          aria-label="Código de QR Code"
          placeholder="Código do leitor externo"
          value={manualCode}
          onChange={(event) => setManualCode(event.target.value)}
          disabled={busy || accepted}
        />
        <Button type="submit" disabled={!manualCode.trim() || busy || accepted}>
          Confirmar
        </Button>
      </form>
      {message && (
        <p role="status" className="flex items-start gap-2 text-sm">
          {accepted ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="size-4 text-amber-600" />
          )}
          {message}
        </p>
      )}
    </section>
  );
}
