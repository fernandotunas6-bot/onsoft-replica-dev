import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckSquare,
  Calendar,
  Clock,
  Search,
  CheckCheck,
  AlertCircle,
  Check,
  X,
  FileText,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResponsiveEntityView } from "@/components/mobile/ResponsiveEntityView";
import { EntityList, type EntityListItem } from "@/components/mobile/EntityList";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  listTeacherAttendanceSessions,
  getStudentAttendanceHistory,
} from "@/features/pedagogica/attendance-server";
import { AttendanceCallDialog } from "@/features/pedagogica/components/AttendanceCallDialog";
import { ReviewAttendanceJustificationModal } from "@/features/pedagogica/components/AttendanceJustificationModal";
import { todayInLuanda } from "@/features/calendar/dates";
import { SchemaMissingBanner, isSchemaMissingError } from "@/components/ui/schema-missing-banner";
import { EmptyState } from "@/components/ui/empty-state";

export function AttendanceWorkspaceModule({
  initialClassGroupId,
  initialSubjectId,
  initialDate,
}: {
  initialClassGroupId?: string | undefined;
  initialSubjectId?: string | undefined;
  initialDate?: string | undefined;
} = {}) {
  const [selectedDate, setSelectedDate] = useState(initialDate ?? todayInLuanda());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [draftCall, setDraftCall] = useState<{
    classGroupId: string;
    subjectId: string;
  } | null>(null);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [reviewJustificationModalOpen, setReviewJustificationModalOpen] = useState(false);
  const [selectedJustification, setSelectedJustification] = useState<{
    id: string;
    reason: string;
    fileName?: string | null;
  } | null>(null);
  const [search, setSearch] = useState("");
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (initialDate) setSelectedDate(initialDate);
  }, [initialDate]);

  const sessionsQuery = useQuery({
    queryKey: ["teacher-attendance-sessions", selectedDate],
    queryFn: () => listTeacherAttendanceSessions({ data: { date: selectedDate } }),
  });

  const historyQuery = useQuery({
    queryKey: ["student-attendance-history", "all"],
    queryFn: () => getStudentAttendanceHistory({ data: {} }),
  });

  const sessions = useMemo(
    () => sessionsQuery.data?.sessions ?? [],
    [sessionsQuery.data?.sessions],
  );
  const pendingCount = sessionsQuery.data?.pendingCount ?? 0;
  const historyRecords = historyQuery.data?.records ?? [];

  const filteredHistory = historyRecords.filter((rec) =>
    search
      ? rec.subject_name.toLowerCase().includes(search.toLowerCase()) ||
        rec.date.includes(search) ||
        rec.status.toLowerCase().includes(search.toLowerCase())
      : true,
  );

  // Deep-link da agenda / portal: abre a chamada da turma+disciplina.
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!initialClassGroupId || !initialSubjectId) return;
    if (sessionsQuery.isLoading) return;

    const match = sessions.find(
      (sess) => sess.class_group_id === initialClassGroupId && sess.subject_id === initialSubjectId,
    );
    if (match) {
      setSelectedSessionId(match.id);
      setDraftCall(null);
      setCallDialogOpen(true);
      autoOpenedRef.current = true;
      return;
    }

    setSelectedSessionId(null);
    setDraftCall({ classGroupId: initialClassGroupId, subjectId: initialSubjectId });
    setCallDialogOpen(true);
    autoOpenedRef.current = true;
  }, [initialClassGroupId, initialSubjectId, sessions, sessionsQuery.isLoading]);

  return (
    <div className="space-y-6">
      {isSchemaMissingError(sessionsQuery.error) || isSchemaMissingError(historyQuery.error) ? (
        <SchemaMissingBanner
          title="Presenças: tabelas SGA em falta"
          description="siga_attendance_sessions (e relacionadas). Aplique APPLY_MISSING_FROM_VERIFY.sql."
        />
      ) : null}

      {/* BARRA DE CONTROLO DE SESSÕES E SELETOR DE DATA */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl border border-border bg-card shadow-soft">
        <div>
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <CheckSquare className="size-5 text-primary" /> Diário de Frequência e Presenças por
            Aula
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gestão de chamadas, diários digitais de classe e auditoria de justificações.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-muted-foreground" />
            <Input
              aria-label="Data da aula"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 text-xs font-mono w-36"
            />
          </div>
          {pendingCount > 0 ? (
            <Badge
              variant="outline"
              className="bg-warning/10 text-warning-foreground border-warning/30 px-3 py-1 text-xs font-bold animate-pulse"
            >
              <AlertCircle className="size-3.5 mr-1" /> {pendingCount} Chamada(s) Pendente(s)
            </Badge>
          ) : null}
        </div>
      </div>

      {/* GRELHA DE TURMAS / AULAS DO DIA PARA REALIZAR CHAMADA */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Clock className="size-4 text-primary" /> Aulas Agendadas para {selectedDate}
        </h3>

        {sessionsQuery.isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
            A carregar sessões de aula...
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Não existem aulas registadas nesta data"
            description="Escolha outro dia ou confirme o horário das turmas em Pedagógica → Horários."
            compact
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className="p-4 rounded-xl border border-border bg-card space-y-3 flex flex-col justify-between hover:border-primary/40 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Badge variant="outline" className="text-[11px] font-mono">
                      {sess.starts_at
                        ? `${sess.starts_at}${sess.ends_at ? ` – ${sess.ends_at}` : ""}`
                        : "Sem hora"}
                    </Badge>
                    {sess.status === "completed" ? (
                      <Badge
                        variant="outline"
                        className="bg-success/10 text-success border-success/30 text-[11px]"
                      >
                        Finalizada
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-warning/10 text-warning-foreground border-warning/30 text-[11px] animate-pulse"
                      >
                        Pendente
                      </Badge>
                    )}
                  </div>
                  <h4 className="font-extrabold text-base text-foreground">
                    {sess.class_group_name}
                  </h4>
                  <p className="text-xs text-primary font-semibold">{sess.subject_name}</p>
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setSelectedSessionId(sess.id);
                    setCallDialogOpen(true);
                  }}
                  className={`w-full gap-2 font-bold text-xs h-9 ${
                    sess.status === "pending"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "variant-outline"
                  }`}
                >
                  <CheckCheck className="size-4" />
                  {sess.status === "pending" ? "Fazer chamada agora" : "Ver / Editar chamada"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* REGISTO HISTÓRICO DE FREQUÊNCIA E REVISÃO DE JUSTIFICAÇÕES */}
      <div className="surface-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h3 className="text-base font-bold flex items-center gap-2">
              <UserCheck className="size-4 text-primary" /> Histórico Geral de Presenças e Faltas
            </h3>
            <p className="text-xs text-muted-foreground">
              Consulte registos individuais e analise justificações submetidas por alunos ou
              encarregados.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              aria-label="Pesquisar aula"
              placeholder="Pesquisar por disciplina ou data..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        {historyQuery.isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
            A carregar histórico de presenças...
          </div>
        ) : filteredHistory.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="Ainda sem registos de presença"
            description="Após fazer a primeira chamada, o histórico de faltas e justificações aparece aqui."
            compact
          />
        ) : (
          <ResponsiveEntityView
            mobile={
              <EntityList
                items={filteredHistory.map<EntityListItem>((rec) => ({
                  id: rec.id,
                  title: rec.subject_name,
                  subtitle: `${rec.date}${rec.time ? ` · ${rec.time}` : ""}`,
                  status: (
                    <StatusBadge
                      status={
                        rec.status === "present"
                          ? "active"
                          : rec.status === "absent"
                            ? "rejected"
                            : rec.status === "excused"
                              ? "approved"
                              : "pending"
                      }
                      label={
                        rec.status === "present"
                          ? "Presente"
                          : rec.status === "absent"
                            ? "Falta"
                            : rec.status === "excused"
                              ? "Justificada"
                              : "Atrasado"
                      }
                      size="sm"
                    />
                  ),
                  // Só há acção quando há justificação para analisar — uma linha
                  // sem nota não abre nada e não finge que abre.
                  ...(rec.notes
                    ? {
                        onSelect: () => {
                          setSelectedJustification({ id: rec.id, reason: rec.notes ?? "" });
                          setReviewJustificationModalOpen(true);
                        },
                      }
                    : {}),
                }))}
              />
            }
            desktop={
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data</TableHead>
                    <TableHead className="text-xs">Disciplina / Aula</TableHead>
                    <TableHead className="text-xs">Horário</TableHead>
                    <TableHead className="text-xs">Estado de Presença</TableHead>
                    <TableHead className="text-xs text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.map((rec) => (
                    <TableRow key={rec.id}>
                      <TableCell className="text-xs font-mono font-medium">{rec.date}</TableCell>
                      <TableCell className="text-xs font-bold text-foreground">
                        {rec.subject_name}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {rec.time || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {rec.status === "present" ? (
                          <Badge
                            variant="outline"
                            className="bg-success/10 text-success border-success/30 text-[11px]"
                          >
                            <Check className="size-3 mr-1" /> Presente
                          </Badge>
                        ) : rec.status === "absent" ? (
                          <Badge
                            variant="outline"
                            className="bg-destructive/10 text-destructive border-destructive/30 text-[11px]"
                          >
                            <X className="size-3 mr-1" /> Falta
                          </Badge>
                        ) : rec.status === "excused" ? (
                          <Badge
                            variant="outline"
                            className="bg-info/10 text-info border-info/30 text-[11px]"
                          >
                            Justificada
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-warning/10 text-warning-foreground border-warning/30 text-[11px]"
                          >
                            Atrasado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {rec.notes ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedJustification({
                                id: rec.id,
                                reason: rec.notes ?? "",
                              });
                              setReviewJustificationModalOpen(true);
                            }}
                            className="h-7 text-[11px] gap-1 text-primary"
                          >
                            <FileText className="size-3.5" /> Analisar
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
          />
        )}
      </div>

      {/* DIÁLOGOS DE CHAMADA E REVISÃO */}
      {selectedSessionId || draftCall ? (
        <AttendanceCallDialog
          open={callDialogOpen}
          onOpenChange={(open) => {
            setCallDialogOpen(open);
            if (!open) {
              setSelectedSessionId(null);
              setDraftCall(null);
            }
          }}
          {...(selectedSessionId
            ? { sessionId: selectedSessionId }
            : {
                classGroupId: draftCall!.classGroupId,
                subjectId: draftCall!.subjectId,
                date: selectedDate,
              })}
        />
      ) : null}

      {selectedJustification ? (
        <ReviewAttendanceJustificationModal
          open={reviewJustificationModalOpen}
          onOpenChange={setReviewJustificationModalOpen}
          justificationId={selectedJustification.id}
          reason={selectedJustification.reason}
          fileName={selectedJustification.fileName}
        />
      ) : null}
    </div>
  );
}
