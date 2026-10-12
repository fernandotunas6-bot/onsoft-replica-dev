import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InlineLoading } from "@/components/ui/inline-loading";
import { toastActionError } from "@/lib/action-error-toast";
import { cn } from "@/lib/utils";
import { formatPortalShortDate } from "@/features/dashboard/portals/portal-format";
import { GRADE_SHEET_STATUS_LABELS, type GradeSheetStatus } from "./grade-sheet-workflow";
import {
  ELIGIBILITY_REASON_LABELS,
  EXAM_KINDS,
  EXAM_KIND_LABELS,
  EXAM_RESULT_METHODS,
  EXAM_RESULT_METHOD_LABELS,
  EXAM_SESSION_STATUS_LABELS,
  REGISTRATION_STATUS_LABELS,
  type ExamKind,
  type ExamResultMethod,
  type FinalResult,
} from "./exam-engine";
import {
  cancelExamRegistration,
  createExamSession,
  getExamBoard,
  getExamClassDetail,
  registerEligibleStudents,
  saveExamScores,
  setExamSessionStatus,
  type ExamBoard,
  type ExamClassDetail,
  type ExamSession,
} from "./exams";
import {
  getClassFinalResults,
  recordClassFinalResults,
  type ClassFinalResults,
} from "./final-results";

const BOARD_KEY = ["academic", "exam-board"] as const;

const RESULT_TEXT: Record<FinalResult["result"], string> = {
  pass: "Transita",
  fail: "Não transita",
  incomplete: "Incompleto",
};
const RESULT_DOT: Record<FinalResult["result"], string> = {
  pass: "bg-success/70",
  fail: "bg-destructive/60",
  incomplete: "bg-muted-foreground/40",
};

function ResultTag({ result }: { result: FinalResult }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm" title={result.reason ?? undefined}>
      <span className={cn("size-1.5 rounded-full", RESULT_DOT[result.result])} aria-hidden />
      {RESULT_TEXT[result.result]}
      {result.average != null ? (
        <span className="text-muted-foreground">· {result.average}</span>
      ) : null}
    </span>
  );
}

/** Recuperação, exames e resultado final do ano lectivo. */
export function ExamsTab({ yearId }: { yearId: string | null }) {
  const query = useQuery({
    queryKey: [...BOARD_KEY, yearId],
    queryFn: () =>
      getExamBoard({ data: yearId ? { academicYearId: yearId } : {} }) as Promise<ExamBoard>,
    staleTime: 30_000,
  });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const board = query.data;

  useEffect(() => {
    if (!sessionId && board?.sessions.length) setSessionId(board.sessions[0].id);
  }, [board?.sessions, sessionId]);

  if (query.isLoading) return <InlineLoading label="A carregar exames…" />;
  if (query.isError || !board) {
    return (
      <p className="surface-card p-5 text-sm text-muted-foreground">
        {query.error instanceof Error
          ? query.error.message
          : "Não foi possível carregar os exames."}
      </p>
    );
  }
  if (!board.yearId) {
    return (
      <p className="surface-card p-5 text-sm text-muted-foreground">
        Não há ano lectivo activo. Crie-o no calendário lectivo antes de marcar exames.
      </p>
    );
  }

  const session = board.sessions.find((s) => s.id === sessionId) ?? null;

  return (
    <div className="space-y-5">
      <section className="surface-card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">Épocas de exame</h2>
            <p className="text-xs text-muted-foreground">
              Recurso, exame especial, exame final e melhoria. Parte da pauta anual homologada.
            </p>
          </div>
          {board.canManage ? (
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              Nova época
            </Button>
          ) : null}
        </div>
        {board.sessions.length ? (
          <ul className="divide-y divide-border">
            {board.sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSessionId(s.id)}
                  className={cn(
                    "flex w-full flex-wrap items-baseline justify-between gap-2 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/40",
                    s.id === sessionId && "bg-muted/50",
                  )}
                >
                  <span className="text-sm">
                    {s.name}
                    {s.name !== EXAM_KIND_LABELS[s.kind] ? (
                      <span className="text-muted-foreground"> · {EXAM_KIND_LABELS[s.kind]}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {sessionDates(s)}
                    {EXAM_SESSION_STATUS_LABELS[s.status]} · {s.graded}/{s.registrations} lançados
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Ainda não há épocas de exame neste ano.</p>
        )}
      </section>

      {session ? <SessionPanel session={session} board={board} key={session.id} /> : null}

      <FinalResultsPanel board={board} />

      {board.canManage ? (
        <CreateSessionDialog
          open={creating}
          onOpenChange={setCreating}
          yearId={board.yearId}
          onCreated={setSessionId}
        />
      ) : null}
    </div>
  );
}

function sessionDates(s: ExamSession) {
  if (!s.startsOn) return "";
  const start = formatPortalShortDate(s.startsOn);
  return s.endsOn && s.endsOn !== s.startsOn
    ? `${start} – ${formatPortalShortDate(s.endsOn)} · `
    : `${start} · `;
}

function SessionPanel({ session, board }: { session: ExamSession; board: ExamBoard }) {
  const queryClient = useQueryClient();
  const [classGroupId, setClassGroupId] = useState<string>(
    () => board.classGroups.find((g) => g.annualSheetStatus)?.id ?? board.classGroups[0]?.id ?? "",
  );
  const status = useMutation({
    mutationFn: (next: ExamSession["status"]) =>
      setExamSessionStatus({ data: { sessionId: session.id, status: next } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: BOARD_KEY }),
    onError: (e) => toastActionError(e, "Não foi possível mudar o estado."),
  });

  const nextStatus: Array<{ status: ExamSession["status"]; label: string }> =
    session.status === "draft"
      ? [{ status: "open", label: "Abrir época" }]
      : session.status === "open"
        ? [{ status: "closed", label: "Fechar época" }]
        : [{ status: "open", label: "Reabrir" }];

  return (
    <section className="surface-card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-medium">{session.name}</h2>
          <p className="text-xs text-muted-foreground">
            {EXAM_RESULT_METHOD_LABELS[session.resultMethod]}
            {session.kind !== "melhoria"
              ? ` · ${
                  session.maxFailedSubjects == null
                    ? "sem limite de negativas"
                    : `até ${session.maxFailedSubjects} negativa(s)`
                }`
              : " · disciplinas já aprovadas"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Turma"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={classGroupId}
            onChange={(e) => setClassGroupId(e.target.value)}
          >
            {board.classGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.annualSheetStatus
                  ? ` — pauta ${GRADE_SHEET_STATUS_LABELS[g.annualSheetStatus as GradeSheetStatus]?.toLowerCase() ?? ""}`
                  : " — sem pauta anual"}
              </option>
            ))}
          </select>
          {board.canManage
            ? nextStatus.map((n) => (
                <Button
                  key={n.status}
                  size="sm"
                  variant="outline"
                  disabled={status.isPending}
                  onClick={() => status.mutate(n.status)}
                >
                  {n.label}
                </Button>
              ))
            : null}
        </div>
      </div>
      {classGroupId ? (
        <ClassExamDetail sessionId={session.id} classGroupId={classGroupId} />
      ) : (
        <p className="text-sm text-muted-foreground">Sem turmas neste ano lectivo.</p>
      )}
    </section>
  );
}

type Draft = Record<string, { score: string; absent: boolean }>;

function ClassExamDetail({ sessionId, classGroupId }: { sessionId: string; classGroupId: string }) {
  const queryClient = useQueryClient();
  const key = ["academic", "exam-class", sessionId, classGroupId];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      getExamClassDetail({ data: { sessionId, classGroupId } }) as Promise<ExamClassDetail>,
  });
  const [draft, setDraft] = useState<Draft>({});
  useEffect(() => setDraft({}), [sessionId, classGroupId]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
  };
  const register = useMutation({
    mutationFn: () => registerEligibleStudents({ data: { sessionId, classGroupId } }),
    onSuccess: (r) => {
      toast.success(
        r.registered
          ? `${r.registered} inscrição(ões) feitas; ${r.notified} aviso(s) enviados.`
          : "Não havia novos alunos elegíveis.",
      );
      refresh();
    },
    onError: (e) => toastActionError(e, "Não foi possível inscrever."),
  });
  const save = useMutation({
    mutationFn: () =>
      saveExamScores({
        data: {
          sessionId,
          entries: Object.entries(draft).map(([registrationId, d]) => ({
            registrationId,
            absent: d.absent,
            score: d.absent || d.score.trim() === "" ? null : Number(d.score.replace(",", ".")),
          })),
        },
      }),
    onSuccess: (r) => {
      toast.success(`${r.saved} nota(s) gravadas.`);
      setDraft({});
      refresh();
    },
    onError: (e) => toastActionError(e, "Não foi possível gravar as notas."),
  });
  const cancel = useMutation({
    mutationFn: (registrationId: string) => cancelExamRegistration({ data: { registrationId } }),
    onSuccess: refresh,
    onError: (e) => toastActionError(e, "Não foi possível anular."),
  });

  const detail = query.data;
  const summary = useMemo(() => {
    if (!detail) return null;
    const eligible = detail.students.filter((s) => s.eligibility.eligible).length;
    const registered = detail.students.filter((s) =>
      s.registrations.some((r) => r.status !== "cancelled"),
    ).length;
    const passBefore = detail.students.filter((s) => s.before.result === "pass").length;
    const passAfter = detail.students.filter((s) => s.after.result === "pass").length;
    return { eligible, registered, passBefore, passAfter };
  }, [detail]);

  if (query.isLoading) return <InlineLoading label="A carregar a turma…" />;
  if (query.isError || !detail) {
    return (
      <p className="text-sm text-muted-foreground">
        {query.error instanceof Error ? query.error.message : "Não foi possível carregar a turma."}
      </p>
    );
  }
  if (!detail.sheet) {
    return (
      <p className="rounded-md bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
        Esta turma ainda não tem pauta anual. Gere-a no separador Pautas e homologue-a.
      </p>
    );
  }
  if (!detail.rule) {
    return (
      <p className="rounded-md bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
        A pauta anual não tem regra de avaliação associada. Publique o modelo de avaliação.
      </p>
    );
  }

  const editable = detail.canManage && detail.session.status === "open";
  const dirty = Object.keys(draft).length > 0;

  return (
    <div className="space-y-4">
      {!detail.sheet.official ? (
        <p className="rounded-md bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          Pauta anual em{" "}
          {GRADE_SHEET_STATUS_LABELS[detail.sheet.status as GradeSheetStatus]?.toLowerCase()}: os
          números são provisórios e só se inscreve depois de homologada.
        </p>
      ) : null}

      {summary ? (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ["Elegíveis", summary.eligible],
            ["Inscritos", summary.registered],
            ["Transitam (pauta)", summary.passBefore],
            ["Transitam (após exames)", summary.passAfter],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-border/70 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-base">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {detail.canManage && detail.session.status !== "closed" ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!detail.sheet.official || register.isPending}
            onClick={() => register.mutate()}
          >
            {register.isPending ? "A inscrever…" : "Inscrever elegíveis"}
          </Button>
          {editable ? (
            <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "A gravar…" : "Gravar notas"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {detail.canManage && detail.session.status === "draft" ? (
        <p className="text-right text-xs text-muted-foreground">
          Abra a época para lançar as notas.
        </p>
      ) : null}

      <ul className="divide-y divide-border">
        {detail.students.map((s) => {
          const active = s.registrations.filter((r) => r.status !== "cancelled");
          return (
            <li key={s.enrollmentId} className="space-y-2 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm">{s.studentName}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <ResultTag result={s.before} />
                  {active.length ? (
                    <>
                      <span aria-hidden>→</span>
                      <ResultTag result={s.after} />
                    </>
                  ) : null}
                </span>
              </div>
              {active.length ? (
                <div className="space-y-1.5 pl-3">
                  {active.map((r) => {
                    const d = draft[r.id];
                    const scoreValue = d ? d.score : r.score != null ? String(r.score) : "";
                    const absent = d ? d.absent : r.status === "absent";
                    return (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm"
                      >
                        <span className="min-w-[140px] flex-1">
                          {r.subjectName}
                          <span className="text-muted-foreground">
                            {" "}
                            · média {r.originalAverage ?? "—"}
                          </span>
                        </span>
                        {editable ? (
                          <>
                            <Input
                              aria-label={`Nota do exame de ${r.subjectName} — ${s.studentName}`}
                              inputMode="decimal"
                              className="h-8 w-20"
                              disabled={absent}
                              value={absent ? "" : scoreValue}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [r.id]: { score: e.target.value, absent: false },
                                }))
                              }
                            />
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                aria-label={`Faltou ao exame de ${r.subjectName} — ${s.studentName}`}
                                className="accent-primary"
                                checked={absent}
                                onChange={(e) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    [r.id]: { score: scoreValue, absent: e.target.checked },
                                  }))
                                }
                              />
                              Faltou
                            </label>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => cancel.mutate(r.id)}
                            >
                              Anular
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {REGISTRATION_STATUS_LABELS[r.status]}
                            {r.score != null ? ` · exame ${r.score}` : ""}
                          </span>
                        )}
                        {r.finalAverage != null ? (
                          <span className="text-xs text-muted-foreground">
                            nova média {r.finalAverage}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : !s.eligibility.eligible && s.eligibility.reason !== "no-negatives" ? (
                <p className="pl-3 text-xs text-muted-foreground">
                  {ELIGIBILITY_REASON_LABELS[s.eligibility.reason]}
                </p>
              ) : s.eligibility.eligible ? (
                <p className="pl-3 text-xs text-muted-foreground">
                  Elegível: {s.eligibility.subjects.map((x) => x.subjectName).join(", ")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CreateSessionDialog({
  open,
  onOpenChange,
  yearId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  yearId: string;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ExamKind>("recurso");
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [maxFailed, setMaxFailed] = useState("");
  const [method, setMethod] = useState<ExamResultMethod>("replace");

  const create = useMutation({
    mutationFn: () =>
      createExamSession({
        data: {
          academicYearId: yearId,
          kind,
          name: name.trim() || undefined,
          startsOn: startsOn || null,
          endsOn: endsOn || null,
          maxFailedSubjects: maxFailed.trim() ? Number(maxFailed) : null,
          resultMethod: method,
        },
      }),
    onSuccess: (r) => {
      toast.success("Época criada.");
      void queryClient.invalidateQueries({ queryKey: BOARD_KEY });
      onCreated(r.id);
      onOpenChange(false);
      setName("");
      setStartsOn("");
      setEndsOn("");
      setMaxFailed("");
    },
    onError: (e) => toastActionError(e, "Não foi possível criar a época."),
  });

  const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-medium">Nova época de exames</DialogTitle>
          <DialogDescription>
            O acesso e o cálculo são decididos pela escola; a nota de aprovação vem do modelo de
            avaliação.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Tipo">
            <select
              aria-label="Tipo"
              className={selectClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as ExamKind)}
            >
              {EXAM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {EXAM_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nome (opcional)">
            <Input
              aria-label="Nome (opcional)"
              value={name}
              placeholder={EXAM_KIND_LABELS[kind]}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Início">
              <Input
                aria-label="Início"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </Field>
            <Field label="Fim">
              <Input
                aria-label="Fim"
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            </Field>
          </div>
          {kind !== "melhoria" ? (
            <Field label="Máximo de negativas para ter acesso (vazio = sem limite)">
              <Input
                aria-label="Máximo de negativas para ter acesso (vazio = sem limite)"
                type="number"
                min={1}
                max={30}
                value={maxFailed}
                onChange={(e) => setMaxFailed(e.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Como a nota do exame entra na média">
            <select
              aria-label="Como a nota do exame entra na média"
              className={selectClass}
              value={method}
              onChange={(e) => setMethod(e.target.value as ExamResultMethod)}
            >
              {EXAM_RESULT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {EXAM_RESULT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "A criar…" : "Criar época"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function FinalResultsPanel({ board }: { board: ExamBoard }) {
  const queryClient = useQueryClient();
  const [classGroupId, setClassGroupId] = useState<string>(
    () => board.classGroups.find((g) => g.annualSheetStatus)?.id ?? board.classGroups[0]?.id ?? "",
  );
  const key = ["academic", "final-results", classGroupId];
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(classGroupId),
    queryFn: () => getClassFinalResults({ data: { classGroupId } }) as Promise<ClassFinalResults>,
  });
  const record = useMutation({
    mutationFn: () => recordClassFinalResults({ data: { classGroupId } }),
    onSuccess: (r) => {
      toast.success(
        `${r.recorded} aluno(s) registados no histórico${r.rectified ? ` (${r.rectified} rectificado(s))` : ""}${r.skipped ? `; ${r.skipped} incompleto(s) ficaram de fora` : ""}.`,
      );
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["academic", "structure-status"] });
    },
    onError: (e) => toastActionError(e, "Não foi possível registar no histórico."),
  });

  const data = query.data;
  const counts = useMemo(() => {
    const out = { pass: 0, fail: 0, incomplete: 0, recorded: 0 };
    for (const s of data?.students ?? []) {
      out[s.after.result] += 1;
      if (s.recorded) out.recorded += 1;
    }
    return out;
  }, [data]);

  if (!board.classGroups.length) return null;

  return (
    <section className="surface-card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-medium">Resultado final</h2>
          <p className="text-xs text-muted-foreground">
            Pauta anual com as notas de exame. Registar grava a média e o resultado no histórico
            académico de cada aluno.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Turma do resultado final"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={classGroupId}
            onChange={(e) => setClassGroupId(e.target.value)}
          >
            {board.classGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {data?.canManage ? (
            <Button
              size="sm"
              disabled={!data.sheet?.official || !data.students.length || record.isPending}
              onClick={() => record.mutate()}
            >
              {record.isPending
                ? "A registar…"
                : counts.recorded
                  ? "Actualizar histórico"
                  : "Registar no histórico"}
            </Button>
          ) : null}
        </div>
      </div>

      {query.isLoading ? (
        <InlineLoading label="A calcular o resultado final…" />
      ) : query.isError || !data ? (
        <p className="text-sm text-muted-foreground">
          {query.error instanceof Error
            ? query.error.message
            : "Não foi possível calcular o resultado final."}
        </p>
      ) : !data.sheet ? (
        <p className="rounded-md bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          Esta turma ainda não tem pauta anual. Gere-a no separador Pautas e homologue-a.
        </p>
      ) : !data.hasRule ? (
        <p className="rounded-md bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          A pauta anual não tem regra de avaliação associada.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {data.yearLabel} · {data.gradeLevel} · {counts.pass} transitam · {counts.fail} não
            transitam
            {counts.incomplete ? ` · ${counts.incomplete} incompletos` : ""}
            {counts.recorded ? ` · ${counts.recorded} já no histórico` : ""}
            {!data.sheet.official ? " · pauta ainda não homologada (provisório)" : ""}
          </p>
          <ul className="divide-y divide-border">
            {data.students.map((s) => (
              <li
                key={s.enrollmentId}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2.5"
              >
                <span className="text-sm">
                  {s.studentName}
                  {s.examSubjects ? (
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · {s.examSubjects} exame(s)
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <ResultTag result={s.after} />
                  {s.after.reason && s.after.result === "fail" ? (
                    <span>{s.after.reason}</span>
                  ) : null}
                  <span>{s.recorded ? "No histórico" : "Por registar"}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
