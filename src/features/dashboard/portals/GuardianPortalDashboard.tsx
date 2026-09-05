import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  CreditCard,
  FileText,
  HeartHandshake,
  Megaphone,
  PieChart,
  User,
  Activity,
  Award,
  AlertTriangle,
  ChevronRight,
  UserCheck,
  Check,
  X,
  Send,
} from "lucide-react";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { getStudentAttendanceHistory } from "@/features/pedagogica/attendance-server";
import { getDashboardOverview } from "@/features/dashboard/server";
import { IconChip } from "@/components/ui/icon-chip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SpotlightRail } from "@/features/spotlight/SpotlightRail";
import { DashboardCalendarCard } from "@/features/dashboard/components/DashboardCalendarCard";
import { openSettingsPanel } from "@/lib/settings-deep-link";
import { SubmitAttendanceJustificationModal } from "@/features/pedagogica/components/AttendanceJustificationModal";
import { VirtualCardModal } from "@/features/catracas/components/VirtualCardModal";
import { PayflowPayerLink } from "@/features/finance/components/PayflowPayerLink";
import { QrCode } from "lucide-react";

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

  const overviewQuery = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => getDashboardOverview(),
  });

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Bom dia" : now.getHours() < 19 ? "Boa tarde" : "Boa noite";
  const attStats = attendanceQuery.data?.stats ?? {
    total: 0,
    present: 0,
    absent: 0,
    excused: 0,
    late: 0,
    rate: 94,
  };

  const guardianMenu = [
    { label: "Boletim e Notas", icon: PieChart, to: "/pedagogica", search: { tab: "notas" } },
    {
      label: "Presenças e Faltas",
      icon: CheckSquare,
      to: "/pedagogica",
      search: { tab: "presencas" },
    },
    {
      label: "Horário Escolar",
      icon: CalendarDays,
      to: "/pedagogica",
      search: { tab: "horarios" },
    },
    { label: "Calendário Lectivo", icon: CalendarDays, to: "/calendario" },
    { label: "Documentos", icon: FileText, to: "/documentos" },
    { label: "Comunicados da Escola", icon: Megaphone, to: "/comunicacoes" },
    { label: "Contactar a Escola", icon: Send, to: "/comunicacoes" },
    { label: "O Meu Perfil", icon: User, to: "/perfil" },
  ];

  return (
    <div className="space-y-6">
      {/* CABEÇALHO DO ENCARREGADO COM SELETOR DE EDUCANDO */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <HeartHandshake className="size-4" /> Portal dos Pais / Encarregados ·{" "}
            {selectedYearLabel}
          </div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            {greeting}, {currentUser.name.split(" ")[0]}!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhamento escolar claro e transparente do seu educando.
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

        {/* SELETOR DE EDUCANDOS SE HOUVER MAIS DE UM */}
        {linkedStudents.length > 0 ? (
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-xs text-muted-foreground font-semibold">
              Educando selecionado:
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2.5 font-extrabold text-sm border-primary/40 h-10 px-4 bg-primary-soft text-primary-strong"
                >
                  <UserCheck className="size-4" />
                  {activeStudent?.full_name || "Selecionar Educando"}
                  <ChevronRight className="size-4 rotate-90" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {linkedStudents.map((st) => (
                  <DropdownMenuItem
                    key={st.student_id}
                    onClick={() => currentUser.setActiveStudentId(st.student_id)}
                    className="flex items-center justify-between p-2.5 font-semibold text-xs"
                  >
                    <span>{st.full_name}</span>
                    <span className="text-muted-foreground font-normal">
                      {st.class_name || "Turma"}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      {/* CARTÃO RESUMO HUMANO DO EDUCANDO SELECCIONADO */}
      <div className="surface-card p-6 border-l-4 border-l-primary space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-foreground">
              {activeStudent?.full_name || "Educando"}
            </h2>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              {activeStudent?.class_name || "10ª Classe · Turma A"} · Nº{" "}
              {activeStudent?.registration_number || "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PayflowPayerLink label="Pagar propinas" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVirtualCardModalOpen(true)}
              className="gap-1.5 font-bold text-xs h-8 border-primary/40 text-primary"
            >
              <QrCode className="size-3.5" /> Cartão Virtual (Catraca)
            </Button>
            <Badge
              variant="outline"
              className="bg-success/10 text-success border-success/30 px-3 py-1 text-xs font-bold"
            >
              {attStats.rate}% Presenças este mês
            </Badge>
            <Badge
              variant="outline"
              className="bg-primary/10 text-primary border-primary/30 px-3 py-1 text-xs font-bold"
            >
              Média:{" "}
              {activeStudent?.average_grade ? activeStudent.average_grade.toFixed(1) : "14.7"}
            </Badge>
          </div>
        </div>

        {/* ALERTAS ÚTEIS E NÃO ALARMISTAS PARA OS PAIS */}
        <div className="grid gap-3 sm:grid-cols-3 pt-2 border-t border-border">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/60">
            <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-foreground">Aviso de Presença</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {activeStudent?.full_name.split(" ")[0]} registou {attStats.absent} faltas este mês.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/60">
            <CalendarDays className="size-4 text-info shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-foreground">Próxima Avaliação</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Matemática · Prova marcada para 14 Setembro.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/60">
            <CreditCard className="size-4 text-success shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-foreground">Propinas</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Pagamentos e recibos abrem no PayFlow — a app de cobrança do SIGA Plus.
              </p>
              <PayflowPayerLink label="Abrir PayFlow" variant="ghost" className="h-7 px-0" />
            </div>
          </div>
        </div>
      </div>

      {/* ACÇÕES RÁPIDAS DO ENCARREGADO */}
      <div className="surface-card p-5">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          <BookOpen className="size-4 text-primary" /> Opções Rápidas do Encarregado
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {guardianMenu.map((item) => (
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

      {/* FREQUÊNCIA DO EDUCANDO E COMUNICADOS INSTITUCIONAIS */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold flex items-center gap-2">
              <CheckSquare className="size-4 text-primary" /> Frequência de{" "}
              {activeStudent?.full_name.split(" ")[0]}
            </h2>
            <Button asChild size="sm" variant="ghost" className="text-xs gap-1">
              <Link to="/pedagogica" search={{ tab: "presencas" }}>
                Ver histórico completo <ChevronRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          {(attendanceQuery.data?.records.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
              Não existem registos de falta recentes para este educando.
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
                          Enviar Justificativa
                        </Button>
                      </div>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-info/10 text-info border-info/30 text-[10px]"
                      >
                        Justificada
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RECADOS E AVISOS DA ESCOLA PARA PAIS */}
        <div className="surface-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Megaphone className="size-4 text-primary" /> Mensagens da Escola
            </h2>
            <Button asChild size="sm" variant="ghost" className="text-xs gap-1">
              <Link to="/comunicacoes">
                Ver todas <ChevronRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          {(overviewQuery.data?.announcements.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
              Não existem novos avisos dirigidos aos encarregados.
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE JUSTIFICAÇÃO DE FALTA PELO ENCARREGADO */}
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

      {/* MODAL DE CARTÃO VIRTUAL DO EDUCANDO */}
      {activeStudent ? (
        <VirtualCardModal
          open={virtualCardModalOpen}
          onOpenChange={setVirtualCardModalOpen}
          studentId={activeStudent.student_id}
          studentName={activeStudent.full_name}
          className={activeStudent.class_name || "10ª Classe"}
        />
      ) : null}
    </div>
  );
}
