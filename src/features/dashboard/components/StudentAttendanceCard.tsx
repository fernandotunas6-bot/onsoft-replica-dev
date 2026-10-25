import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStudentAttendanceHistory } from "@/features/pedagogica/attendance-server";
import { SubmitAttendanceJustificationModal } from "@/features/pedagogica/components/AttendanceJustificationModal";
import {
  AttendanceStatus,
  PortalEmpty,
  PortalList,
  PortalListItem,
  PortalLoading,
  PortalSection,
} from "@/features/dashboard/portals/portal-ui";
import { formatPortalShortDate } from "@/features/dashboard/portals/portal-format";

/**
 * Presenças do aluno (ou do educando): o histórico completo que o painel inicial
 * resume nas últimas cinco, com a taxa de assiduidade e a justificação das faltas.
 * O servidor só devolve os registos do próprio aluno ou dos educandos da conta;
 * `studentId` é o aluno (o do próprio, para o Aluno) a que a justificação se refere.
 */
export function StudentAttendanceCard({ studentId }: { studentId?: string | null }) {
  const query = useQuery({
    queryKey: ["student-attendance-history", studentId ?? "self"],
    queryFn: () => getStudentAttendanceHistory({ data: studentId ? { studentId } : {} }),
  });
  const [absence, setAbsence] = useState<{
    id: string;
    subject: string;
    date: string;
  } | null>(null);
  const records = query.data?.records ?? [];
  const stats = query.data?.stats;

  return (
    <PortalSection title="Faltas e presenças" icon={CheckSquare}>
      {query.isLoading ? (
        <PortalLoading label="A carregar presenças…" />
      ) : query.isError ? (
        <PortalEmpty>
          Não foi possível carregar as presenças. Tente novamente mais tarde.
        </PortalEmpty>
      ) : records.length === 0 ? (
        <PortalEmpty>Ainda sem registos de presença nesta turma.</PortalEmpty>
      ) : (
        <>
          {stats ? (
            <p className="mb-3 text-sm text-muted-foreground">
              Assiduidade {stats.rate}% · {stats.absent} falta(s) · {stats.excused} justificada(s) ·{" "}
              {stats.late} atraso(s)
            </p>
          ) : null}
          <PortalList>
            {records.map((rec) => (
              <PortalListItem
                key={rec.id}
                title={rec.subject_name}
                meta={`${formatPortalShortDate(rec.date)}${rec.time ? ` · ${String(rec.time).slice(0, 5)}` : ""}`}
                aside={
                  <>
                    <AttendanceStatus status={rec.status} />
                    {rec.status === "absent" && studentId ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          setAbsence({
                            id: rec.id,
                            subject: rec.subject_name,
                            date: rec.date,
                          })
                        }
                      >
                        Justificar
                      </Button>
                    ) : null}
                  </>
                }
              />
            ))}
          </PortalList>
        </>
      )}
      {absence && studentId ? (
        <SubmitAttendanceJustificationModal
          open
          onOpenChange={(open) => {
            if (!open) setAbsence(null);
          }}
          studentId={studentId}
          attendanceRecordId={absence.id}
          subjectName={absence.subject}
          date={absence.date}
        />
      ) : null}
    </PortalSection>
  );
}
