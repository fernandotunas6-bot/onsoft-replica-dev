import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  Clock,
  NotebookPen,
  PieChart,
  UserCheck,
  AlertCircle,
  ChevronRight,
  CheckCheck,
  Building2,
  FileText,
} from "lucide-react";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { listTeacherAttendanceSessions } from "@/features/pedagogica/attendance-server";
import { listPedagogicalWorkspace } from "@/features/academic/server";
import { IconChip } from "@/components/ui/icon-chip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AttendanceCallDialog } from "@/features/pedagogica/components/AttendanceCallDialog";
import { SpotlightRail } from "@/features/spotlight/SpotlightRail";
import { openSettingsPanel } from "@/lib/settings-deep-link";

export function TeacherPortalDashboard() {
  const currentUser = useCurrentAccount();
  const { selectedYearLabel } = useSchoolSettings();
  const [selectedCallSessionId, setSelectedCallSessionId] = useState<string | null>(null);
  const [callDialogOpen, setCallDialogOpen] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);

  const sessionsQuery = useQuery({
    queryKey: ["teacher-attendance-sessions", todayStr],
    queryFn: () => listTeacherAttendanceSessions({ date: todayStr }),
  });

  const workspaceQuery = useQuery({
    queryKey: ["pedagogical-workspace"],
    queryFn: () => listPedagogicalWorkspace({}),
  });

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Bom dia" : now.getHours() < 19 ? "Boa tarde" : "Boa noite";
  const firstName = currentUser.name.split(" ")[0];

  const sessions = sessionsQuery.data?.sessions ?? [];
  const pendingCount = sessionsQuery.data?.pendingCount ?? 0;
  const teacherClasses = workspaceQuery.data?.classGroups ?? [];

  const teacherMenu = [
    { label: "Fazer Chamada", icon: CheckSquare, to: "/pedagogica", search: { tab: "chamada" } },
    {
      label: "Lançar Notas e Avaliações",
      icon: PieChart,
      to: "/pedagogica",
      search: { tab: "notas" },
    },
    {
      label: "Minhas Turmas e Disciplinas",
      icon: BookOpen,
      to: "/pedagogica",
      search: { tab: "turmas" },
    },
    {
      label: "Horário de Aulas",
      icon: CalendarDays,
      to: "/pedagogica",
      search: { tab: "horarios" },
    },
    { label: "Planos de Aula", icon: NotebookPen, to: "/planos-aula" },
    { label: "Materiais e Ficheiros", icon: FileText, to: "/arquivos" },
  ];

  return (
    <div className="space-y-6">
      {/* CABEÇALHO DO PROFESSOR */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <UserCheck className="size-4" /> Portal do Professor · {selectedYearLabel}
          </div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            {greeting}, Professor {firstName}!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestão pedagógica produtiva: chamadas, notas, pautas e planos de aula.
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

        {pendingCount > 0 ? (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="bg-warning/10 text-warning-foreground border-warning/30 px-3 py-1.5 text-xs font-extrabold animate-pulse"
            >
              <AlertCircle className="size-3.5 mr-1" /> {pendingCount} Chamada(s) Pendente(s) Hoje
            </Badge>
          </div>
        ) : null}
      </div>

      {/* QUADRO DE INDICADORES PRODUTIVOS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-5 space-y-2 border-l-4 border-l-primary">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Aulas de Hoje</span>
            <Clock className="size-4 text-primary" />
          </div>
          <p className="text-3xl font-extrabold text-foreground">{sessions.length}</p>
          <p className="text-xs text-muted-foreground">
            {sessions.filter((s) => s.status === "completed").length} chamadas concluídas
          </p>
        </div>

        <div className="surface-card p-5 space-y-2 border-l-4 border-l-warning">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Presenças Pendentes</span>
            <AlertCircle className="size-4 text-warning" />
          </div>
          <p className="text-3xl font-extrabold text-foreground">{pendingCount}</p>
          <p className="text-xs text-warning-foreground font-semibold">
            {pendingCount > 0 ? "Requer chamada em aula" : "Todas as chamadas em dia!"}
          </p>
        </div>

        <div className="surface-card p-5 space-y-2 border-l-4 border-l-info">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Turmas Atribuídas</span>
            <Building2 className="size-4 text-info" />
          </div>
          <p className="text-3xl font-extrabold text-foreground">{teacherClasses.length}</p>
          <p className="text-xs text-muted-foreground">Atribuição pedagógica ativa</p>
        </div>

        <div className="surface-card p-5 space-y-2 border-l-4 border-l-success">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Planos de Aula</span>
            <NotebookPen className="size-4 text-success" />
          </div>
          <p className="text-3xl font-extrabold text-foreground">3º Trimestre</p>
          <p className="text-xs text-success font-semibold">Planeamento pedagógico preparado</p>
        </div>
      </div>

      {/* WIDGET PRIORITÁRIO: AULAS DE HOJE E BOTÃO DE CHAMADA RÁPIDA */}
      <div className="surface-card p-5 space-y-4 border-2 border-primary/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold flex items-center gap-2">
              <CheckCheck className="size-5 text-primary" /> Aulas de Hoje e Chamada Rápida
            </h2>
            <p className="text-xs text-muted-foreground">
              Aceda diretamente à lista de alunos da aula e registe a frequência com velocidade.
            </p>
          </div>
          <span className="text-xs font-bold text-muted-foreground font-mono">
            {new Date().toLocaleDateString("pt-PT", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
        </div>

        {sessionsQuery.isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
            A carregar as aulas de hoje...
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            Não existem aulas agendadas para hoje nas tuas turmas atribuídas.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className="p-4 rounded-xl border border-border bg-card space-y-3 flex flex-col justify-between hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Badge variant="outline" className="text-[10px] font-mono mb-1">
                      {sess.starts_at || "08:00"} {sess.ends_at ? `- ${sess.ends_at}` : ""}
                    </Badge>
                    <h3 className="font-extrabold text-base text-foreground leading-tight">
                      {sess.class_group_name}
                    </h3>
                    <p className="text-xs text-primary font-semibold mt-0.5">{sess.subject_name}</p>
                  </div>
                  {sess.status === "completed" ? (
                    <Badge
                      variant="outline"
                      className="bg-success/10 text-success border-success/30 text-[10px]"
                    >
                      Finalizada
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-warning/10 text-warning-foreground border-warning/30 text-[10px] animate-pulse"
                    >
                      Pendente
                    </Badge>
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setSelectedCallSessionId(sess.id);
                    setCallDialogOpen(true);
                  }}
                  className={`w-full gap-2 font-bold text-xs h-9 ${
                    sess.status === "pending"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                      : "variant-outline"
                  }`}
                >
                  <CheckSquare className="size-4" />
                  {sess.status === "pending" ? "Fazer chamada agora" : "Ver / Editar chamada"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FERRAMENTAS PEDAGÓGICAS DO PROFESSOR */}
      <div className="surface-card p-5">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          <BookOpen className="size-4 text-primary" /> Ferramentas do Professor
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teacherMenu.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              {...(item.search ? { search: item.search } : {})}
              className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-card hover:bg-accent/60 transition-all group"
            >
              <div className="flex items-center gap-3">
                <IconChip icon={item.icon} size="sm" tone="primary" />
                <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                  {item.label}
                </span>
              </div>
              <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </Link>
          ))}
        </div>
      </div>

      {/* DIÁLOGO DA CHAMADA RÁPIDA */}
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
