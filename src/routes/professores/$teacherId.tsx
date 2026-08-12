import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, GraduationCap, Pencil, UserPlus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { listTeachers, updateTeacher } from "@/features/people/server";
import { whatsappHref } from "@/features/integrations/actions";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { TeacherWorkspacePanel } from "@/features/academic/TeacherWorkspacePanel";
import {
  assignClassSubjectTeacher,
  listPedagogicalWorkspace,
} from "@/features/academic/server";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { canWriteModule } from "@/features/auth/access-policy";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { overlayCredenciais } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { getOrCreateCalendarFeedToken } from "@/features/calendar/feed";
import { toast } from "sonner";

export const Route = createFileRoute("/professores/$teacherId")({
  head: () => ({
    meta: [{ title: "Perfil do professor · SIGA" }],
  }),
  component: TeacherProfilePage,
});

function optionLabel(id: string, label: string) {
  return `${label} · ${id.slice(0, 8)}`;
}

function TeacherProfilePage() {
  const { teacherId } = Route.useParams();
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const { selectedYearId, school, selectedYearLabel } = useSchoolSettings();
  const canManage = canWriteModule(account.role, "pedagogica");
  const installed = useInstalledIntegrations();
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const resendOn = installed.hasCapability("resend.send");
  const teachersQuery = useQuery({
    queryKey: ["people", "teachers", "profile"],
    queryFn: () => listTeachers({ data: { status: "all", limit: 200 } }),
  });
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", selectedYearId],
    queryFn: () =>
      listPedagogicalWorkspace({
        data: selectedYearId ? { academicYearId: selectedYearId } : {},
      }),
    enabled: canManage,
  });
  const teacher = (teachersQuery.data ?? []).find((row) => row.id === teacherId);
  const classGroups = workspaceQuery.data?.classGroups ?? [];
  const subjects = workspaceQuery.data?.subjects ?? [];
  const turmaOptions = classGroups.map((group) => optionLabel(group.id, group.name));
  const subjectOptions = subjects.map((subject) => optionLabel(subject.id, subject.name));

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Corpo docente"
          title={teacher?.full_name ?? "Professor"}
          description="Perfil, turmas atribuídas, matrículas e sincronização do horário com o calendário móvel."
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
                          selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year,
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
                        fullName: values.nome,
                        email: values.email || "",
                        phone: values.telefone || undefined,
                        status: values.estado === "Inactivo" ? "inactive" : "active",
                      },
                    });
                    await queryClient.invalidateQueries({ queryKey: ["people", "teachers"] });
                  }}
                  trigger={(open) => (
                    <Button variant="outline" className="gap-2" onClick={open}>
                      <Pencil className="size-4" /> Editar
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
                      (group) => optionLabel(group.id, group.name) === values.turma,
                    )?.id;
                    const subjectId = subjects.find(
                      (subject) => optionLabel(subject.id, subject.name) === values.disciplina,
                    )?.id;
                    if (!classGroupId || !subjectId) {
                      throw new Error("Seleccione turma e disciplina.");
                    }
                    await assignClassSubjectTeacher({
                      data: { classGroupId, subjectId, teacherId },
                    });
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ["academic", "teacher-workspace"] }),
                      queryClient.invalidateQueries({
                        queryKey: ["academic", "pedagogical-workspace"],
                      }),
                    ]);
                  }}
                  trigger={(open) => (
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
                    const url = `${window.location.origin}/calendario/ics?token=${feed.token}`;
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
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Dados" description="Registo do docente">
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Nº funcionário</dt>
                <dd className="font-semibold">{teacher?.employee_number ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  {teacher?.email ?? "—"}
                  {resendOn && teacher?.email ? (
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-primary hover:underline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          `Credenciais SIGA — ${teacher.full_name}\n${teacher.email}`,
                        );
                        toast.success("Texto copiado para e-mail Resend");
                      }}
                    >
                      E-mail Resend
                    </button>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Telefone</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  {teacher?.phone ?? "—"}
                  {whatsappOn && teacher?.phone ? (
                    <a
                      href={whatsappHref(teacher.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      WhatsApp
                    </a>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Estado</dt>
                <dd className="capitalize">{teacher?.status ?? "—"}</dd>
              </div>
            </dl>
            <Button asChild variant="outline" className="mt-4 gap-2">
              <Link to="/pedagogica" search={{ tab: "horarios" }}>
                <GraduationCap className="size-4" /> Ver horários
              </Link>
            </Button>
          </Panel>
        </div>
        <InstalledModuleTools module="pedagogica" />
        <TeacherWorkspacePanel
          teacherId={teacherId}
          title="Turmas e horário"
          canManage={canManage}
          showInstalledTools={false}
        />
      </div>
    </AppShell>
  );
}
