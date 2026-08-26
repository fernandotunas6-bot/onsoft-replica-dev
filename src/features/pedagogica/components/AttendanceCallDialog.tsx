import { useEffect, useState } from "react";
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
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [editReason, setEditReason] = useState("");
  const [confirmReasonModalOpen, setConfirmReasonModalOpen] = useState(false);

  const sheetQuery = useQuery({
    queryKey: ["attendance-sheet", sessionId, classGroupId, subjectId, date],
    enabled: open && Boolean(sessionId || (classGroupId && subjectId)),
    queryFn: () => getAttendanceCallSheet({ sessionId, classGroupId, subjectId, date }),
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
        description: "Presenças e faltas registadas no sistema.",
      });
      queryClient.invalidateQueries({ queryKey: ["attendance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
        sessionId: sheetQuery.data.session.id,
        records,
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
      sessionId: sheetQuery.data.session.id,
      reason: editReason.trim(),
      records,
    });
  };

  const data = sheetQuery.data;
  const filteredStudents = (data?.students ?? [])
    .filter((st) =>
      search
        ? st.full_name.toLowerCase().includes(search.toLowerCase()) ||
          st.student_number.toLowerCase().includes(search.toLowerCase())
        : true,
    )
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

  const presentCount = Object.values(studentStatuses).filter((s) => s.status === "present").length;
  const absentCount = Object.values(studentStatuses).filter((s) => s.status === "absent").length;
  const lateCount = Object.values(studentStatuses).filter((s) => s.status === "late").length;
  const excusedCount = Object.values(studentStatuses).filter((s) => s.status === "excused").length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-5 border-b border-border bg-muted/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <DialogTitle className="text-xl font-extrabold flex items-center gap-2">
                  <CheckCheck className="size-6 text-primary" />
                  {data?.session.class_group_name ?? "Turma"} ·{" "}
                  {data?.session.subject_name ?? "Disciplina"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs">
                  {data?.session.lesson_date
                    ? new Date(`${data.session.lesson_date}T12:00:00Z`).toLocaleDateString(
                        "pt-PT",
                        { weekday: "long", day: "numeric", month: "long", year: "numeric" },
                      )
                    : "Chamada de hoje"}
                  {data?.session.starts_at ? ` · ${data.session.starts_at}` : ""}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                {isCompleted ? (
                  <Badge
                    variant="outline"
                    className="bg-success/10 text-success border-success/30 gap-1.5 py-1 px-3"
                  >
                    <Lock className="size-3.5" /> Chamada Concluída
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-warning/10 text-warning-foreground border-warning/30 gap-1.5 py-1 px-3"
                  >
                    <Clock className="size-3.5" /> Chamada Pendente
                  </Badge>
                )}
              </div>
            </div>

            {/* BARRA DE ESTATÍSTICAS DA CHAMADA */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background p-3 border border-border">
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="text-success flex items-center gap-1">
                  <Check className="size-3.5" /> {presentCount} Presentes
                </span>
                <span className="text-destructive flex items-center gap-1">
                  <X className="size-3.5" /> {absentCount} Faltas
                </span>
                <span className="text-warning-foreground flex items-center gap-1">
                  <AlertCircle className="size-3.5" /> {lateCount} Atrasos
                </span>
                <span className="text-info flex items-center gap-1">
                  <Check className="size-3.5" /> {excusedCount} Justificadas
                </span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                Total: {data?.totalCount ?? 0} alunos
              </span>
            </div>
          </DialogHeader>

          {/* BARRA DE CONTROLO DE PESQUISA E ACÇÃO EM MASSA */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border bg-background">
            <div className="flex items-center gap-2 min-w-[220px] flex-1">
              <div className="relative w-full">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar aluno por nome ou número..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-9"
                onClick={() => setSortOrder(sortOrder === "name" ? "number" : "name")}
              >
                <ArrowUpDown className="size-3.5" />
                {sortOrder === "name" ? "Por Nome" : "Por Número"}
              </Button>
              {!isCompleted || isEditingMode ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleMarkAllPresent}
                  className="gap-1.5 text-xs h-9 font-semibold bg-primary-soft text-primary-strong hover:bg-primary/20"
                >
                  <CheckCheck className="size-4" /> Marcar todos presentes
                </Button>
              ) : null}
            </div>
          </div>

          {/* LISTA DE ALUNOS COM BOTÕES TÁCTEIS DE ALTA VELOCIDADE */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {sheetQuery.isLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
                A carregar lista da turma...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhum aluno encontrado nesta turma.
              </div>
            ) : (
              filteredStudents.map((st) => {
                const currentStatus = studentStatuses[st.student_id]?.status || "not_registered";
                return (
                  <div
                    key={st.student_id}
                    className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                      currentStatus === "present"
                        ? "border-success/30 bg-success/5"
                        : currentStatus === "absent"
                          ? "border-destructive/30 bg-destructive/5"
                          : currentStatus === "late"
                            ? "border-warning/30 bg-warning/5"
                            : currentStatus === "excused"
                              ? "border-info/30 bg-info/5"
                              : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-[200px] flex-1">
                      <UserAvatar
                        url={st.photo_url}
                        initials={st.full_name.slice(0, 2).toUpperCase()}
                        className="size-9"
                      />
                      <div>
                        <p className="text-sm font-bold text-foreground">{st.full_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          Nº {st.student_number || "—"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        disabled={disabledInputs}
                        variant={currentStatus === "present" ? "default" : "outline"}
                        onClick={() => setSingleStatus(st.student_id, "present")}
                        className={`h-9 px-3 text-xs gap-1 font-bold ${
                          currentStatus === "present"
                            ? "bg-success text-success-foreground hover:bg-success/90"
                            : ""
                        }`}
                      >
                        <Check className="size-4" /> Presente
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        disabled={disabledInputs}
                        variant={currentStatus === "absent" ? "default" : "outline"}
                        onClick={() => setSingleStatus(st.student_id, "absent")}
                        className={`h-9 px-3 text-xs gap-1 font-bold ${
                          currentStatus === "absent"
                            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            : ""
                        }`}
                      >
                        <X className="size-4" /> Falta
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        disabled={disabledInputs}
                        variant={currentStatus === "late" ? "default" : "outline"}
                        onClick={() => setSingleStatus(st.student_id, "late")}
                        className={`h-9 px-2.5 text-xs gap-1 font-semibold ${
                          currentStatus === "late"
                            ? "bg-warning text-warning-foreground hover:bg-warning/90"
                            : ""
                        }`}
                      >
                        <AlertCircle className="size-3.5" /> Atrasado
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        disabled={disabledInputs}
                        variant={currentStatus === "excused" ? "default" : "outline"}
                        onClick={() => setSingleStatus(st.student_id, "excused")}
                        className={`h-9 px-2.5 text-xs gap-1 font-semibold ${
                          currentStatus === "excused"
                            ? "bg-info text-info-foreground hover:bg-info/90"
                            : ""
                        }`}
                      >
                        Justificada
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="p-4 border-t border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3">
            {isCompleted && !isEditingMode ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditingMode(true)}
                className="gap-2 text-xs"
              >
                <Edit3 className="size-4" /> Editar chamada concluída
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                Confirme as presenças e faltas antes de concluir.
              </span>
            )}

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              {!isCompleted || isEditingMode ? (
                <Button
                  type="button"
                  onClick={handleSaveCall}
                  disabled={submitBatchMutation.isPending || editBatchMutation.isPending}
                  className="gap-2 font-bold px-6"
                >
                  <Save className="size-4" />
                  {isCompleted ? "Salvar alterações auditadas" : "Concluir chamada"}
                </Button>
              ) : null}
            </div>
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
