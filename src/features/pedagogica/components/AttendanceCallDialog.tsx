import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  X,
  AlertCircle,
  Clock,
  Search,
  CheckCheck,
  Save,
  Edit3,
  User,
  ArrowUpDown,
  Lock,
  PieChart,
  NotebookPen,
  FolderOpen,
  FileCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  getAttendanceCallSheet,
  submitAttendanceCallBatch,
  editFinalizedAttendanceCall,
  type AttendanceStatus,
} from "@/features/pedagogica/attendance-server";
import {
  teacherClassFilesSearch,
  teacherGradesSearch,
  teacherLessonPlansSearch,
} from "@/features/hr/teacher-classroom-links";

/** Os quatro estados que o professor marca, com as cores de cada um. */
const STATUS_OPTIONS = [
  {
    status: "present",
    label: "Presente",
    short: "Presente",
    plural: "Presentes",
    icon: Check,
    text: "text-success",
    ring: "ring-success/60",
    row: "border-success/30 bg-success/5",
    selected: "border-success bg-success text-success-foreground shadow-sm",
    activeChip: "border-success/40 bg-success/10",
  },
  {
    status: "absent",
    label: "Falta",
    short: "Falta",
    plural: "Faltas",
    icon: X,
    text: "text-destructive",
    ring: "ring-destructive/60",
    row: "border-destructive/30 bg-destructive/5",
    selected: "border-destructive bg-destructive text-destructive-foreground shadow-sm",
    activeChip: "border-destructive/40 bg-destructive/10",
  },
  {
    status: "late",
    label: "Atrasado",
    short: "Atraso",
    plural: "Atrasos",
    icon: AlertCircle,
    text: "text-warning-strong",
    ring: "ring-warning/70",
    row: "border-warning/30 bg-warning/5",
    selected: "border-warning bg-warning text-warning-foreground shadow-sm",
    activeChip: "border-warning/40 bg-warning/10",
  },
  {
    status: "excused",
    label: "Justificada",
    short: "Justif.",
    plural: "Justificadas",
    icon: FileCheck,
    text: "text-info",
    ring: "ring-info/60",
    row: "border-info/30 bg-info/5",
    selected: "border-info bg-info text-info-foreground shadow-sm",
    activeChip: "border-info/40 bg-info/10",
  },
] as const satisfies ReadonlyArray<{
  status: AttendanceStatus;
  label: string;
  short: string;
  plural: string;
  icon: typeof Check;
  text: string;
  ring: string;
  row: string;
  selected: string;
  activeChip: string;
}>;

export function AttendanceCallDialog({
  open,
  onOpenChange,
  sessionId,
  classGroupId,
  subjectId,
  date,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId?: string;
  classGroupId?: string;
  subjectId?: string;
  date?: string;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"name" | "number">("name");
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [editReason, setEditReason] = useState("");
  const [confirmReasonModalOpen, setConfirmReasonModalOpen] = useState(false);

  const sheetQuery = useQuery({
    queryKey: ["attendance-sheet", sessionId, classGroupId, subjectId, date],
    enabled: open && Boolean(sessionId || (classGroupId && subjectId)),
    queryFn: () =>
      getAttendanceCallSheet({
        data: { sessionId, classGroupId, subjectId, date },
      }),
  });

  const [studentStatuses, setStudentStatuses] = useState<
    Record<string, { status: AttendanceStatus; notes?: string }>
  >({});

  useEffect(() => {
    if (sheetQuery.data) {
      const initialMap: Record<string, { status: AttendanceStatus; notes?: string }> = {};
      for (const st of sheetQuery.data.students) {
        initialMap[st.student_id] = {
          status: st.status,
          notes: st.notes ?? undefined,
        };
      }
      setStudentStatuses(initialMap);
      setIsEditingMode(sheetQuery.data.session.status !== "completed");
    }
  }, [sheetQuery.data]);

  const submitBatchMutation = useMutation({
    mutationFn: submitAttendanceCallBatch,
    onSuccess: () => {
      toast.success("Chamada realizada com sucesso!", {
        description: "Presenças registadas. Pode lançar notas desta turma a seguir.",
      });
      queryClient.invalidateQueries({ queryKey: ["attendance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance-sessions"] });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error("Não foi possível guardar a chamada", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    },
  });

  const editBatchMutation = useMutation({
    mutationFn: editFinalizedAttendanceCall,
    onSuccess: () => {
      toast.success("Chamada actualizada e auditada!", {
        description: "Registo histórico guardado com motivo.",
      });
      queryClient.invalidateQueries({ queryKey: ["attendance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setConfirmReasonModalOpen(false);
      setEditReason("");
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error("Não foi possível actualizar a chamada", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    },
  });

  const handleMarkAllPresent = () => {
    if (!sheetQuery.data) return;
    setStudentStatuses((prev) => {
      const next = { ...prev };
      for (const st of sheetQuery.data.students) {
        next[st.student_id] = {
          ...next[st.student_id],
          status: "present",
        };
      }
      return next;
    });
    toast.info("Todos os alunos marcados como presentes.", {
      description: "Ajuste manualmente apenas as excepções.",
    });
  };

  const setSingleStatus = (studentId: string, status: AttendanceStatus) => {
    setStudentStatuses((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
      },
    }));
  };

  const handleSaveCall = () => {
    if (!sheetQuery.data) return;
    const records = Object.entries(studentStatuses).map(([stId, val]) => ({
      studentId: stId,
      status: val.status,
      notes: val.notes,
    }));

    if (sheetQuery.data.session.status === "completed") {
      setConfirmReasonModalOpen(true);
    } else {
      submitBatchMutation.mutate({
        data: {
          sessionId: sheetQuery.data.session.id,
          records,
        },
      });
    }
  };

  const handleConfirmEditWithReason = () => {
    if (!sheetQuery.data) return;
    if (editReason.trim().length < 5) {
      toast.error("Informe o motivo da alteração", {
        description: "Deve conter pelo menos 5 caracteres para auditoria.",
      });
      return;
    }
    const records = Object.entries(studentStatuses).map(([stId, val]) => ({
      studentId: stId,
      status: val.status,
      notes: val.notes,
    }));

    editBatchMutation.mutate({
      data: {
        sessionId: sheetQuery.data.session.id,
        reason: editReason.trim(),
        records,
      },
    });
  };

  const data = sheetQuery.data;
  const statusOf = (studentId: string): AttendanceStatus =>
    studentStatuses[studentId]?.status || "not_registered";
  const allStudents = data?.students ?? [];
  const filteredStudents = allStudents
    .filter((st) =>
      search
        ? st.full_name.toLowerCase().includes(search.toLowerCase()) ||
          st.student_number.toLowerCase().includes(search.toLowerCase())
        : true,
    )
    .filter((st) => statusFilter === "all" || statusOf(st.student_id) === statusFilter)
    .sort((a, b) => {
      if (sortOrder === "number") {
        return (a.student_number || "").localeCompare(b.student_number || "", undefined, {
          numeric: true,
        });
      }
      return a.full_name.localeCompare(b.full_name, "pt-PT");
    });

  const isCompleted = data?.session.status === "completed";
  const disabledInputs = isCompleted && !isEditingMode;
  const gradesSearch =
    data?.session.class_group_id && data?.session.subject_id
      ? teacherGradesSearch(data.session.class_group_id, data.session.subject_id)
      : null;
  const plansSearch =
    data?.session.class_group_id && data?.session.subject_id
      ? teacherLessonPlansSearch(data.session.class_group_id, data.session.subject_id)
      : null;
  const filesSearch = data?.session.class_group_id
    ? teacherClassFilesSearch(data.session.class_group_id)
    : null;

  const countOf = (status: AttendanceStatus) =>
    allStudents.filter((st) => statusOf(st.student_id) === status).length;
  const totalStudents = allStudents.length;
  const pendingCount = countOf("not_registered");
  const markedCount = totalStudents - pendingCount;
  const progress = totalStudents ? Math.round((markedCount / totalStudents) * 100) : 0;
  const toggleFilter = (next: AttendanceStatus) =>
    setStatusFilter((current) => (current === next ? "all" : next));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-lg">
          <DialogHeader className="space-y-0 border-b border-border bg-muted/20 px-4 pb-3 pt-[max(0.875rem,env(safe-area-inset-top))] text-left sm:p-5">
            <div className="flex items-start justify-between gap-3 pr-8">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-lg font-extrabold leading-tight sm:text-xl">
                  <CheckCheck className="size-5 shrink-0 text-primary sm:size-6" />
                  <span className="truncate">
                    {data?.session.class_group_name ?? "Turma"} ·{" "}
                    {data?.session.subject_name ?? "Disciplina"}
                  </span>
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs">
                  {data?.session.lesson_date
                    ? new Date(`${data.session.lesson_date}T12:00:00Z`).toLocaleDateString(
                        "pt-PT",
                        { weekday: "long", day: "numeric", month: "long" },
                      )
                    : "Chamada de hoje"}
                  {data?.session.starts_at ? ` · ${data.session.starts_at}` : ""}
                </DialogDescription>
              </div>
              {isCompleted ? (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-1 border-success/30 bg-success/10 px-2 py-0.5 text-success"
                >
                  <Lock className="size-3" /> Concluída
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-1 border-warning/30 bg-warning/10 px-2 py-0.5 text-warning-strong"
                >
                  <Clock className="size-3" /> Pendente
                </Badge>
              )}
            </div>

            {/* PROGRESSO: quantos já estão marcados */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">
                  {markedCount} de {totalStudents} marcados
                </span>
                {pendingCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggleFilter("not_registered")}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    {statusFilter === "not_registered" ? "Ver todos" : `${pendingCount} por marcar`}
                  </button>
                ) : (
                  <span className="font-semibold text-success">Todos marcados</span>
                )}
              </div>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Alunos marcados"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* CONTADORES: tocar filtra a lista por esse estado */}
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {STATUS_OPTIONS.map((option) => {
                const active = statusFilter === option.status;
                const Icon = option.icon;
                return (
                  <button
                    key={option.status}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleFilter(option.status)}
                    className={`flex flex-col items-center rounded-xl border px-1 py-1.5 transition-colors touch-manipulation ${
                      active ? option.activeChip : "border-border bg-background hover:bg-muted/60"
                    }`}
                  >
                    <span
                      className={`flex items-center gap-1 text-base font-extrabold ${option.text}`}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {countOf(option.status)}
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {option.plural}
                    </span>
                  </button>
                );
              })}
            </div>
          </DialogHeader>

          {/* PESQUISA E ACÇÕES */}
          <div className="space-y-2 border-b border-border bg-background px-4 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Pesquisar aluno"
                placeholder="Pesquisar por nome ou número…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs"
                onClick={() => setSortOrder(sortOrder === "name" ? "number" : "name")}
              >
                <ArrowUpDown className="size-3.5" />
                {sortOrder === "name" ? "Nome" : "Número"}
              </Button>
              {!isCompleted || isEditingMode ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleMarkAllPresent}
                  className="h-9 flex-1 gap-1.5 bg-primary-soft text-xs font-semibold text-primary-strong hover:bg-primary/20 sm:flex-none"
                >
                  <CheckCheck className="size-4" /> Todos presentes
                </Button>
              ) : null}
            </div>
          </div>

          {/* LISTA DE ALUNOS */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
            {sheetQuery.isLoading ? (
              <div className="space-y-2" aria-busy="true" aria-label="A carregar lista da turma">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="h-[5.5rem] animate-pulse rounded-2xl bg-muted/60" />
                ))}
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {statusFilter !== "all" || search
                  ? "Nenhum aluno com este filtro."
                  : "Nenhum aluno encontrado nesta turma."}
                {statusFilter !== "all" ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setStatusFilter("all")}
                    >
                      Ver todos
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <ul className="space-y-2">
                {filteredStudents.map((st, index) => {
                  const currentStatus = statusOf(st.student_id);
                  const current = STATUS_OPTIONS.find((option) => option.status === currentStatus);
                  return (
                    <li
                      key={st.student_id}
                      className={`rounded-2xl border p-2.5 shadow-xs transition-colors sm:flex sm:items-center sm:justify-between sm:gap-3 sm:p-3 ${
                        current ? current.row : "border-border bg-card"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                        <span className="w-5 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                          {index + 1}
                        </span>
                        <span
                          className={`shrink-0 rounded-full p-0.5 ring-2 ${current ? current.ring : "ring-transparent"}`}
                        >
                          <UserAvatar
                            url={st.photo_url}
                            initials={st.full_name.slice(0, 2).toUpperCase()}
                            className="size-10"
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-foreground">
                            {st.full_name}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            Nº {st.student_number || "—"}
                            {current ? (
                              <span className={`ml-2 font-sans font-semibold ${current.text}`}>
                                · {current.label}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>

                      <div
                        role="radiogroup"
                        aria-label={`Presença de ${st.full_name}`}
                        className="mt-2 grid grid-cols-4 gap-1.5 sm:mt-0 sm:flex sm:shrink-0"
                      >
                        {STATUS_OPTIONS.map((option) => {
                          const selected = currentStatus === option.status;
                          const Icon = option.icon;
                          return (
                            <button
                              key={option.status}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              disabled={disabledInputs}
                              onClick={() => setSingleStatus(st.student_id, option.status)}
                              className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl border text-[11px] font-bold transition-all touch-manipulation active:scale-95 disabled:pointer-events-none disabled:opacity-60 sm:h-11 sm:w-[4.75rem] ${
                                selected
                                  ? option.selected
                                  : "border-border bg-background text-muted-foreground hover:bg-muted/60"
                              }`}
                            >
                              <Icon className="size-4" aria-hidden />
                              {option.short}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:space-x-0 sm:bg-muted/20 sm:p-4">
            <div className="flex items-center gap-2">
              {isCompleted && !isEditingMode ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditingMode(true)}
                  className="h-10 flex-1 gap-2 text-xs sm:flex-none"
                >
                  <Edit3 className="size-4" /> Corrigir chamada
                </Button>
              ) : null}
              {gradesSearch ? (
                <Button
                  asChild
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-10 gap-1.5 text-xs font-bold"
                >
                  <Link to="/pedagogica" search={gradesSearch} aria-label="Lançar notas">
                    <PieChart className="size-4" />
                    <span className="hidden sm:inline">Lançar notas</span>
                  </Link>
                </Button>
              ) : null}
              {plansSearch ? (
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 text-xs font-bold"
                >
                  <Link to="/planos-aula" search={plansSearch} aria-label="Plano de aula">
                    <NotebookPen className="size-4" />
                    <span className="hidden sm:inline">Plano</span>
                  </Link>
                </Button>
              ) : null}
              {filesSearch ? (
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 text-xs font-bold"
                >
                  <Link to="/arquivos" search={filesSearch} aria-label="Materiais da turma">
                    <FolderOpen className="size-4" />
                    <span className="hidden sm:inline">Materiais</span>
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-10 sm:ml-0"
                onClick={() => onOpenChange(false)}
              >
                Fechar
              </Button>
            </div>
            {!isCompleted || isEditingMode ? (
              <Button
                type="button"
                onClick={handleSaveCall}
                disabled={submitBatchMutation.isPending || editBatchMutation.isPending}
                className="h-12 w-full gap-2 px-6 text-sm font-bold sm:h-10 sm:w-auto"
              >
                <Save className="size-4" />
                {isCompleted
                  ? "Guardar correcção"
                  : pendingCount > 0
                    ? `Concluir chamada · ${markedCount}/${totalStudents}`
                    : "Concluir chamada"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONFIORMAÇÃO DE MOTIVO PARA AUDITORIA DE EDIÇÃO */}
      <Dialog open={confirmReasonModalOpen} onOpenChange={setConfirmReasonModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Edit3 className="size-5 text-warning" /> Motivo da Alteração de Chamada
            </DialogTitle>
            <DialogDescription className="text-xs mt-1">
              Esta chamada já estava concluída. Para auditoria e integridade do histórico
              pedagógico, indique o motivo da alteração de presença ou falta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <Textarea
              aria-label="Motivo da correcção"
              placeholder="Ex: Corrigido atraso do aluno João a pedido do encarregado com justificação..."
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              className="min-h-[100px] text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmReasonModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmEditWithReason}
              disabled={editBatchMutation.isPending || editReason.trim().length < 5}
              className="gap-2 font-bold"
            >
              Confirmar & Guardar na Auditoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
