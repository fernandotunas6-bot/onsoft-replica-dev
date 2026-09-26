import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileSpreadsheet, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { InlineLoading } from "@/components/ui/inline-loading";
import { toastActionError } from "@/lib/action-error-toast";
import { cn } from "@/lib/utils";
import {
  buildGradeSheet,
  getGradeSheetBoard,
  getGradeSheetDetail,
  transitionGradeSheet,
  type GradeSheetBoard,
  type GradeSheetDetail,
} from "./grade-sheets";
import {
  GRADE_RESULT_LABELS,
  GRADE_SHEET_MAIN_PATH,
  GRADE_SHEET_STATUS_LABELS,
  gradeSheetActions,
  isGradeSheetLocked,
  prePautaIsClean,
  type GradeSheetAction,
  type GradeSheetStatus,
} from "./grade-sheet-workflow";

const STATUS_DOT: Record<GradeSheetStatus, string> = {
  draft: "bg-muted-foreground/40",
  submitted: "bg-warning/80",
  in_review: "bg-warning/80",
  homologated: "bg-primary/60",
  published: "bg-success/70",
  closed: "bg-success/70",
  contested: "bg-destructive/70",
  rectified: "bg-warning/80",
};

const fmt = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const BOARD_KEY = ["academic", "grade-sheet-board"];

/** Pautas oficiais do ano: estado por turma e período, e o fluxo de validação. */
export function GradeSheetsBoard({
  yearId,
  canManage,
}: {
  yearId: string | null;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const board = useQuery({
    queryKey: [...BOARD_KEY, yearId],
    queryFn: () =>
      getGradeSheetBoard({
        data: yearId ? { academicYearId: yearId } : {},
      }) as Promise<GradeSheetBoard>,
  });
  const [period, setPeriod] = useState<string | null>(null); // termId ou "annual"
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);
  const terms = board.data?.terms ?? [];
  const activePeriod = period ?? terms[0]?.id ?? "annual";
  const kind = activePeriod === "annual" ? "annual" : "term";

  const build = useMutation({
    mutationFn: (classGroupId: string) =>
      buildGradeSheet({
        data: { classGroupId, termId: kind === "term" ? activePeriod : null, kind },
      }),
    onSuccess: (result) => {
      toast.success("Pauta gerada em rascunho.");
      void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
      if (result?.gradeSheetId) setOpenSheetId(result.gradeSheetId);
    },
    onError: (error) => toastActionError(error, "Não foi possível gerar a pauta."),
  });

  const sheetFor = (classGroupId: string) =>
    board.data?.sheets.find(
      (s) =>
        s.classGroupId === classGroupId &&
        s.kind === kind &&
        (kind === "annual" || s.termId === activePeriod),
    ) ?? null;

  return (
    <section className="surface-card w-full min-w-0 space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
          Pautas oficiais
        </h2>
        <p className="text-xs text-muted-foreground">
          Rascunho → submetida → validação → homologada → publicada → fechada
        </p>
      </div>

      {board.isLoading ? (
        <InlineLoading label="A carregar pautas…" />
      ) : board.isError ? (
        <p className="text-xs text-muted-foreground">Não foi possível carregar as pautas.</p>
      ) : !board.data?.classGroups.length ? (
        <p className="text-xs text-muted-foreground">Sem turmas neste ano lectivo.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Período">
            {[
              ...terms.map((t) => ({ id: t.id, label: t.name })),
              { id: "annual", label: "Pauta anual" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.id === activePeriod}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  p.id === activePeriod
                    ? "bg-primary-soft text-primary-strong"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <ul className="divide-y divide-border">
            {board.data.classGroups.map((group) => {
              const sheet = sheetFor(group.id);
              return (
                <li key={group.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm">{group.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {sheet ? (
                        <>
                          <span
                            className={cn("size-1.5 rounded-full", STATUS_DOT[sheet.status])}
                            aria-hidden
                          />
                          {GRADE_SHEET_STATUS_LABELS[sheet.status]}
                          {isGradeSheetLocked(sheet.status) ? (
                            <Lock className="size-3" aria-label="Bloqueada" />
                          ) : null}
                        </>
                      ) : (
                        "Por gerar"
                      )}
                    </p>
                  </div>
                  {sheet ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => setOpenSheetId(sheet.id)}
                    >
                      Abrir
                    </Button>
                  ) : canManage ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={build.isPending}
                      onClick={() => build.mutate(group.id)}
                    >
                      Gerar pauta
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <GradeSheetDialog
        sheetId={openSheetId}
        canManage={canManage}
        onClose={() => setOpenSheetId(null)}
      />
    </section>
  );
}

function GradeSheetDialog({
  sheetId,
  canManage,
  onClose,
}: {
  sheetId: string | null;
  canManage: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const detailKey = ["academic", "grade-sheet", sheetId];
  const detail = useQuery({
    queryKey: detailKey,
    enabled: Boolean(sheetId),
    queryFn: () =>
      getGradeSheetDetail({ data: { sheetId: sheetId! } }) as Promise<GradeSheetDetail>,
  });
  const [reasonFor, setReasonFor] = useState<GradeSheetAction | null>(null);
  const [reason, setReason] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: detailKey });
    void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
  };
  const act = useMutation({
    mutationFn: async (action: GradeSheetAction) => {
      const sheet = detail.data!;
      if (action.next === "rebuild") {
        return buildGradeSheet({
          data: { classGroupId: sheet.classGroupId, termId: sheet.termId, kind: sheet.kind },
        });
      }
      return transitionGradeSheet({
        data: {
          sheetId: sheet.id,
          status: action.next,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
      });
    },
    onSuccess: (result, action) => {
      const notified = (result as { notified?: number })?.notified ?? 0;
      toast.success(
        action.next === "published" && notified
          ? `Pauta publicada. ${notified} pessoas avisadas.`
          : `${action.label}: feito.`,
      );
      setReasonFor(null);
      setReason("");
      refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível concluir a acção."),
  });

  const sheet = detail.data;
  const clean = sheet ? prePautaIsClean(sheet.checks) : false;
  const stepIndex = sheet ? GRADE_SHEET_MAIN_PATH.indexOf(sheet.status) : -1;

  return (
    <Dialog open={Boolean(sheetId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>{sheet?.title ?? "Pauta"}</DialogTitle>
          <DialogDescription>
            {sheet ? GRADE_SHEET_STATUS_LABELS[sheet.status] : "A carregar…"}
            {sheet?.kind === "annual" ? " · pauta anual" : ""}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading || !sheet ? (
          <InlineLoading label="A carregar a pauta…" />
        ) : (
          <div className="space-y-5">
            <ol
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
              aria-label="Estado da pauta"
            >
              {GRADE_SHEET_MAIN_PATH.map((status, index) => (
                <li
                  key={status}
                  aria-current={status === sheet.status ? "step" : undefined}
                  className={cn(
                    "rounded-full px-2.5 py-1",
                    status === sheet.status
                      ? "bg-primary-soft text-primary-strong"
                      : index < stepIndex
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {index < stepIndex ? "✓ " : ""}
                  {GRADE_SHEET_STATUS_LABELS[status]}
                </li>
              ))}
              {stepIndex === -1 ? (
                <li className="rounded-full bg-warning/15 px-2.5 py-1 text-warning-strong">
                  {GRADE_SHEET_STATUS_LABELS[sheet.status]}
                </li>
              ) : null}
            </ol>

            {isGradeSheetLocked(sheet.status) ? (
              <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-3.5 shrink-0" />
                Pauta bloqueada. Alterações só por reabertura para rectificação, com motivo, que
                fica registada na auditoria.
              </p>
            ) : null}
            {sheet.reopenReason ? (
              <p className="text-xs text-muted-foreground">
                Motivo da reabertura: {sheet.reopenReason}
              </p>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Pré-pauta</h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {sheet.checks.map((check) => (
                  <li key={check.id} className="flex items-start gap-2 text-sm">
                    {check.ok ? (
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-success"
                        aria-label="Cumprido"
                      />
                    ) : (
                      <X
                        className="mt-0.5 size-4 shrink-0 text-destructive/80"
                        aria-label="Por resolver"
                      />
                    )}
                    <span>
                      {check.label}
                      {check.detail ? (
                        <span className="block text-xs text-muted-foreground">{check.detail}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {canManage ? (
              <section className="space-y-2 border-t border-border pt-3">
                <div className="flex flex-wrap gap-2">
                  {gradeSheetActions(sheet.status).map((action) => {
                    const blocked = action.requiresCleanPrePauta && !clean;
                    return (
                      <Button
                        key={action.next}
                        size="sm"
                        variant={action.primary ? "default" : "outline"}
                        disabled={act.isPending || blocked}
                        title={blocked ? "Resolva primeiro a pré-pauta." : undefined}
                        onClick={() =>
                          action.needsReason ? setReasonFor(action) : act.mutate(action)
                        }
                      >
                        {action.label}
                      </Button>
                    );
                  })}
                </div>
                {!clean && gradeSheetActions(sheet.status).some((a) => a.requiresCleanPrePauta) ? (
                  <p className="text-xs text-muted-foreground">
                    Submeter e homologar ficam disponíveis quando a pré-pauta estiver sem problemas.
                  </p>
                ) : null}
                {reasonFor ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Motivo (obrigatório; fica na auditoria)"
                      aria-label="Motivo da reabertura"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={act.isPending || reason.trim().length < 5}
                        onClick={() => act.mutate(reasonFor)}
                      >
                        {reasonFor.label}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setReasonFor(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-sm font-medium">
                Alunos <span className="text-muted-foreground">· {sheet.rows.length}</span>
              </h3>
              {sheet.rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sem linhas. Gere ou recalcule a pauta depois de lançar as notas.
                </p>
              ) : (
                <div className="w-0 min-w-full overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-normal">Aluno</th>
                        <th className="px-2 py-2 text-right font-normal">Contínua</th>
                        <th className="px-2 py-2 text-right font-normal">Provas</th>
                        <th className="px-2 py-2 text-right font-normal">Média</th>
                        <th className="px-2 py-2 text-right font-normal">Faltas</th>
                        <th className="py-2 pl-3 font-normal">Resultado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sheet.rows.map((row) => (
                        <tr key={row.enrollmentId}>
                          <td className="py-2 pr-3">
                            {row.studentName}
                            {row.subjects.length ? (
                              <span className="block text-xs text-muted-foreground">
                                {row.subjects
                                  .map((s) => `${s.subject.slice(0, 4)}. ${fmt(s.average)}`)
                                  .join(" · ")}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {fmt(row.continuous)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmt(row.exam)}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-medium">
                            {fmt(row.average)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {row.absencePct == null ? "—" : `${Math.round(row.absencePct)}%`}
                          </td>
                          <td
                            className={cn(
                              "py-2 pl-3 text-xs",
                              row.result === "fail"
                                ? "text-destructive/85"
                                : "text-muted-foreground",
                            )}
                          >
                            {GRADE_RESULT_LABELS[row.result] ?? row.result}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
