import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Building2,
  CalendarDays,
  CheckCheck,
  CheckSquare,
  Clock,
  FileText,
  FolderOpen,
  NotebookPen,
  PieChart,
  QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { todayInLuanda } from "@/features/calendar/dates";
import { listTeacherAttendanceSessions } from "@/features/pedagogica/attendance-server";
import { listPedagogicalWorkspace } from "@/features/academic/server";
import { nowTimeInLuanda, pickNextLesson } from "@/features/dashboard/school-today";
import { AttendanceCallDialog } from "@/features/pedagogica/components/AttendanceCallDialog";
import { SpotlightRail } from "@/features/spotlight/SpotlightRail";
import { DashboardCalendarCard } from "@/features/dashboard/components/DashboardCalendarCard";
import { StudentTimetableCard } from "@/features/dashboard/components/StudentTimetableCard";
import { TeacherAssessmentsCard } from "@/features/dashboard/components/TeacherAssessmentsCard";
import { TeacherSchoolsCard } from "@/features/dashboard/components/TeacherSchoolsCard";
import { openSettingsPanel } from "@/lib/settings-deep-link";
import {
  teacherClassFilesSearch,
  teacherGradesSearch,
  teacherLessonPlansSearch,
} from "@/features/hr/teacher-classroom-links";
import {
  PortalEmpty,
  PortalHeader,
  PortalList,
  PortalLoading,
  PortalQuickLinks,
  PortalSection,
  PortalStat,
  PortalStats,
  type PortalQuickLink,
} from "./portal-ui";
import { greetingFor } from "./portal-format";

export function TeacherPortalDashboard() {
  const currentUser = useCurrentAccount();
  const { selectedYearLabel } = useSchoolSettings();
  const [selectedCallSessionId, setSelectedCallSessionId] = useState<string | null>(null);
  const [callDialogOpen, setCallDialogOpen] = useState(false);

  const todayStr = todayInLuanda();

  const sessionsQuery = useQuery({
    queryKey: ["teacher-attendance-sessions", todayStr],
    queryFn: () => listTeacherAttendanceSessions({ data: { date: todayStr } }),
  });

  const workspaceQuery = useQuery({
    queryKey: ["pedagogical-workspace"],
    queryFn: () => listPedagogicalWorkspace({}),
  });

  const firstName = currentUser.name.split(" ")[0];

  const sessions = sessionsQuery.data?.sessions ?? [];
  const pendingCount = sessionsQuery.data?.pendingCount ?? 0;
  const teacherClasses = workspaceQuery.data?.classGroups ?? [];
  const nextLesson = pickNextLesson(sessions, nowTimeInLuanda());

  const openCall = (sessionId: string) => {
    setSelectedCallSessionId(sessionId);
    setCallDialogOpen(true);
  };

  const teacherLinks: PortalQuickLink[] = [
    { label: "Fazer chamada", icon: CheckSquare, to: "/pedagogica", search: { tab: "chamada" } },
    { label: "Lançar notas", icon: PieChart, to: "/pedagogica", search: { tab: "notas" } },
    { label: "Turmas e disciplinas", icon: BookOpen, to: "/pedagogica", search: { tab: "turmas" } },
    {
      label: "Horário de aulas",
      icon: CalendarDays,
      to: "/pedagogica",
      search: { tab: "horarios" },
    },
    { label: "Planos de aula", icon: NotebookPen, to: "/planos-aula" },
    { label: "Materiais e ficheiros", icon: FileText, to: "/arquivos" },
  ];
  const completedCount = sessions.filter((s) => s.status === "completed").length;
  const time = (value: string | null | undefined) => (value ? String(value).slice(0, 5) : "");

  return (
    <div className="space-y-5">
      <PortalHeader
        eyebrow={`Portal do Professor · ${selectedYearLabel}`}
        title={`${greetingFor()}, Professor ${firstName}`}
        subtitle="Assine o QR de presença antes da chamada: é o que conta para a hora/aula."
        actions={
          <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs font-medium">
            <Link to="/professor/presenca">
              <QrCode className="size-3.5" /> Assinar presença (QR)
            </Link>
          </Button>
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

      {nextLesson ? (
        <section className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Próxima aula</p>
            <p className="text-lg font-medium leading-tight">{nextLesson.subject_name}</p>
            <p className="text-sm text-muted-foreground">
              {time(nextLesson.starts_at)}–{time(nextLesson.ends_at)} ·{" "}
              {nextLesson.class_group_name}
              {nextLesson.room ? ` · Sala ${nextLesson.room}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5 text-xs" onClick={() => openCall(nextLesson.id)}>
              <CheckSquare className="size-3.5" /> Fazer chamada
            </Button>
            <Button asChild size="sm" variant="ghost" className="gap-1.5 text-xs">
              <Link
                to="/planos-aula"
                search={teacherLessonPlansSearch(nextLesson.class_group_id, nextLesson.subject_id)}
              >
                <NotebookPen className="size-3.5" /> Plano de aula
              </Link>
            </Button>
          </div>
        </section>
      ) : null}

      <PortalStats columns={3}>
        <PortalStat
          label="Aulas de hoje"
          icon={Clock}
          loading={sessionsQuery.isLoading}
          value={sessions.length}
          hint={`${completedCount} ${completedCount === 1 ? "chamada feita" : "chamadas feitas"}`}
        />
        <PortalStat
          label="Chamadas por fazer"
          icon={CheckCheck}
          loading={sessionsQuery.isLoading}
          value={pendingCount}
          hint={pendingCount > 0 ? "Faça a chamada durante a aula." : "Tudo em dia."}
          attention={pendingCount > 0}
        />
        <PortalStat
          label="Turmas atribuídas"
          icon={Building2}
          loading={workspaceQuery.isLoading}
          value={teacherClasses.length}
          hint="Neste ano lectivo"
        />
      </PortalStats>

      <StudentTimetableCard variant="teacher" />

      <TeacherSchoolsCard />

      <PortalSection
        title="Aulas de hoje"
        icon={CheckSquare}
        action={{ label: "Ver chamadas", to: "/pedagogica", search: { tab: "chamada" } }}
      >
        {sessionsQuery.isLoading ? (
          <PortalLoading label="A carregar as aulas de hoje…" />
        ) : sessions.length === 0 ? (
          <PortalEmpty>Sem aulas marcadas para hoje nas suas turmas.</PortalEmpty>
        ) : (
          <PortalList>
            {sessions.map((sess) => {
              const pending = sess.status !== "completed";
              return (
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
                      <p className="truncate text-sm">
                        {sess.class_group_name}
                        <span className="text-muted-foreground"> · {sess.subject_name}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pending ? "Chamada por fazer" : "Chamada feita"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => openCall(sess.id)}
                    >
                      <CheckSquare className="size-3.5" />
                      {pending ? "Fazer chamada" : "Ver chamada"}
                    </Button>
                    <Button
                      asChild
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      title="Lançar notas desta aula"
                      aria-label="Lançar notas desta aula"
                    >
                      <Link
                        to="/pedagogica"
                        search={teacherGradesSearch(sess.class_group_id, sess.subject_id)}
                        aria-label="Lançar notas desta aula"
                      >
                        <PieChart className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      title="Plano de aula"
                      aria-label="Plano de aula"
                    >
                      <Link
                        to="/planos-aula"
                        search={teacherLessonPlansSearch(sess.class_group_id, sess.subject_id)}
                        aria-label="Plano de aula"
                      >
                        <NotebookPen className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      title="Materiais"
                      aria-label="Materiais"
                    >
                      <Link
                        to="/arquivos"
                        search={teacherClassFilesSearch(sess.class_group_id)}
                        aria-label="Materiais"
                      >
                        <FolderOpen className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </PortalList>
        )}
      </PortalSection>

      <TeacherAssessmentsCard />

      <div className="grid gap-5 lg:grid-cols-2">
        <DashboardCalendarCard />
        <PortalSection title="Acesso rápido">
          <PortalQuickLinks items={teacherLinks} />
        </PortalSection>
      </div>

      {selectedCallSessionId ? (
        <AttendanceCallDialog
          open={callDialogOpen}
          onOpenChange={setCallDialogOpen}
          sessionId={selectedCallSessionId}
        />
      ) : null}
    </div>
  );
}
