import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  CreditCard,
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
import { IconChip } from "@/components/ui/icon-chip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SpotlightRail } from "@/features/spotlight/SpotlightRail";
import { DashboardCalendarCard } from "@/features/dashboard/components/DashboardCalendarCard";
import { openSettingsPanel } from "@/lib/settings-deep-link";
import { SubmitAttendanceJustificationModal } from "@/features/pedagogica/components/AttendanceJustificationModal";
import { VirtualCardModal } from "@/features/catracas/components/VirtualCardModal";

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
    rate: 100,
  };
  const studentClass = currentUser.activeStudent?.class_name || "10ª Classe · Turma A";

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
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            {greeting}, {firstName}!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {studentClass} · Acompanhamento do teu percurso escolar
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
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setVirtualCardModalOpen(true)}
            className="gap-2 font-bold text-xs h-9 bg-primary text-primary-foreground shadow-sm"
          >
            <QrCode className="size-4" /> Cartão Virtual (Catraca)
          </Button>

          <Badge
            variant="outline"
            className="bg-primary/10 text-primary border-primary/30 px-3 py-1.5 text-xs font-semibold"
          >
            {attStats.rate}% Taxa de Presença
          </Badge>
        </div>
      </div>

      {/* QUADRO DE INDICADORES DO ALUNO */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-5 space-y-2 border-l-4 border-l-primary">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Frequência Geral</span>
            <Activity className="size-4 text-primary" />
          </div>
          <p className="text-3xl font-extrabold text-foreground">{attStats.rate}%</p>
          <p className="text-xs text-muted-foreground">
            {attStats.present} presenças · {attStats.absent} faltas · {attStats.excused}{" "}
            justificadas
          </p>
        </div>

        <div className="surface-card p-5 space-y-2 border-l-4 border-l-success">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Média Atual</span>
            <Award className="size-4 text-success" />
          </div>
          <p className="text-3xl font-extrabold text-foreground">
            {currentUser.activeStudent?.average_grade
              ? `${currentUser.activeStudent.average_grade.toFixed(1)}`
              : "14.7"}
          </p>
          <p className="text-xs text-success font-semibold">Situação Académica Positiva</p>
        </div>

        <div className="surface-card p-5 space-y-2 border-l-4 border-l-info">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Próxima Aula</span>
            <Clock className="size-4 text-info" />
          </div>
          <p className="text-xl font-extrabold text-foreground truncate">Matemática</p>
          <p className="text-xs text-muted-foreground">Hoje · 08:00 - 08:45</p>
        </div>

        <div className="surface-card p-5 space-y-2 border-l-4 border-l-warning">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Próxima Avaliação</span>
            <AlertCircle className="size-4 text-warning" />
          </div>
          <p className="text-xl font-extrabold text-foreground truncate">Física · Prova</p>
          <p className="text-xs text-warning-foreground font-semibold">
            Sexta-feira · 2º Trimestre
          </p>
        </div>
      </div>

      {/* MENU RÁPIDO DO ALUNO */}
      <div className="surface-card p-5">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
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
                <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                  {item.label}
                </span>
              </div>
              <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </Link>
          ))}
        </div>
      </div>

      <DashboardCalendarCard />

      {/* GRELHA COM HISTÓRICO DE FREQUÊNCIA E COMUNICADOS DA ESCOLA */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* HISTÓRICO DE REGISTOS DE FREQUÊNCIA DO ALUNO */}
        <div className="surface-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold flex items-center gap-2">
              <CheckSquare className="size-4 text-primary" /> As Minhas Faltas e Presenças
            </h2>
            <Button asChild size="sm" variant="ghost" className="text-xs gap-1">
              <Link to="/pedagogica" search={{ tab: "presencas" }}>
                Ver tudo <ChevronRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          {(attendanceQuery.data?.records.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
              Ainda não tens registos de faltas nesta turma. Excelente trabalho!
            </div>
          ) : (
            <div className="space-y-2">
              {attendanceQuery.data?.records.slice(0, 5).map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-background"
                >
                  <div>
                    <p className="text-xs font-bold text-foreground">{rec.subject_name}</p>
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
            <h2 className="text-base font-bold flex items-center gap-2">
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
                  <p className="text-xs font-bold text-foreground">{item.title}</p>
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
        className={studentClass}
      />
    </div>
  );
}
