import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, FileBadge, GraduationCap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/layout/PageHeader";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { getTeacherWorkspace, unassignClassSubjectTeacher } from "@/features/academic/server";
import { TeacherClassMaterialsBlock } from "@/features/arquivos/ClassMaterialsPanel";
import { getOrCreateCalendarFeedToken } from "@/features/calendar/feed";
import { calendarIcsFeedUrl } from "@/features/calendar/ics";
import { ZoomMeetingButton } from "@/features/integrations/ZoomMeetingButton";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { overlayDiario } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { toast } from "sonner";

export function TeacherWorkspacePanel({
  teacherId,
  title = "O meu espaço",
  canManage = false,
  showInstalledTools = true,
}: {
  teacherId?: string;
  title?: string;
  canManage?: boolean;
  showInstalledTools?: boolean;
}) {
  const queryClient = useQueryClient();
  const { school, selectedYearLabel } = useSchoolSettings();
  const installed = useInstalledIntegrations();
  const zoomOn = installed.hasCapability("zoom.rooms");
  const gcalOn = installed.hasCapability("gcal.subscribe");
  const appleOn = installed.hasCapability("apple.ics");

  const copyIcs = async (kind: "google" | "apple" | "plain") => {
    const feed = await getOrCreateCalendarFeedToken();
    const url = calendarIcsFeedUrl(window.location.origin, feed.token);
    await navigator.clipboard.writeText(url);
    toast.success(
      kind === "google"
        ? "ICS copiado. Abrimos o Google Calendar."
        : kind === "apple"
          ? "ICS copiado. No iPhone: Calendário → Adicionar conta."
          : "Link ICS copiado para o calendário do telemóvel ou email.",
    );
    if (kind === "google") {
      window.open(
        "https://calendar.google.com/calendar/u/0/r/settings/addbyurl",
        "_blank",
        "noopener,noreferrer",
      );
    }
  };
  const workspaceQuery = useQuery({
    queryKey: ["academic", "teacher-workspace", teacherId ?? "me"],
    queryFn: () => getTeacherWorkspace({ data: teacherId ? { teacherId } : {} }),
    retry: false,
  });
  const workspace = workspaceQuery.data;
  const classes = workspace?.classes ?? [];
  const enrollments = workspace?.enrollments ?? [];
  const schedule = workspace?.schedule ?? [];

  return (
    <div className="space-y-4">
      {showInstalledTools ? <InstalledModuleTools module="pedagogica" /> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title={title}
          description={
            workspace?.teacherName
              ? `${workspace.teacherName} · turmas e disciplinas atribuídas`
              : "Turmas e disciplinas atribuídas a este docente"
          }
          action={
            <div className="flex flex-wrap gap-1">
              {schedule.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    void issuePrintDocument({
                      tipo: "Diário pedagógico",
                      school: {
                        name: school?.name ?? "Escola",
                        nif: school?.nif,
                        phone: school?.phone,
                        email: school?.email,
                        address: school?.address,
                        directorName: school?.director_name,
                        academicYear:
                          selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") ||
                          school?.academic_year,
                      },
                      overlay: overlayDiario({
                        teacherName: workspace?.teacherName || "Professor",
                        subjectName: classes[0]?.subject_name,
                        className: classes.length === 1 ? classes[0]?.name : undefined,
                        lessons: schedule.map((slot) => ({
                          date: slot.weekday_label,
                          time: `${slot.starts_at}–${slot.ends_at}`,
                          topic: slot.subject_name,
                          objectives: `Aula de ${slot.subject_name} na turma ${slot.class_group_name}.`,
                          methodology: "Aula presencial conforme o horário oficial.",
                          assessment: "Observação contínua",
                          status: "Planeada",
                        })),
                      }),
                    }).catch((error) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível emitir o diário.",
                      ),
                    );
                  }}
                >
                  <FileBadge className="size-3.5" /> Diário
                </Button>
              ) : null}
              {workspace?.teacherId ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/professores/$teacherId" params={{ teacherId: workspace.teacherId }}>
                    Ficha
                  </Link>
                </Button>
              ) : null}
            </div>
          }
        >
          {workspaceQuery.isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-[85%]" />
            </div>
          ) : classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ainda sem turmas associadas a este professor. A secretaria liga disciplinas em Área
              Pedagógica.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {classes.map((item) => (
                <li
                  key={`${item.id}-${item.subject_id ?? item.subject_name}`}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <span>
                    <strong>{item.name}</strong>
                    <span className="text-muted-foreground"> · {item.subject_name}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    {canManage && item.subject_id ? (
                      <ConfirmActionModal
                        title="Desligar disciplina"
                        description={`O professor deixa de lançar ${item.subject_name} na turma ${item.name}.`}
                        confirmLabel="Desligar"
                        onConfirm={async () => {
                          await unassignClassSubjectTeacher({
                            data: { classGroupId: item.id, subjectId: item.subject_id! },
                          });
                          await queryClient.invalidateQueries({
                            queryKey: ["academic", "teacher-workspace"],
                          });
                          await queryClient.invalidateQueries({
                            queryKey: ["academic", "pedagogical-workspace"],
                          });
                        }}
                        trigger={(open) => (
                          <Button size="sm" variant="ghost" onClick={open}>
                            Desligar
                          </Button>
                        )}
                      />
                    ) : null}
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        to="/pedagogica"
                        search={{
                          tab: "notas",
                          turma: item.id,
                          disciplina: item.subject_id || undefined,
                          pauta: "1",
                        }}
                      >
                        Pauta
                      </Link>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Matrículas" description="Alunos activos nas turmas deste professor">
          {enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem matrículas activas nestas turmas.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {enrollments.slice(0, 12).map((item) => (
                <li key={item.id} className="rounded-lg border border-border px-3 py-2">
                  <p className="font-semibold">{item.student_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.class_group_name} · {item.subject_name}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Button asChild variant="outline" className="mt-4 gap-2" size="sm">
            <Link to="/pedagogica" search={{ tab: "notas" }}>
              <Users className="size-4" /> Lançar notas
            </Link>
          </Button>
        </Panel>

        <Panel
          title="Horário semanal"
          description="Slots atribuídos e sincronização móvel"
          action={
            <div className="flex flex-wrap gap-1">
              {gcalOn ? (
                <Button variant="outline" size="sm" onClick={() => void copyIcs("google")}>
                  Google
                </Button>
              ) : null}
              {appleOn ? (
                <Button variant="outline" size="sm" onClick={() => void copyIcs("apple")}>
                  Apple
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => void copyIcs("plain")}>
                ICS
              </Button>
            </div>
          }
        >
          {schedule.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem horário associado. Consulte a grelha em Área Pedagógica.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {schedule.slice(0, 8).map((slot) => (
                <li key={slot.id} className="rounded-lg border border-border px-3 py-2">
                  <p className="font-semibold">
                    {slot.weekday_label} · {slot.starts_at}–{slot.ends_at}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {slot.subject_name} · {slot.class_group_name}
                  </p>
                  {zoomOn ? (
                    <span className="mt-1 flex flex-wrap gap-3">
                      {zoomOn ? (
                        <ZoomMeetingButton
                          lessonTitle={`${slot.subject_name} · ${slot.class_group_name}`}
                          size="sm"
                          variant="ghost"
                          className="h-auto p-0 text-[11px] font-semibold text-primary hover:underline hover:bg-transparent"
                        />
                      ) : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <Button asChild variant="outline" className="mt-4 gap-2" size="sm">
            <Link to="/pedagogica" search={{ tab: "horarios" }}>
              <CalendarDays className="size-4" /> Ver grelha
            </Link>
          </Button>
        </Panel>
      </div>
      {classes.length > 0 ? (
        <Panel
          title="Materiais das turmas"
          description="PDF, Word, Excel e imagens ligados às turmas deste professor"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/arquivos">Arquivos</Link>
            </Button>
          }
        >
          <TeacherClassMaterialsBlock
            classes={classes.map((item) => ({ id: item.id, name: item.name }))}
          />
        </Panel>
      ) : null}
    </div>
  );
}

export function TeacherWorkspaceHint() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <GraduationCap className="size-4 text-primary" />
      Espaço do docente: só módulos permitidos, turmas atribuídas e horário.
    </p>
  );
}
