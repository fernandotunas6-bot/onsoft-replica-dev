import { useState } from "react";
import { FolderOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { ClassMaterialsPanel } from "@/features/arquivos/ClassMaterialsPanel";
import { classroomCourseHref } from "@/features/integrations/actions";
import { badgeBase, toneClass } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { PedagogicalWorkspace } from "@/features/academic/server";

// Materiais por turma só são carregados a pedido: com uma dezena de turmas na
// grelha, montar o painel em todas disparava um pedido por cartão e atrasava a
// primeira pintura da lista.
function ClassMaterialsDisclosure({
  classGroupId,
  classLabel,
}: {
  classGroupId: string;
  classLabel: string;
}) {
  const [open, setOpen] = useState(false);
  if (open) return <ClassMaterialsPanel classGroupId={classGroupId} classLabel={classLabel} />;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
    >
      <FolderOpen className="size-3.5" aria-hidden />
      Materiais da turma
    </button>
  );
}

export interface TurmaViewItem {
  id: string;
  code?: string | null;
  nome: string;
  curso: string;
  sala: string;
  shift: string;
  turno: string;
  director: string;
  alunosActuais: number;
  capacidadeReal: number;
  mediaReal: number;
  ano: string;
  classe: string;
  status: string;
  campusId: string | null;
  capacity: number | null;
  whatsappInviteUrl: string;
  whatsappGroupName: string;
}

export function TurmasWorkspaceTab({
  canReadAcademic,
  canManageAcademic,
  isLoading,
  isError,
  errorMessage,
  structureReady,
  bootstrapping,
  bootstrapStructure,
  filters,
  setFilter,
  resetFilters,
  activeCount,
  courses,
  turmasComDados,
  workspace,
  teacherNameById,
  classroomOn,
  moodleOn,
  canvasOn,
  classroomWork,
  moodleGrades,
  canvasWork,
  teamsClasses,
  onedriveOn,
  onOpenTurma,
}: {
  canReadAcademic: boolean;
  canManageAcademic: boolean;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  structureReady: boolean;
  bootstrapping: boolean;
  bootstrapStructure: () => Promise<void>;
  filters: Record<string, string>;
  setFilter: (name: string, value: string) => void;
  resetFilters: () => void;
  activeCount: number;
  courses: Array<{ name: string }>;
  turmasComDados: TurmaViewItem[];
  workspace?: PedagogicalWorkspace;
  teacherNameById: Map<string, string>;
  classroomOn: boolean;
  moodleOn: boolean;
  canvasOn: boolean;
  classroomWork: boolean;
  moodleGrades: boolean;
  canvasWork: boolean;
  teamsClasses: boolean;
  onedriveOn: boolean;
  onOpenTurma: (turmaId: string) => void;
}) {
  if (!canReadAcademic) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center shadow-soft">
        <p className="font-semibold">Sem permissão para a área pedagógica</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Contacte a administração se precisar de acesso a turmas e pautas.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-soft">
        A carregar turmas…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center shadow-soft">
        <p className="font-semibold text-destructive">Não foi possível carregar as turmas</p>
        <p className="mt-2 text-sm text-muted-foreground">{errorMessage || "Erro desconhecido"}</p>
      </div>
    );
  }

  if (!structureReady) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center shadow-soft">
        <Sparkles className="mx-auto size-8 text-primary" />
        <p className="mt-3 font-semibold">Estrutura académica em falta</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ainda não existem anos lectivos, cursos ou classes. Prepare a base padrão para começar a
          criar turmas.
        </p>
        <Button
          className="mt-5 gap-2"
          onClick={() => void bootstrapStructure()}
          disabled={bootstrapping}
        >
          <Sparkles className="size-4" />
          {bootstrapping ? "A preparar…" : "Preparar estrutura académica"}
        </Button>
      </div>
    );
  }

  return (
    <>
      <ListFilterBar
        values={filters}
        activeCount={activeCount}
        onChange={(name, value) => setFilter(name, value)}
        onReset={resetFilters}
        fields={[
          {
            name: "q",
            placeholder: "Pesquisar turma, programa ou classe…",
            "aria-label": "Pesquisar turma",
          },
          {
            name: "turno",
            type: "select",
            label: "Turno",
            emptyValue: "todos",
            options: [
              { value: "todos", label: "Todos" },
              { value: "Manhã", label: "Manhã" },
              { value: "Tarde", label: "Tarde" },
              { value: "Noite", label: "Noite" },
            ],
          },
          {
            name: "programa",
            type: "select",
            label: "Programa",
            emptyValue: "todos",
            options: [
              { value: "todos", label: "Todos" },
              ...courses.map((course) => ({ value: course.name, label: course.name })),
            ],
          },
          {
            name: "estado",
            type: "select",
            label: "Estado",
            emptyValue: "todos",
            options: [
              { value: "todos", label: "Todos os estados" },
              { value: "activas", label: "Activas" },
              { value: "inactivas", label: "Inactivas" },
            ],
          },
          {
            name: "lotacao",
            type: "select",
            label: "Lotação",
            emptyValue: "todas",
            options: [
              { value: "todas", label: "Todas" },
              { value: "vagas", label: "Com vagas" },
              { value: "completas", label: "Completas" },
            ],
          },
        ]}
      />
      {!canManageAcademic ? (
        <p className="text-xs text-muted-foreground">
          Perfil Professor: consulta e exportação activas. Criar/editar turmas exige Secretaria ou
          Administração.
        </p>
      ) : null}
      {turmasComDados.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center shadow-soft">
          <p className="font-semibold">Nenhuma turma neste filtro</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Ajuste a pesquisa ou use “Nova turma” para criar a primeira turma.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {turmasComDados.map((t) => {
            const ocupacao = Math.round((t.alunosActuais / t.capacidadeReal) * 100);
            return (
              <div
                key={t.id}
                className="rounded-xl border border-border bg-card p-5 shadow-card hover:shadow-subtle transition-all duration-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <button
                      type="button"
                      onClick={() => onOpenTurma(t.id)}
                      className="font-display text-lg font-extrabold tracking-tight hover:text-primary hover:underline cursor-pointer"
                    >
                      Turma {t.nome}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {t.curso} · {t.classe} · {t.ano}
                    </p>
                    {(() => {
                      const assigned = (workspace?.classSubjects ?? [])
                        .filter((row) => row.class_group_id === t.id && row.teacher_id)
                        .map((row) => teacherNameById.get(row.teacher_id!) ?? row.subject_name);
                      return assigned.length > 0 ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {assigned.join(" · ")}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  <span className={cn(badgeBase, toneClass.primary)}>{t.turno}</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Estado</dt>
                    <dd className="mt-1">
                      <StatusBadge status={t.status === "active" ? "active" : "inactive"} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Sala</dt>
                    <dd className="font-medium">{t.sala}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Média da turma</dt>
                    <dd className="font-medium">
                      {t.mediaReal > 0 ? `${t.mediaReal.toFixed(1)} val.` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Alunos</dt>
                    <dd className="font-medium">
                      {t.alunosActuais}/{t.capacidadeReal}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Ocupação</span>
                    <span>{ocupacao}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        ocupacao > 90 ? "bg-warning" : "bg-primary",
                      )}
                      style={{ width: `${Math.min(ocupacao, 100)}%` }}
                    />
                  </div>
                </div>
                <ClassMaterialsDisclosure classGroupId={t.id} classLabel={t.nome} />
                {canManageAcademic ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {t.whatsappInviteUrl ? (
                      <Button size="sm" variant="outline" className="gap-1.5" asChild>
                        <a href={t.whatsappInviteUrl} target="_blank" rel="noreferrer">
                          WhatsApp
                        </a>
                      </Button>
                    ) : null}
                    {classroomOn ? (
                      <Button size="sm" variant="outline" className="gap-1.5" asChild>
                        <a
                          href={classroomCourseHref(t.code || undefined)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Classroom
                        </a>
                      </Button>
                    ) : null}
                    {moodleOn ? (
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href="https://docs.moodle.org/en/Web_services"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Moodle
                        </a>
                      </Button>
                    ) : null}
                    {canvasOn ? (
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href="https://www.instructure.com/canvas"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Canvas
                        </a>
                      </Button>
                    ) : null}
                    {classroomWork ? (
                      <Button size="sm" variant="outline" asChild>
                        <a href="https://classroom.google.com/" target="_blank" rel="noreferrer">
                          Trabalhos
                        </a>
                      </Button>
                    ) : null}
                    {moodleGrades ? (
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href="https://docs.moodle.org/en/Gradebook"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Notas Moodle
                        </a>
                      </Button>
                    ) : null}
                    {canvasWork ? (
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href="https://canvas.instructure.com/doc/api/assignments.html"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Trabalhos Canvas
                        </a>
                      </Button>
                    ) : null}
                    {teamsClasses ? (
                      <Button size="sm" variant="outline" asChild>
                        <a href="https://teams.microsoft.com/" target="_blank" rel="noreferrer">
                          Equipa Teams
                        </a>
                      </Button>
                    ) : null}
                    {onedriveOn ? (
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href="https://www.microsoft.com/microsoft-365/onedrive/online-cloud-storage"
                          target="_blank"
                          rel="noreferrer"
                        >
                          OneDrive
                        </a>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
