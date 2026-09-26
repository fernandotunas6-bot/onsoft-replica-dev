import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  FileText,
  GraduationCap,
  Megaphone,
  PieChart,
  User,
  Activity,
  Award,
  AlertCircle,
  ChevronRight,
  Clock,
  QrCode,
} from "lucide-react";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { getStudentAttendanceHistory } from "@/features/pedagogica/attendance-server";
import { getDashboardOverview } from "@/features/dashboard/server";
import { getMyStudentAgenda } from "@/features/dashboard/student-agenda";
import { InlineLoading } from "@/components/ui/inline-loading";
import { IconChip } from "@/components/ui/icon-chip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SpotlightRail } from "@/features/spotlight/SpotlightRail";
import { DashboardCalendarCard } from "@/features/dashboard/components/DashboardCalendarCard";
import { StudentTimetableCard } from "@/features/dashboard/components/StudentTimetableCard";
import { assessmentCalendarItems } from "@/features/dashboard/student-calendar-items";
import { openSettingsPanel } from "@/lib/settings-deep-link";
import { SubmitAttendanceJustificationModal } from "@/features/pedagogica/components/AttendanceJustificationModal";
import { VirtualCardModal } from "@/features/catracas/components/VirtualCardModal";
import { PayflowPayerLink } from "@/features/finance/components/PayflowPayerLink";

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

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Bom dia" : now.getHours() < 19 ? "Boa tarde" : "Boa noite";
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

  const studentMenu = [
    { label: "Minha Turma", icon: BookOpen, to: "/pedagogica", search: { tab: "turmas" } },
    {
      label: "Horário de Aulas",
      icon: CalendarDays,
      to: "/pedagogica",
      search: { tab: "horarios" },
    },
    { label: "Notas e Boletim", icon: PieChart, to: "/pedagogica", search: { tab: "notas" } },
    {
      label: "Frequência e Faltas",
      icon: CheckSquare,
      to: "/pedagogica",
      search: { tab: "presencas" },
    },
    { label: "Calendário Lectivo", icon: CalendarDays, to: "/calendario" },
    { label: "Documentos", icon: FileText, to: "/documentos" },
    { label: "Comunicações", icon: Megaphone, to: "/comunicacoes" },
    { label: "Meu Perfil", icon: User, to: "/perfil" },
  ];

  return (
    <div className="space-y-6">
      {/* CABEÇALHO DO ALUNO */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <GraduationCap className="size-4" /> Portal do Aluno · {selectedYearLabel}
          </div>
          <h1 className="mt-1 text-xl md:text-2xl font-medium tracking-tight">
            {greeting}, {firstName}!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {studentClass ? `${studentClass} · ` : ""}Acompanhamento do teu percurso escolar
          </p>

          <SpotlightRail
            surface="home"
            className="mt-4 max-w-xl"
            role={currentUser.role}
            grants={currentUser.grants}
            onNavigate={() => undefined}
            onOpenSettings={openSettingsPanel}
          />
        </div>

        <div className="flex items-center gap-3">
          <PayflowPayerLink label="Pagar propinas" />
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setVirtualCardModalOpen(true)}
            className="gap-2 font-medium text-xs h-9 bg-primary text-primary-foreground shadow-sm"
          >
            <QrCode className="size-4" /> Cartão Virtual (Catraca)
          </Button>

          <Badge
            variant="outline"
            className="bg-primary/10 text-primary border-primary/30 px-3 py-1.5 text-xs font-semibold"
          >
            {attendanceLoading
              ? "A carregar presenças…"
              : hasAttendance
                ? `${attStats.rate}% de presença`
                : "Sem registos de presença"}
          </Badge>
        </div>
      </div>

      {/* QUADRO DE INDICADORES DO ALUNO */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-5 space-y-2 border-l-4 border-l-primary">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Frequência Geral</span>
            <Activity className="size-4 text-primary" />
          </div>
          {attendanceLoading ? (
            <InlineLoading label="A carregar presenças…" />
          ) : (
            <>
              <p className="text-2xl font-semibold text-foreground tabular-nums">
                {hasAttendance ? `${attStats.rate}%` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasAttendance
                  ? `${attStats.present} presenças · ${attStats.absent} faltas · ${attStats.excused} justificadas`
                  : "Ainda sem registos."}
              </p>
            </>
          )}
        </div>

        <div className="surface-card p-5 space-y-2 border-l-4 border-l-success">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Média Atual</span>
            <Award className="size-4 text-success" />
          </div>
          {averageLoading ? (
            <InlineLoading label="A carregar média…" />
          ) : (
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              {average != null ? average.toFixed(1) : "—"}
            </p>
          )}
          <p
            hidden={averageLoading}
            className={
              average == null
                ? "text-xs text-muted-foreground"
                : average >= 10
                  ? "text-xs text-success"
                  : "text-xs text-destructive"
            }
          >
            {average == null
              ? "Ainda sem média lançada."
              : average >= 10
                ? "Situação positiva"
                : "Abaixo de 10 valores"}
          </p>
        </div>

        <div className="surface-card p-5 space-y-2 border-l-4 border-l-info">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Próxima Aula</span>
            <Clock className="size-4 text-info" />
          </div>
          {agendaQuery.isLoading ? (
            <InlineLoading label="A carregar horário…" />
          ) : agenda?.nextLesson ? (
            <>
              <p className="text-base font-medium text-foreground truncate">
                {agenda.nextLesson.subjectName}
              </p>
              <p className="text-xs text-muted-foreground">
                {relativeDayLabel(agenda.nextLesson.daysAhead, agenda.nextLesson.weekday)} ·{" "}
                {agenda.nextLesson.startsAt.slice(0, 5)}–{agenda.nextLesson.endsAt.slice(0, 5)}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Horário ainda não publicado.</p>
          )}
        </div>

        <div className="surface-card p-5 space-y-2 border-l-4 border-l-warning">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Próxima Avaliação</span>
            <AlertCircle className="size-4 text-warning" />
          </div>
          {agendaQuery.isLoading ? (
            <InlineLoading label="A carregar avaliações…" />
          ) : agenda?.nextAssessment ? (
            <>
              <p className="text-base font-medium text-foreground truncate">
                {agenda.nextAssessment.subjectName} · {agenda.nextAssessment.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatAssessmentDate(agenda.nextAssessment.date)}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Sem avaliações marcadas.</p>
          )}
        </div>
      </div>

      {/* MENU RÁPIDO DO ALUNO */}
      <div className="surface-card p-5">
        <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
          <BookOpen className="size-4 text-primary" /> O Teu Espaço de Aprendizagem
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {studentMenu.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              {...(item.search ? { search: item.search } : {})}
              className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-card hover:bg-accent/60 transition-all group"
            >
              <div className="flex items-center gap-3">
                <IconChip icon={item.icon} size="sm" tone="primary" label={item.label} />
                <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                  {item.label}
                </span>
              </div>
              <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </Link>
          ))}
        </div>
      </div>

      <StudentTimetableCard />

      <DashboardCalendarCard
        title="Calendário da escola"
        limit={8}
        extraItems={assessmentCalendarItems(agenda?.upcomingAssessments)}
      />

      {/* GRELHA COM HISTÓRICO DE FREQUÊNCIA E COMUNICADOS DA ESCOLA */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* HISTÓRICO DE REGISTOS DE FREQUÊNCIA DO ALUNO */}
        <div className="surface-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <CheckSquare className="size-4 text-primary" /> As Minhas Faltas e Presenças
            </h2>
            <Button asChild size="sm" variant="ghost" className="text-xs gap-1">
              <Link to="/pedagogica" search={{ tab: "presencas" }}>
                Ver tudo <ChevronRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          {attendanceLoading ? (
            <div className="py-8 flex justify-center">
              <InlineLoading label="A carregar presenças…" />
            </div>
          ) : (attendanceQuery.data?.records.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
              Ainda sem registos de presença nesta turma.
            </div>
          ) : (
            <div className="space-y-2">
              {attendanceQuery.data?.records.slice(0, 5).map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-background"
                >
                  <div>
                    <p className="text-xs font-medium text-foreground">{rec.subject_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {rec.date} {rec.time ? `· ${rec.time}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {rec.status === "present" ? (
                      <Badge
                        variant="outline"
                        className="bg-success/10 text-success border-success/30 text-[10px]"
                      >
                        Presente
                      </Badge>
                    ) : rec.status === "absent" ? (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]"
                        >
                          Falta
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedAbsence({
                              id: rec.id,
                              subject: rec.subject_name,
                              date: rec.date,
                            });
                            setJustificationModalOpen(true);
                          }}
                          className="h-7 text-[10px] px-2 text-primary hover:underline"
                        >
                          Justificar
                        </Button>
                      </div>
                    ) : rec.status === "excused" ? (
                      <Badge
                        variant="outline"
                        className="bg-info/10 text-info border-info/30 text-[10px]"
                      >
                        Justificada
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-warning/10 text-warning-foreground border-warning/30 text-[10px]"
                      >
                        Atrasado
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* COMUNICADOS ESCOLARES */}
        <div className="surface-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <Megaphone className="size-4 text-primary" /> Avisos da Escola
            </h2>
            <Button asChild size="sm" variant="ghost" className="text-xs gap-1">
              <Link to="/comunicacoes">
                Ver tudo <ChevronRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          {(overviewQuery.data?.announcements.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
              Não existem avisos ou comunicados recentes para a tua turma.
            </div>
          ) : (
            <div className="space-y-3">
              {overviewQuery.data?.announcements.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-secondary/50 border border-border space-y-1"
                >
                  <p className="text-xs font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.body}</p>
                  {item.published_at ? (
                    <p className="text-[10px] text-muted-foreground pt-1">
                      {new Date(item.published_at).toLocaleDateString("pt-PT")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE JUSTIFICAÇÃO DE FALTA */}
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

      {/* MODAL DE CARTÃO VIRTUAL DO ESTUDANTE */}
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

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function relativeDayLabel(daysAhead: number, weekday: number) {
  if (daysAhead === 0) return "Hoje";
  if (daysAhead === 1) return "Amanhã";
  return WEEKDAY_LABELS[weekday] ?? "";
}

function formatAssessmentDate(isoDate: string) {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
