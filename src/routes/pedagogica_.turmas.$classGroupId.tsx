import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  listPedagogicalWorkspace,
  listRooms,
  type PedagogicalWorkspace,
} from "@/features/academic/server";
import {
  TURMA_SECTIONS,
  TurmaProfileModal,
} from "@/features/academic/components/TurmaProfileModal";
import { canWriteModule } from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { listTeachers } from "@/features/people/server";
import { moduleIcons } from "@/lib/app-icons";

/**
 * Ficha da turma com URL própria (SIGA Context Engine): o mesmo conteúdo do modal
 * de turma, com a secção em `?secao=`. A turma só aparece se o servidor a devolver
 * à conta (`listPedagogicalWorkspace`), e o menu da turma fica na sidebar.
 */
const turmaSearchSchema = z.object({
  secao: z.enum(TURMA_SECTIONS).optional().catch(undefined),
});

export const Route = createFileRoute("/pedagogica_/turmas/$classGroupId")({
  validateSearch: (search) => turmaSearchSchema.parse(search),
  head: () => ({ meta: [{ title: "Turma · SIGA" }] }),
  component: TurmaPage,
});

/** A ficha da turma é da equipa, como a lista de turmas em Pedagógica. */
const STAFF_ROLES = new Set(["Administrador", "Secretaria", "Professor"]);

function TurmaPage() {
  const { classGroupId } = Route.useParams();
  const { secao } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const { selectedYearId } = useSchoolSettings();
  const staff = STAFF_ROLES.has(account.role);
  const canManageAcademic = canWriteModule(account.role, "pedagogica", account.grants);

  // As mesmas chaves de `/pedagogica`: vindo da lista de turmas, nada se pede de novo.
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", selectedYearId],
    queryFn: () =>
      listPedagogicalWorkspace({
        data: selectedYearId ? { academicYearId: selectedYearId } : {},
      }) as Promise<PedagogicalWorkspace>,
    enabled: staff,
    retry: false,
  });
  const teachersQuery = useQuery({
    queryKey: ["people", "teachers", "assign"],
    queryFn: () => listTeachers({ data: { status: "active", limit: 200 } }),
    enabled: canManageAcademic,
  });
  const roomsQuery = useQuery({
    queryKey: ["academic", "rooms"],
    queryFn: () => listRooms(),
    enabled: staff,
  });

  const workspace = workspaceQuery.data;
  const turma = workspace?.classGroups.find((group) => group.id === classGroupId);
  const teachers = useMemo(() => teachersQuery.data ?? [], [teachersQuery.data]);
  const salas = useMemo(
    () =>
      (roomsQuery.data ?? [])
        .filter((room) => room.status === "active")
        .map((room) => ({ id: room.id, name: room.name, capacity: room.capacity ?? null })),
    [roomsQuery.data],
  );

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["academic", "pedagogical-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["academic", "teacher-workspace"] }),
    ]).then(() => undefined);
  const backToList = () => void navigate({ to: "/pedagogica", search: { tab: "turmas" } });

  const description = "Alunos, professores e disciplinas, horário e avaliações da turma.";

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Académico"
          title={turma?.name ?? "Turma"}
          icon={moduleIcons.classes}
          description={description}
        />
        {!staff ? (
          <EmptyState
            icon={moduleIcons.classes}
            title="Sem acesso a esta turma"
            description="A ficha da turma é da equipa da escola."
            compact
          />
        ) : workspaceQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar a turma…</p>
        ) : !turma ? (
          <EmptyState
            icon={moduleIcons.classes}
            title="Turma não encontrada"
            description="Esta turma não existe no ano lectivo seleccionado ou não está atribuída à sua conta."
            compact
            action={
              <Button asChild variant="outline">
                <Link to="/pedagogica" search={{ tab: "turmas" }}>
                  Ver turmas
                </Link>
              </Button>
            }
          />
        ) : (
          <TurmaProfileModal
            variant="page"
            open
            onOpenChange={(next) => {
              // Desactivar a turma fecha a ficha: volta à lista.
              if (!next) backToList();
            }}
            classGroupId={turma.id}
            workspace={workspace}
            teacherOptions={teachers.map((teacher) => teacher.full_name)}
            teacherIds={teachers.map((teacher) => teacher.id)}
            salas={salas}
            onRefresh={refresh}
            section={secao ?? "resumo"}
            onSectionChange={(next) =>
              void navigate({
                to: "/pedagogica/turmas/$classGroupId",
                params: { classGroupId },
                search: next === "resumo" ? {} : { secao: next },
                replace: true,
              })
            }
          />
        )}
      </div>
    </AppShell>
  );
}
