import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Pencil, UserPlus, UserMinus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { MediaAvatar } from "@/components/ui/media-frame";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { listTeachers, updateTeacher, deleteTeacher } from "@/features/people/server";
import { TeacherProfile360 } from "@/features/people/TeacherProfile360";
import {
  assignClassSubjectTeacher,
  getTeacherWorkspace,
  listPedagogicalWorkspace,
  type PedagogicalWorkspace,
} from "@/features/academic/server";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { canAccessPath, canWriteModule } from "@/features/auth/access-policy";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { overlayCredenciais } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { getOrCreateCalendarFeedToken } from "@/features/calendar/feed";
import { calendarIcsFeedUrl } from "@/features/calendar/ics";
import { getTeacherHrEmployment } from "@/features/hr/server";
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";
import { mapTeacherWorkspaceToSnapshot } from "@/features/intelligence/teachers/teacher-relations-adapter";
import { toast } from "@/lib/toast";
import { idOptions } from "@/lib/option-label";

export const Route = createFileRoute("/professores/$teacherId")({
  head: () => ({
    meta: [{ title: "Perfil do professor · SIGA" }],
  }),
  component: TeacherProfilePage,
});

function TeacherProfilePage() {
  const { teacherId } = Route.useParams();
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const { selectedYearId, school, selectedYearLabel } = useSchoolSettings();
  const isAcademicManager = account.roles.includes("Administrador") || account.roles.includes("Secretaria");
  const canManage = isAcademicManager && canWriteModule(account.role, "pedagogica", account.grants);
  const teachersQuery = useQuery({
    queryKey: ["people", "teachers", "profile"],
    queryFn: () => listTeachers({ data: { status: "all", limit: 200 } }),
  });
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", selectedYearId],
    queryFn: () =>
      listPedagogicalWorkspace({
        data: selectedYearId ? { academicYearId: selectedYearId } : {},
      }) as Promise<PedagogicalWorkspace>,
    enabled: canManage,
  });
  const teacher = (teachersQuery.data ?? []).find((row) => row.id === teacherId);
  const teacherWorkspaceQuery = useQuery({
    queryKey: ["academic", "teacher-workspace", teacherId ?? "me"],
    queryFn: () => getTeacherWorkspace({ data: teacherId ? { teacherId } : {} }),
    retry: false,
  });
  const mismatchedTeacher = !isAcademicManager && teacherWorkspaceQuery.isSuccess &&
    teacherWorkspaceQuery.data?.teacherId !== teacherId;
  const teacherRelationsSnapshot = useMemo(
    () => (teacher ? mapTeacherWorkspaceToSnapshot(teacher, teacherWorkspaceQuery.data) : null),
    [teacher, teacherWorkspaceQuery.data],
  );
  // O vínculo laboral do professor, para o menu levar à ficha de RH: só para quem
  // lê o RH, e o servidor confirma.
  const canReadHr = canAccessPath("/financeiro/rh", account.role, account.grants);
  const hrEmploymentQuery = useQuery({
    queryKey: ["hr", "teacher-employment", teacherId],
    queryFn: () => getTeacherHrEmployment({ data: { teacherId } }),
    enabled: canReadHr && Boolean(teacherId),
    retry: false,
  });
  const employmentId = canReadHr ? hrEmploymentQuery.data?.employmentId : undefined;
  const focusedTeacherEntity = useMemo(() => {
    if (!teacher || !teacherRelationsSnapshot || mismatchedTeacher) return null;
    return {
      type: "teacher" as const,
      id: teacher.id,
      label: teacher.full_name,
      schoolId: school?.id ?? "",
      data: teacherRelationsSnapshot,
      ...(employmentId ? { relations: { employee: employmentId } } : {}),
    };
  }, [teacher, teacherRelationsSnapshot, school?.id, employmentId, mismatchedTeacher]);
  useDeclareEntityFocus(focusedTeacherEntity);
  const classGroups = workspaceQuery.data?.classGroups ?? [];
  const subjects = workspaceQuery.data?.subjects ?? [];
  const turmaOptions = idOptions(classGroups, (group) => group.name);
  const subjectOptions = idOptions(subjects, (subject) => subject.name);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Académico"
          title={teacher?.full_name ?? "Professor"}
          description="Perfil, turmas atribuídas, matrículas e sincronização do horário com o calendário móvel."
          avatar={
            teacher ? (
              <MediaAvatar
                src={teacher.photo_url}
                alt={teacher.full_name}
                className="size-16 rounded-2xl object-cover shadow-2xs"
                textClassName="text-lg"
              />
            ) : null
          }
          actions={
            <div className="flex flex-wrap gap-2">
              {teacher ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    const domain =
                      school?.email?.split("@")[1] || teacher.email?.split("@")[1] || "escola.ao";
                    void issuePrintDocument({
                      tipo: "Folha de credenciais",
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
                      student: {
                        fullName: teacher.full_name,
                        academicNumber: teacher.employee_number || teacher.email || teacher.id,
                      },
                      overlay: overlayCredenciais({
                        fullName: teacher.full_name,
                        process: teacher.employee_number || teacher.email || teacher.id,
                        email: teacher.email,
                        schoolEmailDomain: domain,
                      }),
                    }).catch((error) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível imprimir as credenciais.",
                      ),
                    );
                  }}
                >
                  <FileDown className="size-4" /> Credenciais
                </Button>
              ) : null}
              {canManage && teacher ? (
                <QuickFormModal
                  title="Editar professor"
                  eyebrow={teacher.employee_number}
                  description="Actualize o nome, contactos e estado da ficha HR."
                  icon={<Pencil className="size-5" />}
                  submitLabel="Guardar"
                  successDescription="Ficha do professor actualizada."
                  fields={[
                    {
                      name: "nome",
                      label: "Nome",
                      defaultValue: teacher.full_name,
                      full: true,
                    },
                    {
                      name: "email",
                      label: "Email",
                      defaultValue: teacher.email ?? "",
                      required: false,
                    },
                    {
                      name: "telefone",
                      label: "Telefone",
                      defaultValue: teacher.phone ?? "",
                      required: false,
                    },
                    {
                      name: "estado",
                      label: "Estado",
                      type: "select",
                      options: ["Activo", "Inactivo"],
                      defaultValue: teacher.status === "inactive" ? "Inactivo" : "Activo",
                    },
                  ]}
                  onSubmit={async (values) => {
                    await updateTeacher({
                      data: {
                        teacherId,
                        fullName: values["nome"] ?? teacher.full_name,
                        email: values["email"] || "",
                        phone: values["telefone"] || undefined,
                        status: values["estado"] === "Inactivo" ? "inactive" : "active",
                      },
                    });
                    await queryClient.invalidateQueries({ queryKey: ["people", "teachers"] });
                  }}
                  trigger={(open: () => void) => (
                    <Button variant="outline" className="gap-2" onClick={open}>
                      <Pencil className="size-4" /> Editar
                    </Button>
                  )}
                />
              ) : null}
              {canManage && teacher && teacher.status === "active" ? (
                <ConfirmActionModal
                  title="Desligar professor"
                  description={`O professor ${teacher.full_name} será marcado como inactivo e perderá acesso ao painel de professor.`}
                  confirmLabel="Desactivar"
                  onConfirm={async () => {
                    await deleteTeacher({ data: { teacherId: teacher.id } });
                    await queryClient.invalidateQueries({ queryKey: ["people", "teachers"] });
                    await queryClient.invalidateQueries({
                      queryKey: ["academic", "teacher-workspace"],
                    });
                  }}
                  trigger={(open: () => void) => (
                    <Button
                      variant="outline"
                      className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={open}
                    >
                      <UserMinus className="size-4" /> Desligar
                    </Button>
                  )}
                />
              ) : null}
              {canManage && turmaOptions.length > 0 && subjectOptions.length > 0 ? (
                <QuickFormModal
                  title="Atribuir disciplina"
                  eyebrow={teacher?.full_name}
                  description="Liga este professor a uma disciplina de uma turma."
                  icon={<UserPlus className="size-5" />}
                  submitLabel="Atribuir"
                  successDescription="Disciplina ligada ao professor."
                  fields={[
                    {
                      name: "turma",
                      label: "Turma",
                      type: "select",
                      options: turmaOptions,
                      full: true,
                    },
                    {
                      name: "disciplina",
                      label: "Disciplina",
                      type: "select",
                      options: subjectOptions,
                      full: true,
                    },
                  ]}
                  onSubmit={async (values) => {
                    const classGroupId = classGroups.find(
                      (group) => group.id === values["turma"],
                    )?.id;
                    const subjectId = subjects.find(
                      (subject) => subject.id === values["disciplina"],
                    )?.id;
                    if (!classGroupId || !subjectId) {
                      throw new Error("Seleccione turma e disciplina.");
                    }
                    await assignClassSubjectTeacher({
                      data: { classGroupId, subjectId, teacherId },
                    });
                    await Promise.all([
                      queryClient.invalidateQueries({
                        queryKey: ["academic", "teacher-workspace"],
                      }),
                      queryClient.invalidateQueries({
                        queryKey: ["academic", "pedagogical-workspace"],
                      }),
                    ]);
                  }}
                  trigger={(open: () => void) => (
                    <Button className="gap-2" onClick={open}>
                      <UserPlus className="size-4" /> Atribuir disciplina
                    </Button>
                  )}
                />
              ) : null}
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const feed = await getOrCreateCalendarFeedToken();
                    const url = calendarIcsFeedUrl(window.location.origin, feed.token);
                    await navigator.clipboard.writeText(url);
                    toast.success("Link ICS copiado. Cole no calendário do telemóvel ou do email.");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Não foi possível criar o feed.",
                    );
                  }
                }}
              >
                Sincronizar calendário
              </Button>
            </div>
          }
        />
        {teachersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar perfil do professor…</p>
        ) : teachersQuery.isError || !teacher ? (
          <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
            Não foi possível encontrar este professor na escola activa.
          </p>
        ) : mismatchedTeacher ? (
          <p className="rounded-xl border border-border p-5 text-sm text-destructive">
            Só pode consultar a sua própria ficha docente nesta escola.
          </p>
        ) : teacherWorkspaceQuery.isError ? (
          <p className="rounded-xl border border-border p-5 text-sm text-destructive">
            Não foi possível carregar as atribuições académicas deste professor.
          </p>
        ) : (
          <TeacherProfile360
            teacher={teacher}
            workspace={teacherWorkspaceQuery.data}
            schoolId={account.schoolId}
            schoolName={school?.name ?? account.schoolName ?? "Escola"}
            yearLabel={selectedYearLabel}
            configuredLevels={school?.pedagogy?.teachingLevels ?? []}
            selfTeacherId={account.linkedEntities.teacher_id}
            canManage={canManage}
            canReadHr={canReadHr}
            employmentId={employmentId}
          />
        )}
      </div>
    </AppShell>
  );
}
