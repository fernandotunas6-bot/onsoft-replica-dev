import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, Clock3, LocateFixed, LogIn, LogOut, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/layout/PageHeader";
import { listMyTeacherLessonOccurrences, redeemTeacherLessonQr } from "@/features/hr/teacher-lessons";
import { toast } from "sonner";

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

type LocationProof = {
  latitude: number;
  longitude: number;
  accuracy: number;
} | null;

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-AO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getLocationProof(): Promise<LocationProof> {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15_000 },
    );
  });
}

export function TeacherAttendancePanel() {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const [token, setToken] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [lastLocationAvailable, setLastLocationAvailable] = useState<boolean | null>(null);

  const occurrences = useQuery({
    queryKey: ["hr", "teacher", "my-lessons"],
    queryFn: () => listMyTeacherLessonOccurrences(),
    retry: false,
  });

  const redeem = useMutation({
    mutationFn: async (qrToken: string) => {
      const location = await getLocationProof();
      setLastLocationAvailable(Boolean(location));
      return redeemTeacherLessonQr({
        data: {
          token: qrToken,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          accuracy: location?.accuracy ?? null,
        },
      });
    },
    onSuccess: async (result) => {
      const assurance = result.assurance;
      if (result.purpose === "check_in") {
        toast.success("Entrada confirmada", {
          description:
            assurance.decision === "review"
              ? `Presença aberta com confiança ${assurance.score}/100 e revisão automática activada.`
              : `Presença aberta com confiança ${assurance.score}/100. Faça o check-out no fim da aula.`,
        });
      } else if (result.occurrenceStatus === "pending_review" || assurance.decision === "review") {
        toast.info("Saída confirmada — presença em revisão", {
          description: `Confiança ${assurance.score}/100. O check-out foi registado, mas a remuneração permanece bloqueada até revisão.`,
        });
      } else {
        toast.success("Saída confirmada", {
          description: `Presença validada automaticamente com confiança ${assurance.score}/100 e elegível para remuneração.`,
        });
      }
      setToken("");
      await queryClient.invalidateQueries({ queryKey: ["hr", "teacher", "my-lessons"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível validar o QR."),
  });

  const stopCamera = () => {
    if (scanTimerRef.current) window.clearInterval(scanTimerRef.current);
    scanTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  useEffect(() => () => stopCamera(), []);

  const submitQr = (raw: string) => {
    const value = raw.trim();
    if (value.length < 32 || redeem.isPending) return;
    setToken(value);
    redeem.mutate(value);
  };

  const startCamera = async () => {
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector) {
      toast.info("Leitor QR nativo indisponível neste navegador. Use o campo de código abaixo.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);

      const detector = new Detector({ formats: ["qr_code"] });
      scanTimerRef.current = window.setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || redeem.isPending) return;
        try {
          const codes = await detector.detect(video);
          const raw = codes.find((item) => item.rawValue)?.rawValue?.trim();
          if (!raw) return;
          stopCamera();
          submitQr(raw);
        } catch {
          // Alguns browsers lançam erros transitórios enquanto o vídeo inicia.
        }
      }, 700);
    } catch (error) {
      stopCamera();
      toast.error(
        error instanceof Error
          ? `Não foi possível abrir a câmara: ${error.message}`
          : "Não foi possível abrir a câmara.",
      );
    }
  };

  const lessons = occurrences.data ?? [];
  const today = todayIso();
  const todayLessons = lessons.filter((lesson) => lesson.lesson_date === today);
  const confirmedCount = lessons.filter((lesson) => lesson.status === "confirmed").length;
  const nextLesson = todayLessons.find((lesson) => lesson.status === "scheduled");

  return (
    <Panel
      title="Presença e hora/aula"
      description="Validação multifator: QR temporário, identidade autenticada, janela temporal e localização quando disponível. Sinais insuficientes encaminham a presença para revisão."
      action={
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => void occurrences.refetch()}
          disabled={occurrences.isFetching}
        >
          <RefreshCw className="size-3.5" /> Actualizar
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Aulas hoje</p>
              <p className="mt-1 text-2xl font-semibold">{todayLessons.length}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Confirmadas</p>
              <p className="mt-1 text-2xl font-semibold">{confirmedCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Próxima</p>
              <p className="mt-1 text-sm font-semibold">
                {nextLesson
                  ? `${nextLesson.scheduled_starts_at.slice(0, 5)}–${nextLesson.scheduled_ends_at.slice(0, 5)}`
                  : "Sem aula pendente"}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="size-4" /> Confiança multifator
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                QR + professor autenticado + horário + contexto da escola. O score é calculado no servidor.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <LocateFixed className="size-4" /> Localização
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {lastLocationAvailable === true
                  ? "Localização fornecida na última validação."
                  : lastLocationAvailable === false
                    ? "Localização indisponível/negada; a presença pode exigir revisão conforme a política da escola."
                    : "Será solicitada no momento da validação. Coordenadas exactas só são guardadas se a escola activar essa opção."}
              </p>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Ler QR da aula</p>
                <p className="text-xs text-muted-foreground">
                  Autorize a câmara e, quando solicitado, a localização. Também pode introduzir o código manualmente.
                </p>
              </div>
              <QrCode className="size-5 text-muted-foreground" />
            </div>

            <div className="overflow-hidden rounded-lg border bg-muted">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`aspect-video w-full object-cover ${cameraActive ? "block" : "hidden"}`}
              />
              {!cameraActive ? (
                <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                  Câmara desligada
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" className="gap-1" onClick={() => void startCamera()} disabled={cameraActive}>
                <Camera className="size-3.5" /> Abrir câmara
              </Button>
              {cameraActive ? (
                <Button size="sm" variant="outline" onClick={stopCamera}>
                  Fechar câmara
                </Button>
              ) : null}
            </div>

            <div className="mt-4 flex gap-2">
              <Input
                aria-label="Código QR da aula"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Cole ou introduza o código QR"
                autoComplete="off"
              />
              <Button
                onClick={() => submitQr(token)}
                disabled={redeem.isPending || token.trim().length < 32}
              >
                {redeem.isPending ? "A validar…" : "Validar"}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold">Histórico recente</p>
          {occurrences.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar presenças…</p>
          ) : occurrences.isError ? (
            <p className="text-sm text-destructive">
              {occurrences.error instanceof Error
                ? occurrences.error.message
                : "Não foi possível carregar as presenças."}
            </p>
          ) : lessons.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Ainda não existem ocorrências de aula ligadas ao seu vínculo de RH.
            </p>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {lessons.slice(0, 20).map((lesson) => (
                <div key={lesson.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {lesson.lesson_date} · {lesson.scheduled_starts_at.slice(0, 5)}–{lesson.scheduled_ends_at.slice(0, 5)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {lesson.status === "confirmed"
                          ? "Aula confirmada"
                          : lesson.status === "scheduled"
                            ? "Aguardando presença"
                            : lesson.status}
                      </p>
                    </div>
                    {lesson.status === "confirmed" ? (
                      <CheckCircle2 className="size-4 text-primary" />
                    ) : lesson.actual_started_at ? (
                      <Clock3 className="size-4 text-muted-foreground" />
                    ) : (
                      <QrCode className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <LogIn className="size-3" /> Entrada {formatDateTime(lesson.actual_started_at)}
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <LogOut className="size-3" /> Saída {formatDateTime(lesson.actual_ended_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
