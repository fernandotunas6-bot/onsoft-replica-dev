import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { BookOpenCheck, ClipboardCheck, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { DocHelpButton, SqlDocHelpButton } from "@/components/ui/doc-help-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { usePersistedListFilters } from "@/lib/list-filters";
import { listPedagogicalWorkspace, type PedagogicalWorkspace } from "@/features/academic/server";
import {
  deleteLessonPlan,
  listLessonPlans,
  type LessonPlansResult,
} from "@/features/lesson-plans/server";
import {
  LessonPlanModal,
  type LessonPlanFormInitial,
} from "@/features/lesson-plans/LessonPlanModal";
import { SqlChecklistLink } from "@/components/ui/sql-checklist-link";

const filterDefaults = { q: "", turma: "", disciplina: "", trimestre: "" };

const planosSearchSchema = z.object({
  turma: z.string().uuid().optional().catch(undefined),
  disciplina: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/planos-aula")({
  validateSearch: (search) => planosSearchSchema.parse(search),
  head: () => ({ meta: [{ title: "Planos de Aula · SIGA" }] }),
  component: LessonPlansPage,
});

type LessonPlanRow = {
  id: string;
  class_group_id: string;
  subject_id: string;
  term: 1 | 2 | 3;
  title: string;
  content: string | null;
  file_id: string | null;
  file_name: string | null;
  status: "draft" | "published";
  class_group_name: string;
  subject_name: string;
  components: Array<{ kind: "avaliacao" | "prova"; name: string; planned_count: number }>;
};

const termLabels: Record<number, string> = {
  1: "1º Trimestre",
  2: "2º Trimestre",
  3: "3º Trimestre",
};

function LessonPlansPage() {
  const search = Route.useSearch();
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "planos-aula",
    filterDefaults,
  );
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LessonPlanFormInitial | null>(null);

  useEffect(() => {
    if (search.turma) setFilter("turma", search.turma);
    if (search.disciplina) setFilter("disciplina", search.disciplina);
    // Seed once from deep-link (portal / presença / chamada).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount seed
  }, []);

  const workspaceQuery = useQuery({
    queryKey: ["pedagogica", "workspace", "planos-aula"],
    queryFn: () => listPedagogicalWorkspace({ data: {} }) as Promise<PedagogicalWorkspace>,
    staleTime: 60_000,
  });
  const classGroups = useMemo(
    () => (workspaceQuery.data?.classGroups ?? []).map((row) => ({ id: row.id, name: row.name })),
    [workspaceQuery.data],
  );
  const subjects = useMemo(
    () => (workspaceQuery.data?.subjects ?? []).map((row) => ({ id: row.id, name: row.name })),
    [workspaceQuery.data],
  );

  const plansQuery = useQuery({
    queryKey: [
      "lesson-plans",
      filters.turma || undefined,
      filters.disciplina || undefined,
      filters.trimestre || undefined,
    ],
    queryFn: () =>
      listLessonPlans({
        data: {
          classGroupId: filters.turma || undefined,
          subjectId: filters.disciplina || undefined,
          term: filters.trimestre ? (Number(filters.trimestre) as 1 | 2 | 3) : undefined,
          limit: 200,
        },
      }) as Promise<LessonPlansResult>,
    staleTime: 15_000,
  });

  const plans = (plansQuery.data?.plans ?? []) as LessonPlanRow[];
  const query = filters.q.trim().toLowerCase();
  const filtered = query ? plans.filter((plan) => plan.title.toLowerCase().includes(query)) : plans;

  const grouped = useMemo(() => {
    const byTerm = new Map<number, LessonPlanRow[]>();
    for (const plan of filtered) {
      const list = byTerm.get(plan.term) ?? [];
      list.push(plan);
      byTerm.set(plan.term, list);
    }
    return [...byTerm.entries()].sort(([a], [b]) => a - b);
  }, [filtered]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["lesson-plans"] });

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (plan: LessonPlanRow) => {
    setEditing({
      id: plan.id,
      classGroupId: plan.class_group_id,
      subjectId: plan.subject_id,
      term: plan.term,
      title: plan.title,
      content: plan.content,
      fileId: plan.file_id,
      fileName: plan.file_name,
      status: plan.status,
      components: plan.components,
    });
    setModalOpen(true);
  };

  const remove = async (plan: LessonPlanRow) => {
    if (!window.confirm(`Remover o plano "${plan.title}"? As notas já lançadas são mantidas.`))
      return;
    try {
      await deleteLessonPlan({ data: { id: plan.id } });
      toast.success("Plano de aula removido");
      invalidate();
    } catch (error) {
      toast.error("Não foi possível remover", {
        description: error instanceof Error ? error.message : "Tenta novamente.",
      });
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Área Pedagógica"
          title="Planos de Aula"
          description="Título, conteúdo e estrutura de avaliações/provas por turma, disciplina e trimestre — modelo angolano."
          actions={
            <>
              <SqlDocHelpButton />
              <DocHelpButton title="Navegação — Planos de Aula" />
              <Button className="gap-2" onClick={openCreate} disabled={!classGroups.length}>
                <Plus className="size-4" /> Novo plano
              </Button>
            </>
          }
        />

        <ListFilterBar
          values={filters}
          activeCount={activeCount}
          onChange={(name, value) => setFilter(name as keyof typeof filters, value)}
          onReset={resetFilters}
          fields={[
            { name: "q", placeholder: "Pesquisar por título…", "aria-label": "Pesquisar" },
            {
              name: "turma",
              type: "select",
              label: "Turma",
              options: classGroups.map((group) => ({ value: group.id, label: group.name })),
            },
            {
              name: "disciplina",
              type: "select",
              label: "Disciplina",
              options: subjects.map((subject) => ({ value: subject.id, label: subject.name })),
            },
            {
              name: "trimestre",
              type: "select",
              label: "Trimestre",
              options: [
                { value: "1", label: "1º Trimestre" },
                { value: "2", label: "2º Trimestre" },
                { value: "3", label: "3º Trimestre" },
              ],
            },
          ]}
        />

        {plansQuery.data?.available === false ? (
          <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-sm text-muted-foreground">
            Tabelas de planos de aula em falta. Corra{" "}
            <code>supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql</code> no SQL Editor do projecto SGA.{" "}
            <SqlChecklistLink />
          </div>
        ) : null}

        {grouped.length === 0 && plansQuery.data?.available !== false ? (
          <EmptyState
            icon={BookOpenCheck}
            title="Ainda não há planos de aula"
            description="Crie um plano com a estrutura de avaliações e provas para alimentar o Centro de Avaliação."
            compact
          />
        ) : null}

        {grouped.map(([term, termPlans]) => (
          <div key={term} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {termLabels[term] ?? `${term}º Trimestre`}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {termPlans.map((plan) => {
                const avaliacoes = plan.components.filter((row) => row.kind === "avaliacao");
                const provas = plan.components.filter((row) => row.kind === "prova");
                return (
                  <div
                    key={plan.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card hover:shadow-subtle transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{plan.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {plan.class_group_name} · {plan.subject_name}
                        </p>
                      </div>
                      <StatusBadge
                        status={plan.status === "published" ? "active" : "inactive"}
                        label={plan.status === "published" ? "Publicado" : "Rascunho"}
                      />
                    </div>
                    {plan.content ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{plan.content}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      {avaliacoes.map((row) => (
                        <span
                          key={`av-${row.name}`}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[11px]"
                        >
                          <BookOpenCheck className="size-3" /> {row.name} × {row.planned_count}
                        </span>
                      ))}
                      {provas.map((row) => (
                        <span
                          key={`pr-${row.name}`}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[11px]"
                        >
                          <ClipboardCheck className="size-3" /> {row.name} × {row.planned_count}
                        </span>
                      ))}
                      {plan.file_name ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[11px]">
                          <FileText className="size-3" /> {plan.file_name}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-auto flex justify-end gap-1.5 border-t border-border pt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5"
                        onClick={() => openEdit(plan)}
                      >
                        <Pencil className="size-3.5" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => remove(plan)}
                      >
                        <Trash2 className="size-3.5" /> Remover
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <LessonPlanModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        classGroups={classGroups}
        subjects={subjects}
        initial={editing}
        {...(filters.turma ? { defaultClassGroupId: filters.turma } : {})}
        {...(filters.disciplina ? { defaultSubjectId: filters.disciplina } : {})}
        {...(filters.trimestre ? { defaultTerm: Number(filters.trimestre) as 1 | 2 | 3 } : {})}
        onSaved={invalidate}
      />
    </AppShell>
  );
}
