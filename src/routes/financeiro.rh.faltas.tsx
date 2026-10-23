import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarX2, CheckCircle2, CircleDollarSign, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  listHrAbsencesForReview,
  reviewHrAbsence,
  type HrAbsenceReviewRow,
} from "@/features/hr/absences";
import { kwanza } from "@/lib/currency";
import { toast } from "@/lib/toast";
import { toastActionError } from "@/lib/action-error-toast";

export const Route = createFileRoute("/financeiro/rh/faltas")({
  head: () => ({
    meta: [
      { title: "Faltas e Assiduidade · SIGA" },
      {
        name: "description",
        content:
          "Revisão de faltas funcionais, justificações e impacto estimado na folha salarial.",
      },
    ],
  }),
  component: HrAbsencesPage,
});

type DraftDecision = {
  absenceType: HrAbsenceReviewRow["absenceType"];
  reason: string;
};

const emptyTitles: Record<"all" | HrAbsenceReviewRow["validationStatus"], string> = {
  pending: "Nenhuma falta por rever",
  validated: "Nenhuma falta validada",
  rejected: "Nenhuma falta rejeitada",
  cancelled: "Nenhuma falta cancelada",
  all: "Ainda não há registos de falta",
};

const absenceLabels: Record<HrAbsenceReviewRow["absenceType"], string> = {
  justified_paid: "Justificada remunerada",
  justified_unpaid: "Justificada não remunerada",
  unjustified: "Injustificada",
};

const statusLabels: Record<HrAbsenceReviewRow["validationStatus"], string> = {
  pending: "Pendente",
  validated: "Validada",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
};

function HrAbsencesPage() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, DraftDecision>>({});
  const [filter, setFilter] = useState<"all" | HrAbsenceReviewRow["validationStatus"]>("pending");

  const absences = useQuery({
    queryKey: ["hr", "absences"],
    queryFn: () => listHrAbsencesForReview(),
    retry: false,
  });

  const review = useMutation({
    mutationFn: (input: {
      absenceId: string;
      absenceType: HrAbsenceReviewRow["absenceType"];
      decision: "validate" | "reject";
      reason: string;
    }) => reviewHrAbsence({ data: input }),
    onSuccess: async () => {
      toast.success("Decisão de assiduidade guardada.");
      await queryClient.invalidateQueries({ queryKey: ["hr", "absences"] });
    },
    onError: (error) => toastActionError(error, "Não foi possível guardar a decisão."),
  });

  const rows = useMemo(() => absences.data ?? [], [absences.data]);
  const filtered = useMemo(
    () => rows.filter((row) => filter === "all" || row.validationStatus === filter),
    [filter, rows],
  );
  const pendingCount = rows.filter((row) => row.validationStatus === "pending").length;
  const validatedCount = rows.filter((row) => row.validationStatus === "validated").length;
  const estimatedPending = rows
    .filter((row) => row.validationStatus === "pending")
    .reduce((sum, row) => sum + Number(row.estimatedDeductionKz ?? 0), 0);

  const draftFor = (row: HrAbsenceReviewRow) =>
    drafts[row.id] ?? { absenceType: row.absenceType, reason: row.reason ?? "" };

  const patchDraft = (row: HrAbsenceReviewRow, patch: Partial<DraftDecision>) => {
    setDrafts((current) => ({
      ...current,
      [row.id]: { ...draftFor(row), ...patch },
    }));
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="RH e Folha Salarial"
          title="Faltas e Assiduidade"
          description="Faltas detectadas automaticamente ficam pendentes até revisão. Só uma falta validada pode produzir desconto na folha salarial."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void absences.refetch()}
                disabled={absences.isFetching}
              >
                <RotateCcw className="mr-2 size-4" aria-hidden="true" /> Actualizar
              </Button>
              <Button asChild variant="outline">
                <Link to="/financeiro/rh">Voltar ao RH</Link>
              </Button>
            </div>
          }
        />

        <StatGrid
          items={[
            {
              label: "Pendentes",
              value: String(pendingCount),
              hint: "Aguardam justificação ou decisão",
              icon: AlertTriangle,
            },
            {
              label: "Validadas",
              value: String(validatedCount),
              hint: "Podem influenciar a folha",
              icon: CheckCircle2,
            },
            {
              label: "Impacto pendente",
              value: kwanza(estimatedPending),
              hint: "Estimativa; ainda não descontada",
              icon: CircleDollarSign,
            },
          ]}
        />

        <Panel
          title="Fila de revisão"
          description="Classifique a falta e registe o motivo. Rejeitar significa que a ocorrência não deve produzir desconto."
          action={
            <label className="flex items-center gap-2 text-sm">
              Estado
              <select
                aria-label="Filtrar faltas por estado"
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={filter}
                onChange={(event) => setFilter(event.target.value as typeof filter)}
              >
                <option value="pending">Pendentes</option>
                <option value="validated">Validadas</option>
                <option value="rejected">Rejeitadas</option>
                <option value="cancelled">Canceladas</option>
                <option value="all">Todas</option>
              </select>
            </label>
          }
        >
          {absences.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar faltas…</p>
          ) : absences.isError ? (
            <p className="text-sm text-destructive">
              {absences.error instanceof Error
                ? absences.error.message
                : "Não foi possível carregar as faltas."}
            </p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={CalendarX2}
              title={emptyTitles[filter]}
              description="As faltas são geradas automaticamente quando uma ocorrência elegível termina sem presença confirmada e só entram na folha depois de revistas."
              action={
                filter === "pending" ? undefined : (
                  <Button variant="outline" size="sm" onClick={() => setFilter("pending")}>
                    Ver faltas pendentes
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((row) => {
                const draft = draftFor(row);
                const editable = row.validationStatus === "pending";
                return (
                  <article key={row.id} className="rounded-xl border p-4">
                    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{row.personName}</h3>
                          <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
                            {statusLabels[row.validationStatus]}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {row.absenceDate} · {Math.round((row.durationMinutes / 60) * 100) / 100} h
                          {row.employeeNumber ? ` · Nº ${row.employeeNumber}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Modelo: {row.remunerationModel ?? "política não configurada"}
                        </p>
                      </div>
                      <div className="text-left lg:text-right">
                        <p className="text-xs text-muted-foreground">Impacto estimado</p>
                        <p className="text-lg font-semibold">
                          {row.estimatedDeductionKz == null
                            ? "—"
                            : kwanza(row.estimatedDeductionKz)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[240px_1fr_auto] lg:items-end">
                      <label className="space-y-1 text-sm">
                        <span>Classificação</span>
                        <select
                          aria-label={`Classificação da falta de ${row.personName}`}
                          className="w-full rounded-md border bg-background px-3 py-2"
                          value={draft.absenceType}
                          disabled={!editable}
                          onChange={(event) =>
                            patchDraft(row, {
                              absenceType: event.target.value as HrAbsenceReviewRow["absenceType"],
                            })
                          }
                        >
                          {Object.entries(absenceLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1 text-sm">
                        <span>Justificação / decisão</span>
                        <Input
                          aria-label={`Justificação da falta de ${row.personName}`}
                          value={draft.reason}
                          disabled={!editable}
                          onChange={(event) => patchDraft(row, { reason: event.target.value })}
                          placeholder="Ex.: declaração médica apresentada e validada"
                        />
                      </label>

                      {editable ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={review.isPending || draft.reason.trim().length < 3}
                            onClick={() =>
                              review.mutate({
                                absenceId: row.id,
                                absenceType: draft.absenceType,
                                decision: "validate",
                                reason: draft.reason.trim(),
                              })
                            }
                          >
                            Validar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={review.isPending || draft.reason.trim().length < 3}
                            onClick={() =>
                              review.mutate({
                                absenceId: row.id,
                                absenceType: draft.absenceType,
                                decision: "reject",
                                reason: draft.reason.trim(),
                              })
                            }
                          >
                            Rejeitar
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Regra de segurança"
          description="A deteção automática é evidência operacional, não decisão salarial final."
        >
          <p className="text-sm text-muted-foreground">
            Para mensalistas, uma falta só é descontada depois de validada e conforme a política
            remuneratória do contrato. Para horistas e professores por hora/aula, unidades não
            validadas simplesmente não são somadas à remuneração.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
