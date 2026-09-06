import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, Clock3, LogIn, LogOut, QrCode, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/layout/PageHeader";
import { listMyTeacherLessonOccurrences, redeemTeacherLessonQr } from "@/features/hr/teacher-lessons";
import { toast } from "sonner";

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

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

export function TeacherAttendancePanel() {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const [token, setToken] = useState("");
  const [cameraActive, setCameraActive] = useState(false);

  const occurrences = useQuery({
    queryKey: ["hr", "teacher", "my-lessons"],
    queryFn: () => listMyTeacherLessonOccurrences(),
    retry: false,
  });

  const redeem = useMutation({
    mutationFn: (qrToken: string) => redeemTeacherLessonQr({ data: { token: qrToken } }),
    onSuccess: async (result) => {
      toast.success(result.purpose === "check_in" ? "Entrada confirmada" : "Saída confirmada", {
        description:
          result.purpose === "check_out"
            ? "A aula foi validada e ficou elegível para remuneração conforme o contrato."
            : "A presença foi aberta. Faça o check-out no fim da aula.",
      });
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
          setToken(raw);
          redeem.mutate(raw);
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
      description="Faça check-in e check-out por QR. Apenas a saída válida após a entrada fecha a aula para remuneração."
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

          <div className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Ler QR da aula</p>
                <p className="text-xs text-muted-foreground">
                  Autorize a câmara traseira no telemóvel ou introduza o código manualmente.
                </p>
              </div>
              <QrCode className="size-5 text-muted-foreground" />
            </div>

            <div className="overflow-hidden rounded-lg border bg-black/90">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`aspect-video w-full object-cover ${cameraActive ? "block" : "hidden"}`}
              />
              {!cameraActive ? (
                <div className="flex aspect-video items-center justify-center text-sm text-white/70">
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
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Cole ou introduza o código QR"
                autoComplete="off"
              />
              <Button
                onClick={() => redeem.mutate(token.trim())}
                disabled={redeem.isPending || token.trim().length < 32}
              >
                Validar
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
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : lesson.actual_started_at ? (
                      <Clock3 className="size-4 text-amber-600" />
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
