import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CheckCircle2,
  CheckSquare,
  Clock3,
  FolderOpen,
  LocateFixed,
  LogIn,
  LogOut,
  NotebookPen,
  PieChart,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/layout/PageHeader";
import {
  listMyTeacherLessonOccurrences,
  openMyLessonClassroom,
  redeemTeacherLessonQr,
  type ClassroomHandoff,
  type HrTeacherLessonOccurrence,
} from "@/features/hr/teacher-lessons";
import {
  teacherClassFilesSearch,
  teacherGradesSearch,
  teacherLessonPlansSearch,
} from "@/features/hr/teacher-classroom-links";
import { AttendanceCallDialog } from "@/features/pedagogica/components/AttendanceCallDialog";
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

function lessonTitle(lesson: HrTeacherLessonOccurrence) {
  if (lesson.class_group_name && lesson.subject_name) {
    return `${lesson.class_group_name} · ${lesson.subject_name}`;
  }
  return lesson.class_group_name || lesson.subject_name || "Aula";
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

export function TeacherAttendancePanel({
  initialCall = null,
  focusLesson = null,
}: {
  initialCall?: {
    sessionId?: string;
    classGroupId?: string;
    subjectId?: string;
    date?: string;
  } | null;
  /** Contexto da agenda (QR) — destaca a aula sem abrir a chamada. */
  focusLesson?: {
    classGroupId: string;
    subjectId: string;
    date?: string;
  } | null;
}) {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const [token, setToken] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [lastLocationAvailable, setLastLocationAvailable] = useState<boolean | null>(null);
  const [scanMode, setScanMode] = useState<"check_in" | "check_out">("check_in");
  const [callOpen, setCallOpen] = useState(Boolean(initialCall?.sessionId || initialCall?.classGroupId));
  const [classroom, setClassroom] = useState<ClassroomHandoff | null>(
    initialCall?.classGroupId && initialCall?.subjectId
      ? {
          occurrenceId: "",
          classGroupId: initialCall.classGroupId,
          classGroupName: "Turma",
          subjectId: initialCall.subjectId,
          subjectName: "Disciplina",
          lessonDate: initialCall.date ?? todayIso(),
          attendanceSessionId: initialCall.sessionId ?? null,
          startsAt: "",
          endsAt: "",
        }
      : null,
  );

  const occurrences = useQuery({
    queryKey: ["hr", "teacher", "my-lessons"],
    queryFn: () => listMyTeacherLessonOccurrences(),
    retry: false,
  });

  const openClassroomCall = (handoff: ClassroomHandoff) => {
    setClassroom(handoff);
    setCallOpen(true);
    const params = new URLSearchParams();
    if (handoff.attendanceSessionId) params.set("sessao", handoff.attendanceSessionId);
    params.set("turma", handoff.classGroupId);
    params.set("disciplina", handoff.subjectId);
    params.set("data", handoff.lessonDate);
    params.set("chamada", "1");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  };

  const openCall = useMutation({
    mutationFn: (occurrenceId: string) => openMyLessonClassroom({ data: { occurrenceId } }),
    onSuccess: (handoff) => {
      openClassroomCall(handoff);
      toast.success("Chamada aberta", {
        description: `${handoff.classGroupName} · ${handoff.subjectName}`,
      });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir a chamada."),
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
        setScanMode("check_out");
        toast.success("Entrada confirmada", {
          description: result.classroom
            ? `${result.classroom.classGroupName} · ${result.classroom.subjectName}. Abra a chamada dos alunos.`
            : assurance.decision === "review"
              ? `Presença aberta com confiança ${assurance.score}/100 e revisão automática activada.`
              : `Presença aberta com confiança ${assurance.score}/100. Faça o check-out no fim da aula.`,
        });
        if (result.classroom) openClassroomCall(result.classroom);
      } else if (result.occurrenceStatus === "pending_review" || assurance.decision === "review") {
        setScanMode("check_in");
        toast.info("Saída confirmada — presença em revisão", {
          description: `Confiança ${assurance.score}/100. O check-out foi registado, mas a remuneração permanece bloqueada até revisão.`,
        });
      } else {
        setScanMode("check_in");
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
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector;
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
  const focusDate = focusLesson?.date ?? today;
  const focusedLesson =
    focusLesson == null
      ? null
      : lessons.find(
          (lesson) =>
            lesson.class_group_id === focusLesson.classGroupId &&
            lesson.subject_id === focusLesson.subjectId &&
            lesson.lesson_date === focusDate,
        ) ??
        lessons.find(
          (lesson) =>
            lesson.class_group_id === focusLesson.classGroupId &&
            lesson.subject_id === focusLesson.subjectId,
        ) ??
        null;
  const todayLessons = lessons.filter((lesson) => lesson.lesson_date === today);
  const confirmedCount = lessons.filter((lesson) => lesson.status === "confirmed").length;
  const awaitingCheckout = todayLessons.find(
    (lesson) => lesson.actual_started_at && !lesson.actual_ended_at,
  );
  const nextLesson =
    focusedLesson ??
    todayLessons.find((lesson) => !lesson.actual_started_at && lesson.status === "scheduled") ??
    awaitingCheckout ??
    todayLessons[0];

  const awaitingCheckoutId = awaitingCheckout?.id ?? null;
  useEffect(() => {
    if (awaitingCheckoutId) setScanMode("check_out");
  }, [awaitingCheckoutId]);

  return (
    <>
      <Panel
        title="Presença e hora/aula"
        description="Valide o QR no telemóvel ou tablet. Depois do check-in, abra a chamada da turma; no fim da aula, leia o QR de saída."
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
            {focusLesson && !initialCall ? (
              <div className="rounded-lg border border-primary/30 bg-primary-soft/40 p-3">
                <p className="text-sm font-semibold">Aula da agenda</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {focusedLesson
                    ? `${lessonTitle(focusedLesson)} · ${focusedLesson.scheduled_starts_at.slice(0, 5)}–${focusedLesson.scheduled_ends_at.slice(0, 5)}. Leia o QR de entrada para assinar esta hora/aula.`
                    : "Contexto recebido da agenda. Leia o QR de entrada; se a ocorrência existir nas suas aulas, fica destacada abaixo."}
                </p>
              </div>
            ) : null}
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
                <p className="text-xs text-muted-foreground">Próxima / em curso</p>
                <p className="mt-1 text-sm font-semibold leading-snug">
                  {nextLesson
                    ? `${lessonTitle(nextLesson)} · ${nextLesson.scheduled_starts_at.slice(0, 5)}`
                    : "Sem aula pendente"}
                </p>
              </div>
            </div>

            {awaitingCheckout ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
                <p className="text-sm font-semibold">
                  Aula em curso — falta o check-out
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {lessonTitle(awaitingCheckout)} · entrada{" "}
                  {formatDateTime(awaitingCheckout.actual_started_at)}. Peça o QR de saída à
                  secretaria e valide-o aqui para fechar a hora/aula.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1 touch-manipulation"
                    onClick={() => {
                      setScanMode("check_out");
                      void startCamera();
                    }}
                  >
                    <LogOut className="size-3.5" /> Ler QR de saída
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 touch-manipulation"
                    disabled={openCall.isPending}
                    onClick={() => openCall.mutate(awaitingCheckout.id)}
                  >
                    <CheckSquare className="size-3.5" /> Abrir chamada dos alunos
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="size-4" /> Confiança multifator
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  QR + professor autenticado + horário + contexto da escola. O score é calculado no
                  servidor.
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
                  <p className="font-semibold">
                    {scanMode === "check_out" ? "Ler QR de saída" : "Ler QR de entrada"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {scanMode === "check_out"
                      ? "No fim da aula, leia o QR de check-out gerado pela secretaria para confirmar a hora/aula."
                      : "Autorize a câmara e, quando solicitado, a localização. Também pode introduzir o código manualmente."}
                  </p>
                </div>
                <QrCode className="size-5 text-muted-foreground" />
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={scanMode === "check_in" ? "default" : "outline"}
                  onClick={() => setScanMode("check_in")}
                >
                  <LogIn className="mr-1 size-3.5" /> Entrada
                </Button>
                <Button
                  size="sm"
                  variant={scanMode === "check_out" ? "default" : "outline"}
                  onClick={() => setScanMode("check_out")}
                >
                  <LogOut className="mr-1 size-3.5" /> Saída
                </Button>
              </div>

              {classroom ? (
                <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-sm font-semibold text-primary">
                    {classroom.classGroupName} · {classroom.subjectName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {classroom.lessonDate}
                    {classroom.startsAt
                      ? ` · ${String(classroom.startsAt).slice(0, 5)}–${String(classroom.endsAt).slice(0, 5)}`
                      : ""}
                    {" · "}chamada e pauta desta aula
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="touch-manipulation"
                      onClick={() => setCallOpen(true)}
                    >
                      Abrir lista de alunos e marcar presença
                    </Button>
                    <Button asChild size="sm" variant="outline" className="gap-1 touch-manipulation">
                      <Link
                        to="/pedagogica"
                        search={teacherGradesSearch(classroom.classGroupId, classroom.subjectId)}
                      >
                        <PieChart className="size-3.5" /> Lançar notas
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="gap-1 touch-manipulation">
                      <Link
                        to="/planos-aula"
                        search={teacherLessonPlansSearch(
                          classroom.classGroupId,
                          classroom.subjectId,
                        )}
                      >
                        <NotebookPen className="size-3.5" /> Plano
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="gap-1 touch-manipulation">
                      <Link
                        to="/arquivos"
                        search={teacherClassFilesSearch(classroom.classGroupId)}
                      >
                        <FolderOpen className="size-3.5" /> Materiais
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : null}

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
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={() => void startCamera()}
                  disabled={cameraActive}
                >
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
                  placeholder={
                    scanMode === "check_out"
                      ? "Cole o código QR de saída"
                      : "Cole ou introduza o código QR de entrada"
                  }
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
            <p className="text-sm font-semibold">Minhas aulas</p>
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
                Ainda não existem ocorrências de aula ligadas ao seu vínculo de RH. Confirme que a
                secretaria associou o seu login à ficha de professor e sincronizou o horário.
              </p>
            ) : (
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {lessons.slice(0, 24).map((lesson) => {
                  const needsCheckout = Boolean(
                    lesson.actual_started_at && !lesson.actual_ended_at,
                  );
                  const canOpenCall = Boolean(lesson.actual_started_at);
                  const isFocused = focusedLesson?.id === lesson.id;
                  return (
                    <div
                      key={lesson.id}
                      className={
                        isFocused
                          ? "rounded-lg border border-primary/40 bg-primary-soft/30 p-3 text-sm"
                          : "rounded-lg border p-3 text-sm"
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold leading-snug">
                            {lessonTitle(lesson)}
                            {isFocused ? (
                              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                Agenda
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {lesson.lesson_date} · {lesson.scheduled_starts_at.slice(0, 5)}–
                            {lesson.scheduled_ends_at.slice(0, 5)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {lesson.status === "confirmed"
                              ? "Aula confirmada"
                              : needsCheckout
                                ? "Em curso — falta check-out"
                                : lesson.status === "scheduled"
                                  ? "Aguardando check-in"
                                  : lesson.status}
                          </p>
                        </div>
                        {lesson.status === "confirmed" ? (
                          <CheckCircle2 className="size-4 shrink-0 text-primary" />
                        ) : needsCheckout ? (
                          <Clock3 className="size-4 shrink-0 text-warning" />
                        ) : (
                          <QrCode className="size-4 shrink-0 text-muted-foreground" />
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <LogIn className="size-3" /> Entrada{" "}
                          {formatDateTime(lesson.actual_started_at)}
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <LogOut className="size-3" /> Saída{" "}
                          {formatDateTime(lesson.actual_ended_at)}
                        </span>
                      </div>
                      {canOpenCall || needsCheckout || (lesson.class_group_id && lesson.subject_id) ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {canOpenCall ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8 gap-1 text-xs touch-manipulation"
                              disabled={openCall.isPending}
                              onClick={() => openCall.mutate(lesson.id)}
                            >
                              <CheckSquare className="size-3.5" /> Abrir chamada
                            </Button>
                          ) : null}
                          {lesson.class_group_id && lesson.subject_id ? (
                            <>
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 text-xs touch-manipulation"
                              >
                                <Link
                                  to="/pedagogica"
                                  search={teacherGradesSearch(
                                    lesson.class_group_id,
                                    lesson.subject_id,
                                  )}
                                >
                                  <PieChart className="size-3.5" /> Pauta
                                </Link>
                              </Button>
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 text-xs touch-manipulation"
                              >
                                <Link
                                  to="/planos-aula"
                                  search={teacherLessonPlansSearch(
                                    lesson.class_group_id,
                                    lesson.subject_id,
                                  )}
                                >
                                  <NotebookPen className="size-3.5" /> Plano
                                </Link>
                              </Button>
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 text-xs touch-manipulation"
                              >
                                <Link
                                  to="/arquivos"
                                  search={teacherClassFilesSearch(lesson.class_group_id)}
                                >
                                  <FolderOpen className="size-3.5" /> Materiais
                                </Link>
                              </Button>
                            </>
                          ) : null}
                          {needsCheckout ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 text-xs touch-manipulation"
                              onClick={() => {
                                setScanMode("check_out");
                                void startCamera();
                              }}
                            >
                              <LogOut className="size-3.5" /> Check-out
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Panel>

      <AttendanceCallDialog
        open={callOpen}
        onOpenChange={setCallOpen}
        sessionId={classroom?.attendanceSessionId || undefined}
        classGroupId={classroom?.classGroupId}
        subjectId={classroom?.subjectId}
        date={classroom?.lessonDate}
      />
    </>
  );
}
