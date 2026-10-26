import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckSquare } from "lucide-react";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { todayInLuanda } from "@/features/calendar/dates";
import { listTeacherAttendanceSessions } from "@/features/pedagogica/attendance-server";
import { AttendanceCallDialog } from "@/features/pedagogica/components/AttendanceCallDialog";
import {
  TeacherCheckinButton,
  TeacherPresenceLine,
} from "@/features/pedagogica/components/TeacherLessonPresence";
import { TeacherSchoolQrScanner } from "@/features/pedagogica/components/TeacherSchoolQrScanner";
import {
  readRememberedPresenceMode,
  rememberPresenceMode,
} from "@/features/pedagogica/presence-scan-queue";
import { roomLabel } from "@/lib/room-label";

const time = (value: string | null | undefined) => (value ? String(value).slice(0, 5) : "");

/**
 * Aulas de hoje do professor: confirmar «Estou na sala» e abrir a chamada.
 * Não depende do RH: funciona para todos os professores com aulas no horário. O QR
 * de hora/aula (abaixo, na mesma página) continua para quem tem contrato.
 */
export function TeacherTodayLessonsPanel() {
  const today = todayInLuanda();
  const [callSessionId, setCallSessionId] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const sessionsQuery = useQuery({
    queryKey: ["teacher-attendance-sessions", today],
    queryFn: () => listTeacherAttendanceSessions({ data: { date: today } }),
    // Sem botão «Actualizar»: a lista refresca sozinha.
    refetchInterval: 60_000,
  });
  const sessions = sessionsQuery.data?.sessions ?? [];
  const presenceMode = sessionsQuery.data?.presenceMode ?? "button";
  const presenceEnabled = sessionsQuery.data?.presenceEnabled === true && presenceMode !== "off";
  const presenceMissing = sessionsQuery.data?.presenceEnabled === false;
  const loadedMode = sessionsQuery.data?.presenceMode;
  const [rememberedMode, setRememberedMode] = useState<string | null>(null);
  useEffect(() => {
    if (loadedMode) rememberPresenceMode(loadedMode);
    else setRememberedMode(readRememberedPresenceMode());
  }, [loadedMode]);
  // Sem rede a lista não carrega, mas o leitor continua a guardar leituras.
  const showScanner = loadedMode ? loadedMode === "qr" : rememberedMode === "qr";

  return (
    <Panel
      title="Aulas de hoje"
      description={
        presenceMode === "qr"
          ? "No início de cada aula, leia o QR da escola e faça a chamada."
          : presenceMode === "off"
            ? "Faça a chamada dos alunos em cada aula."
            : "No início de cada aula, toque «Estou na sala» e faça a chamada."
      }
    >
      {showScanner ? (
        <div className="mb-4">
          <TeacherSchoolQrScanner />
        </div>
      ) : null}
      {presenceMissing ? (
        <p className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-muted-foreground">
          A confirmação de presença na sala ainda não está activa nesta escola. A chamada dos alunos
          funciona normalmente.
        </p>
      ) : null}
      {sessionsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar as aulas de hoje…</p>
      ) : sessionsQuery.isError ? (
        <p className="text-sm text-destructive">
          {sessionsQuery.error instanceof Error
            ? sessionsQuery.error.message
            : "Não foi possível carregar as aulas de hoje."}
        </p>
      ) : sessions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Sem aulas suas hoje. Se devia ter, fale com a Direcção Pedagógica.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {sessions.map((sess) => (
            <li
              key={sess.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
            >
              <div className="flex min-w-0 items-baseline gap-3">
                <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {sess.starts_at
                    ? `${time(sess.starts_at)}${sess.ends_at ? `–${time(sess.ends_at)}` : ""}`
                    : "Sem hora"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {sess.class_group_name}
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {sess.subject_name}
                      {sess.room ? ` · ${roomLabel(sess.room)}` : ""}
                    </span>
                  </p>
                  {presenceEnabled ? (
                    <TeacherPresenceLine session={sess} self />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {sess.status === "completed" ? "Chamada feita" : "Chamada por fazer"}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Com o QR, o leitor já está no topo deste painel. */}
                {presenceEnabled && !(presenceMode === "qr" && showScanner) ? (
                  <TeacherCheckinButton session={sess} mode={presenceMode} className="h-9" />
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5 text-xs touch-manipulation"
                  onClick={() => {
                    setCallSessionId(sess.id);
                    setCallOpen(true);
                  }}
                >
                  <CheckSquare className="size-3.5" />
                  {sess.status === "completed" ? "Ver chamada" : "Fazer chamada"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {callSessionId ? (
        <AttendanceCallDialog
          open={callOpen}
          onOpenChange={setCallOpen}
          sessionId={callSessionId}
        />
      ) : null}
    </Panel>
  );
}
