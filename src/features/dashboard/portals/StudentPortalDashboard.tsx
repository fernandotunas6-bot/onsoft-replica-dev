import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Award,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CheckSquare,
  Clock,
  FileText,
  Megaphone,
  PieChart,
  QrCode,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { getStudentAttendanceHistory } from "@/features/pedagogica/attendance-server";
import { getDashboardOverview } from "@/features/dashboard/server";
import { getMyStudentAgenda } from "@/features/dashboard/student-agenda";
import { SpotlightRail } from "@/features/spotlight/SpotlightRail";
import { DashboardCalendarCard } from "@/features/dashboard/components/DashboardCalendarCard";
import { StudentTimetableCard } from "@/features/dashboard/components/StudentTimetableCard";
import { StudentGradesCard } from "@/features/dashboard/components/StudentGradesCard";
import { assessmentCalendarItems } from "@/features/dashboard/student-calendar-items";
import { openSettingsPanel } from "@/lib/settings-deep-link";
import { SubmitAttendanceJustificationModal } from "@/features/pedagogica/components/AttendanceJustificationModal";
import { VirtualCardModal } from "@/features/catracas/components/VirtualCardModal";
import { PayflowPayerLink } from "@/features/finance/components/PayflowPayerLink";
import {
  AttendanceStatus,
  PortalEmpty,
  PortalHeader,
  PortalList,
  PortalListItem,
  PortalLoading,
  PortalQuickLinks,
  PortalSection,
  PortalStat,
  PortalStats,
  type PortalQuickLink,
} from "./portal-ui";
import {
  formatPortalDate,
  formatPortalShortDate,
  greetingFor,
  relativeDayLabel,
} from "./portal-format";

export function StudentPortalDashboard() {
  const currentUser = useCurrentAccount();
  const { selectedYearLabel } = useSchoolSettings();
  const [justificationModalOpen, setJustificationModalOpen] = useState(false);
  const [virtualCardModalOpen, setVirtualCardModalOpen] = useState(false);
  const [selectedAbsence, setSelectedAbsence] = useState<{
    id: string;
    subject: string;
    date: string;
  } | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => getDashboardOverview(),
  });

  const attendanceQuery = useQuery({
    queryKey: ["student-attendance-history", currentUser.linkedEntities.student_id],
    queryFn: () =>
      getStudentAttendanceHistory({
        data: {
          studentId: currentUser.linkedEntities.student_id ?? undefined,
        },
      }),
  });

  const agendaQuery = useQuery({
    queryKey: ["dashboard", "student-agenda"],
    queryFn: () => getMyStudentAgenda(),
    staleTime: 5 * 60 * 1000,
  });
  const agenda = agendaQuery.data;

  const firstName = currentUser.name.split(" ")[0];

  const attStats = attendanceQuery.data?.stats ?? {
    total: 0,
    present: 0,
    absent: 0,
    excused: 0,
    late: 0,
    rate: 0,
  };
  const hasAttendance = attStats.total > 0;
  const attendanceLoading = attendanceQuery.isLoading;
  const averageLoading = agendaQuery.isLoading && currentUser.activeStudent?.average_grade == null;
  const studentClass = agenda?.className ?? currentUser.activeStudent?.class_name ?? null;
  const average = agenda?.average ?? currentUser.activeStudent?.average_grade ?? null;

  const studentLinks: PortalQuickLink[] = [
    { label: "Notas e boletim", icon: PieChart, to: "/pedagogica", search: { tab: "notas" } },
    {
      label: "Faltas e presenças",
      icon: CheckSquare,
      to: "/pedagogica",
      search: { tab: "presencas" },
    },
    { label: "A minha turma", icon: BookOpen, to: "/pedagogica", search: { tab: "turmas" } },
    { label: "Calendário lectivo", icon: CalendarDays, to: "/calendario" },
    { label: "Documentos", icon: FileText, to: "/documentos" },
    { label: "Comunicações", icon: Megaphone, to: "/comunicacoes" },
    { label: "O meu perfil", icon: User, to: "/perfil" },
  ];
  const records = attendanceQuery.data?.records ?? [];
  const announcements = overviewQuery.data?.announcements ?? [];

  return (
    <div className="space-y-5">
      <PortalHeader
        eyebrow={`Portal do Aluno · ${selectedYearLabel}`}
        title={`${greetingFor()}, ${firstName}`}
        subtitle={studentClass ?? undefined}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-medium"
              onClick={() => setVirtualCardModalOpen(true)}
            >
              <QrCode className="size-3.5" /> Cartão de acesso
            </Button>
            <PayflowPayerLink label="Pagar propinas" />
          </>
        }
      >
        <SpotlightRail
          surface="home"
          className="mt-3 max-w-xl"
          role={currentUser.role}
          grants={currentUser.grants}
          onNavigate={() => undefined}
          onOpenSettings={openSettingsPanel}
        />
      </PortalHeader>

      <PortalStats>
        <PortalStat
          label="Presença"
          icon={Activity}
          loading={attendanceLoading}
          value={hasAttendance ? `${attStats.rate}%` : "—"}
          hint={
            hasAttendance
              ? `${attStats.present} presenças · ${attStats.absent} ${attStats.absent === 1 ? "falta" : "faltas"}`
              : "Ainda sem registos."
          }
        />
        <PortalStat
          label="Média"
          icon={Award}
          loading={averageLoading}
          value={average != null ? average.toFixed(1) : "—"}
          hint={
            average == null
              ? "Ainda sem média lançada."
              : average >= 10
                ? "Situação positiva"
                : "Abaixo de 10 valores"
          }
          attention={average != null && average < 10}
        />
        <PortalStat
          label="Próxima aula"
          icon={Clock}
          loading={agendaQuery.isLoading}
          value={agenda?.nextLesson?.subjectName ?? "—"}
          hint={
            agenda?.nextLesson
              ? `${relativeDayLabel(agenda.nextLesson.daysAhead, agenda.nextLesson.weekday)} · ${agenda.nextLesson.startsAt.slice(0, 5)}–${agenda.nextLesson.endsAt.slice(0, 5)}`
              : "Horário ainda não publicado."
          }
        />
        <PortalStat
          label="Próxima avaliação"
          icon={CalendarCheck}
          loading={agendaQuery.isLoading}
          value={
            agenda?.nextAssessment
              ? `${agenda.nextAssessment.subjectName} · ${agenda.nextAssessment.name}`
              : "—"
          }
          hint={
            agenda?.nextAssessment
              ? formatPortalDate(agenda.nextAssessment.date)
              : "Sem avaliações marcadas."
          }
        />
      </PortalStats>

      <StudentTimetableCard />

      <StudentGradesCard />

      <div className="grid gap-5 lg:grid-cols-2">
        <PortalSection
          title="Faltas e presenças"
          icon={CheckSquare}
          action={{ label: "Ver tudo", to: "/pedagogica", search: { tab: "presencas" } }}
        >
          {attendanceLoading ? (
            <PortalLoading label="A carregar presenças…" />
          ) : records.length === 0 ? (
            <PortalEmpty>Ainda sem registos de presença nesta turma.</PortalEmpty>
          ) : (
            <PortalList>
              {records.slice(0, 5).map((rec) => (
                <PortalListItem
                  key={rec.id}
                  title={rec.subject_name}
                  meta={`${formatPortalShortDate(rec.date)}${rec.time ? ` · ${String(rec.time).slice(0, 5)}` : ""}`}
                  aside={
                    <>
                      <AttendanceStatus status={rec.status} />
                      {rec.status === "absent" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setSelectedAbsence({
                              id: rec.id,
                              subject: rec.subject_name,
                              date: rec.date,
                            });
                            setJustificationModalOpen(true);
                          }}
                        >
                          Justificar
                        </Button>
                      ) : null}
                    </>
                  }
                />
              ))}
            </PortalList>
          )}
        </PortalSection>

        <PortalSection
          title="Avisos da escola"
          icon={Megaphone}
          action={{ label: "Ver tudo", to: "/comunicacoes" }}
        >
          {overviewQuery.isLoading ? (
            <PortalLoading label="A carregar avisos…" />
          ) : announcements.length === 0 ? (
            <PortalEmpty>Sem avisos recentes para a tua turma.</PortalEmpty>
          ) : (
            <PortalList>
              {announcements.slice(0, 3).map((item) => (
                <PortalListItem
                  key={item.id}
                  title={item.title}
                  meta={
                    item.published_at
                      ? new Date(item.published_at).toLocaleDateString("pt-PT")
                      : undefined
                  }
                />
              ))}
            </PortalList>
          )}
        </PortalSection>

        <DashboardCalendarCard
          title="Calendário da escola"
          limit={6}
          extraItems={assessmentCalendarItems(agenda?.upcomingAssessments)}
        />

        <PortalSection title="Acesso rápido">
          <PortalQuickLinks items={studentLinks} />
        </PortalSection>
      </div>

      {selectedAbsence ? (
        <SubmitAttendanceJustificationModal
          open={justificationModalOpen}
          onOpenChange={setJustificationModalOpen}
          studentId={currentUser.linkedEntities.student_id ?? ""}
          attendanceRecordId={selectedAbsence.id}
          subjectName={selectedAbsence.subject}
          date={selectedAbsence.date}
        />
      ) : null}

      <VirtualCardModal
        open={virtualCardModalOpen}
        onOpenChange={setVirtualCardModalOpen}
        studentId={currentUser.linkedEntities.student_id ?? undefined}
        studentName={currentUser.name}
        className={studentClass ?? undefined}
      />
    </div>
  );
}
