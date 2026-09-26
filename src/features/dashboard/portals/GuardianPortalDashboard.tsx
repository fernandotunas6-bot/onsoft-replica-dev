import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Award,
  CalendarCheck,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  Clock,
  FileText,
  Megaphone,
  PieChart,
  QrCode,
  Send,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { getStudentAttendanceHistory } from "@/features/pedagogica/attendance-server";
import { getDashboardOverview } from "@/features/dashboard/server";
import { getMyStudentAgenda } from "@/features/dashboard/student-agenda";
import { SpotlightRail } from "@/features/spotlight/SpotlightRail";
import { DashboardCalendarCard } from "@/features/dashboard/components/DashboardCalendarCard";
import { StudentTimetableCard } from "@/features/dashboard/components/StudentTimetableCard";
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

export function GuardianPortalDashboard() {
  const currentUser = useCurrentAccount();
  const { selectedYearLabel } = useSchoolSettings();
  const [justificationModalOpen, setJustificationModalOpen] = useState(false);
  const [virtualCardModalOpen, setVirtualCardModalOpen] = useState(false);
  const [selectedAbsence, setSelectedAbsence] = useState<{
    id: string;
    subject: string;
    date: string;
  } | null>(null);

  const linkedStudents = currentUser.linkedEntities.linked_students;
  const activeStudent = currentUser.activeStudent || linkedStudents[0] || null;
  const activeStudentId = activeStudent?.student_id;

  const attendanceQuery = useQuery({
    queryKey: ["student-attendance-history", activeStudentId],
    enabled: Boolean(activeStudentId),
    queryFn: () => getStudentAttendanceHistory({ data: { studentId: activeStudentId } }),
  });

  const agendaQuery = useQuery({
    queryKey: ["dashboard", "student-agenda", activeStudentId],
    enabled: Boolean(activeStudentId),
    queryFn: () => getMyStudentAgenda({ data: { studentId: activeStudentId } }),
    staleTime: 5 * 60 * 1000,
  });
  const agenda = agendaQuery.data;
  const nextAssessment = agenda?.nextAssessment ?? null;
  const average = agendaQuery.data?.average ?? activeStudent?.average_grade ?? null;
  const attendanceLoading = attendanceQuery.isLoading;
  const averageLoading = agendaQuery.isLoading && activeStudent?.average_grade == null;
  const className = agendaQuery.data?.className ?? activeStudent?.class_name ?? null;

  const overviewQuery = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => getDashboardOverview(),
  });

  const attStats = attendanceQuery.data?.stats ?? {
    total: 0,
    present: 0,
    absent: 0,
    excused: 0,
    late: 0,
    rate: 0,
  };

  const guardianLinks: PortalQuickLink[] = [
    { label: "Boletim e notas", icon: PieChart, to: "/pedagogica", search: { tab: "notas" } },
    {
      label: "Faltas e presenças",
      icon: CheckSquare,
      to: "/pedagogica",
      search: { tab: "presencas" },
    },
    { label: "Calendário lectivo", icon: CalendarDays, to: "/calendario" },
    { label: "Documentos", icon: FileText, to: "/documentos" },
    { label: "Comunicados da escola", icon: Megaphone, to: "/comunicacoes" },
    { label: "Contactar a escola", icon: Send, to: "/comunicacoes" },
    { label: "O meu perfil", icon: User, to: "/perfil" },
  ];
  const childFirstName = activeStudent?.full_name.split(" ")[0] ?? "o educando";
  const hasAttendance = attStats.total > 0;
  const records = attendanceQuery.data?.records ?? [];
  const announcements = overviewQuery.data?.announcements ?? [];

  return (
    <div className="space-y-5">
      <PortalHeader
        eyebrow={`Portal do Encarregado · ${selectedYearLabel}`}
        title={`${greetingFor()}, ${currentUser.name.split(" ")[0]}`}
        subtitle="Acompanhamento escolar do seu educando."
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

      {activeStudent ? (
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            {linkedStudents.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-base font-medium hover:text-primary"
                  >
                    {activeStudent.full_name}
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {linkedStudents.map((st) => (
                    <DropdownMenuItem
                      key={st.student_id}
                      onClick={() => currentUser.setActiveStudentId(st.student_id)}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>{st.full_name}</span>
                      <span className="text-xs text-muted-foreground">{st.class_name ?? ""}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <p className="text-base font-medium">{activeStudent.full_name}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {className ? `${className} · ` : ""}Nº {activeStudent.registration_number || "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        </div>
      ) : (
        <div className="surface-card p-4">
          <PortalEmpty>
            Ainda não há educandos ligados a esta conta. Peça à secretaria da escola para fazer a
            ligação.
          </PortalEmpty>
        </div>
      )}

      {activeStudent ? (
        <>
          <PortalStats>
            <PortalStat
              label="Presença"
              icon={Activity}
              loading={attendanceLoading}
              value={hasAttendance ? `${attStats.rate}%` : "—"}
              hint={
                hasAttendance
                  ? `${childFirstName} tem ${attStats.absent} ${attStats.absent === 1 ? "falta" : "faltas"}`
                  : "Ainda sem registos."
              }
              attention={attStats.absent > 0 && attStats.rate < 90}
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
                nextAssessment ? `${nextAssessment.subjectName} · ${nextAssessment.name}` : "—"
              }
              hint={
                nextAssessment ? formatPortalDate(nextAssessment.date) : "Sem avaliações marcadas."
              }
            />
          </PortalStats>

          <StudentTimetableCard studentId={activeStudentId ?? null} />
        </>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {activeStudent ? (
          <PortalSection
            title={`Faltas e presenças de ${childFirstName}`}
            icon={CheckSquare}
            action={{ label: "Ver tudo", to: "/pedagogica", search: { tab: "presencas" } }}
          >
            {attendanceLoading ? (
              <PortalLoading label="A carregar presenças…" />
            ) : records.length === 0 ? (
              <PortalEmpty>Sem registos de presença recentes.</PortalEmpty>
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
        ) : null}

        <PortalSection
          title="Mensagens da escola"
          icon={Megaphone}
          action={{ label: "Ver todas", to: "/comunicacoes" }}
        >
          {overviewQuery.isLoading ? (
            <PortalLoading label="A carregar mensagens…" />
          ) : announcements.length === 0 ? (
            <PortalEmpty>Sem mensagens novas para os encarregados.</PortalEmpty>
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
          <PortalQuickLinks items={guardianLinks} />
        </PortalSection>
      </div>

      {selectedAbsence && activeStudentId ? (
        <SubmitAttendanceJustificationModal
          open={justificationModalOpen}
          onOpenChange={setJustificationModalOpen}
          studentId={activeStudentId}
          attendanceRecordId={selectedAbsence.id}
          subjectName={selectedAbsence.subject}
          date={selectedAbsence.date}
        />
      ) : null}

      {activeStudent ? (
        <VirtualCardModal
          open={virtualCardModalOpen}
          onOpenChange={setVirtualCardModalOpen}
          studentId={activeStudent.student_id}
          studentName={activeStudent.full_name}
          className={className ?? undefined}
        />
      ) : null}
    </div>
  );
}
