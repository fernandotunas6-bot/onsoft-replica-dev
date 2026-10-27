import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  Archive,
  Camera,
  ArchiveRestore,
  History,
  Hourglass,
  Inbox,
  Paperclip,
  Pencil,
  Settings2,
  Star,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { InlineLoading } from "@/components/ui/inline-loading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { publicErrorMessage } from "@/lib/public-error";
import { cn } from "@/lib/utils";
import { TASK_KINDS, TASK_KIND_LABELS } from "@/features/academic/lesson-messages";
import type { SubmissionRow, WorkSummary } from "@/features/academic/task-submissions";
import {
  getMyTaskSubmission,
  linkTaskAssessment,
  listTaskSubmissions,
  recordPaperSubmission,
  returnTaskSubmission,
  submitTaskWork,
  syncTaskGradesToPauta,
  updateTaskSettings,
  type TaskAssessmentOption,
  type TaskSubmissionLine,
} from "@/features/academic/task-submissions-server";
import { formatBytes } from "@/features/academic/task-attachments";
import { GradeMeter } from "./GradeMeter";
import { AttachmentLink } from "./TaskAttachment";
import { prepareAttachment, type PreparedAttachment } from "./prepare-attachment";
import { gradeToneClass } from "./grade-tone";
import { StatePill } from "./task-state-ui";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-AO", { day: "2-digit", month: "short" }) : "";
const dueLabel = (dueOn: string | null) =>
  dueOn
    ? new Date(`${dueOn}T12:00:00`).toLocaleDateString("pt-AO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "sem prazo";
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("") || "—";

type Listed = Awaited<ReturnType<typeof listTaskSubmissions>>;
export type Filter = "all" | "pending" | "toReturn" | "returned";
const FILTERS: Array<{ key: Filter; label: string; test: (line: TaskSubmissionLine) => boolean }> =
  [
    { key: "all", label: "Todos", test: () => true },
    { key: "pending", label: "Por entregar", test: (line) => !line.submission },
    {
      key: "toReturn",
      label: "Por devolver",
      test: (line) => line.submission?.status === "submitted",
    },
    {
      key: "returned",
      label: "Devolvidas",
      test: (line) => line.submission?.status === "returned",
    },
  ];

/** Professor ou direcção: resumo, configuração e a turma inteira, com o histórico. */
export function TaskSubmissionsPanel({
  taskId,
  filter: controlledFilter,
  onFilterChange,
}: {
  taskId: string;
  /** Filtro vindo da URL (o menu do trabalho abre «Por entregar», «Por corrigir»…). */
  filter?: Filter;
  onFilterChange?: (filter: Filter) => void;
}) {
  const queryKey = ["task-submissions", taskId];
  const [localFilter, setLocalFilter] = useState<Filter>("all");
  const filter = controlledFilter ?? localFilter;
  const setFilter = onFilterChange ?? setLocalFilter;
  const query = useQuery({
    queryKey,
    queryFn: () => listTaskSubmissions({ data: { taskId } }),
    retry: false,
  });
  if (query.isLoading) return <InlineLoading label="A carregar as entregas…" />;
  if (query.isError || !query.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {publicErrorMessage(query.error, "Não foi possível ler as entregas.")}
      </p>
    );
  }
  const data = query.data;
  const lines = data.lines ?? [];
  const delivered = lines.filter((line) => line.submission).length;
  const active = FILTERS.find((item) => item.key === filter)!;
  const shown = lines.filter(active.test);

  return (
    <div className="space-y-6">
      <WorkStats summary={data.summary} />
      <TaskSettings taskId={taskId} data={data} queryKey={queryKey} />

      <section aria-labelledby={`entregas-${taskId}`} className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id={`entregas-${taskId}`} className="text-sm font-semibold">
              Entregas da turma
            </h2>
            <p className="text-xs text-muted-foreground">
              Entregaram {delivered} de {lines.length}.
            </p>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar entregas">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={filter === item.key}
                onClick={() => setFilter(item.key)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs transition-colors",
                  filter === item.key
                    ? "bg-primary-soft text-primary-strong"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {item.label}
                <span className="ml-1 tabular-nums opacity-70">
                  {lines.filter(item.test).length}
                </span>
              </button>
            ))}
          </div>
        </div>
        <ul aria-label="Entregas da turma" className="divide-y rounded-xl border bg-card text-xs">
          {shown.length ? (
            shown.map((line) => (
              <SubmissionLine
                key={line.enrollmentId}
                taskId={taskId}
                line={line}
                assessment={data.assessment}
                queryKey={queryKey}
              />
            ))
          ) : (
            <li className="px-3 py-6 text-center text-muted-foreground">
              Nenhum aluno neste filtro.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function WorkStats({ summary }: { summary: WorkSummary }) {
  const tiles = [
    {
      icon: Inbox,
      tone: "primary" as const,
      label: "Entregaram",
      value: `${summary.delivered}/${summary.total}`,
    },
    {
      icon: Hourglass,
      tone: "info" as const,
      label: "Por devolver",
      value: String(summary.delivered - summary.returned),
    },
    {
      icon: AlarmClock,
      tone: "warning" as const,
      label: "Com atraso",
      value: String(summary.late),
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <IconChip icon={tile.icon} tone={tile.tone} size="sm" />
          <div className="min-w-0">
            <p className="text-base font-semibold tabular-nums leading-tight">{tile.value}</p>
            <p className="text-[11px] text-muted-foreground">{tile.label}</p>
          </div>
        </div>
      ))}
      <div className="space-y-2 rounded-xl border bg-card p-3">
        <div className="flex items-center gap-3">
          <IconChip icon={Star} tone="success" size="sm" />
          <div>
            <p
              className={cn(
                "text-base font-semibold tabular-nums leading-tight",
                gradeToneClass(summary.average),
              )}
            >
              {summary.average == null ? "—" : summary.average.toFixed(1)}
            </p>
            <p className="text-[11px] text-muted-foreground">Média devolvida</p>
          </div>
        </div>
        <GradeMeter value={summary.average} label="Média das entregas devolvidas, de 0 a 20" />
      </div>
    </div>
  );
}

/** Título, tipo, prazo, atrasos, a avaliação da pauta e arquivar/reabrir. */
function TaskSettings({
  taskId,
  data,
  queryKey,
}: {
  taskId: string;
  data: Listed;
  queryKey: unknown[];
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => formOf(data));
  const save = useMutation({
    mutationFn: (values: ReturnType<typeof formOf> & { archived: boolean }) =>
      updateTaskSettings({
        data: {
          taskId,
          title: values.title,
          kind: values.kind,
          description: values.description.trim() || null,
          dueOn: values.dueOn || null,
          acceptsLate: values.acceptsLate,
          archived: values.archived,
        },
      }),
    onSuccess: (_result, values) => {
      toast.success(
        values.archived === data.archived
          ? "Trabalho actualizado."
          : values.archived
            ? "Trabalho arquivado: já não recebe entregas."
            : "Trabalho reaberto.",
      );
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível guardar.")),
  });
  const facts = [
    TASK_KIND_LABELS[data.kind] ?? "Tarefa",
    `prazo ${dueLabel(data.dueOn)}`,
    data.acceptsLate ? "aceita atrasos" : "sem atrasos",
  ];

  return (
    <section
      aria-labelledby={`config-${taskId}`}
      className="space-y-4 rounded-xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconChip icon={Settings2} tone="muted" size="sm" />
          <div className="min-w-0">
            <h2 id={`config-${taskId}`} className="text-sm font-semibold">
              Configuração do trabalho
              {data.archived ? (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Arquivado
                </span>
              ) : null}
            </h2>
            <p className="text-xs text-muted-foreground">{facts.join(" · ")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!editing ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => {
                setForm(formOf(data));
                setEditing(true);
              }}
            >
              <Pencil className="size-3.5" aria-hidden /> Editar
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5"
            disabled={save.isPending}
            onClick={() => save.mutate({ ...formOf(data), archived: !data.archived })}
          >
            {data.archived ? (
              <>
                <ArchiveRestore className="size-3.5" aria-hidden /> Reabrir
              </>
            ) : (
              <>
                <Archive className="size-3.5" aria-hidden /> Arquivar
              </>
            )}
          </Button>
        </div>
      </div>

      {editing ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (form.title.trim().length >= 2) save.mutate({ ...form, archived: data.archived });
          }}
        >
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`task-title-${taskId}`}>Título</Label>
            <Input
              id={`task-title-${taskId}`}
              maxLength={160}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`task-kind-${taskId}`}>Tipo</Label>
            <select
              id={`task-kind-${taskId}`}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.kind}
              onChange={(event) =>
                setForm({ ...form, kind: event.target.value as (typeof TASK_KINDS)[number] })
              }
            >
              {TASK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {TASK_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`task-due-${taskId}`}>Prazo</Label>
            <Input
              id={`task-due-${taskId}`}
              type="date"
              value={form.dueOn}
              onChange={(event) => setForm({ ...form, dueOn: event.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`task-desc-${taskId}`}>Descrição</Label>
            <Textarea
              id={`task-desc-${taskId}`}
              rows={3}
              maxLength={2000}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch
              id={`task-late-${taskId}`}
              checked={form.acceptsLate}
              onCheckedChange={(checked) => setForm({ ...form, acceptsLate: checked })}
            />
            <Label htmlFor={`task-late-${taskId}`} className="font-normal">
              Aceitar entregas depois do prazo (ficam marcadas como atrasadas)
            </Label>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={save.isPending}>
              Guardar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      <AssessmentLink
        taskId={taskId}
        current={data.assessment}
        options={data.assessmentOptions ?? []}
        // Devolvidas com nota que a pauta ainda não tem (ou tem outra).
        pending={
          (data.lines ?? []).filter(
            (line) =>
              line.submission?.status === "returned" &&
              line.submission.grade != null &&
              // Nota 0 sem nota na pauta: Number(null) é 0 e contava como lançada.
              (line.pautaScore == null ||
                Number(line.pautaScore) !== Number(line.submission.grade)),
          ).length
        }
        queryKey={queryKey}
      />
    </section>
  );
}

function formOf(data: Listed) {
  return {
    title: data.title,
    kind: (TASK_KINDS as readonly string[]).includes(data.kind)
      ? (data.kind as (typeof TASK_KINDS)[number])
      : ("outra" as const),
    description: data.description ?? "",
    dueOn: data.dueOn ?? "",
    acceptsLate: data.acceptsLate,
  };
}

const termLabel = (option: TaskAssessmentOption) =>
  `${option.name} · ${option.term}.º trimestre${option.maxScore != null ? ` · ${option.maxScore} valores` : ""}`;

/** A que avaliação da pauta conta esta tarefa: a nota devolvida passa a lá ficar. */
function AssessmentLink({
  taskId,
  current,
  options,
  pending,
  queryKey,
}: {
  taskId: string;
  current: TaskAssessmentOption | null;
  options: TaskAssessmentOption[];
  pending: number;
  queryKey: unknown[];
}) {
  const queryClient = useQueryClient();
  const sync = useMutation({
    mutationFn: () => syncTaskGradesToPauta({ data: { taskId } }),
    onSuccess: (result) => {
      toast.success(
        result.saved === 1
          ? "1 nota lançada na pauta."
          : `${result.saved} notas lançadas na pauta.`,
      );
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível lançar na pauta.")),
  });
  const link = useMutation({
    mutationFn: (itemId: string | null) => linkTaskAssessment({ data: { taskId, itemId } }),
    onSuccess: (_result, itemId) => {
      toast.success(
        itemId
          ? "A nota devolvida passa a ir para a pauta."
          : "A tarefa deixou de contar para a pauta.",
      );
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível ligar à pauta.")),
  });
  return (
    <div className="space-y-1 border-t pt-4 text-xs">
      <label htmlFor={`task-assessment-${taskId}`} className="font-medium">
        Conta para a pauta
      </label>
      {options.length ? (
        <select
          id={`task-assessment-${taskId}`}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-md"
          value={current?.id ?? ""}
          disabled={link.isPending}
          onChange={(event) => link.mutate(event.target.value || null)}
        >
          <option value="">Não conta (só comentário e nota da tarefa)</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {termLabel(option)}
            </option>
          ))}
        </select>
      ) : (
        <p id={`task-assessment-${taskId}`} className="text-muted-foreground">
          Esta disciplina ainda não tem avaliações nesta turma. Crie-a em Avaliações para a nota
          contar.
        </p>
      )}
      {current ? (
        <p className="text-muted-foreground">
          A nota de cada entrega devolvida fica em «{current.name}», com as regras da pauta.
        </p>
      ) : null}
      {current && pending > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-1 h-8 gap-1.5 text-xs"
          disabled={sync.isPending}
          onClick={() => sync.mutate()}
        >
          <Star className="size-3.5" aria-hidden />
          {pending === 1
            ? "Lançar na pauta a nota já devolvida"
            : `Lançar na pauta as ${pending} notas já devolvidas`}
        </Button>
      ) : null}
    </div>
  );
}

function attemptLine(sub: SubmissionRow) {
  return [
    `${sub.attempt}.ª tentativa`,
    when(sub.submitted_at),
    sub.on_paper ? "em papel" : null,
    sub.is_late ? "com atraso" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function SubmissionLine({
  taskId,
  line,
  assessment,
  queryKey,
}: {
  taskId: string;
  line: TaskSubmissionLine;
  assessment: TaskAssessmentOption | null;
  queryKey: unknown[];
}) {
  const queryClient = useQueryClient();
  const [grading, setGrading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const paperPhoto = useRef<HTMLInputElement>(null);
  const [grade, setGrade] = useState("");
  const [feedback, setFeedback] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const paper = useMutation({
    mutationFn: (photo?: PreparedAttachment) =>
      recordPaperSubmission({
        data: {
          taskId,
          enrollmentId: line.enrollmentId,
          ...(photo
            ? {
                attachment: {
                  name: photo.name,
                  contentType: photo.contentType,
                  base64: photo.base64,
                },
              }
            : {}),
        },
      }),
    onSuccess: (_result, photo) => {
      toast.success(
        photo ? "Entrega em papel registada, com a foto." : "Entrega em papel registada.",
      );
      void refresh();
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível registar.")),
  });
  const giveBack = useMutation({
    mutationFn: () =>
      returnTaskSubmission({
        data: {
          taskId,
          submissionId: line.submission!.id,
          ...(grade.trim() ? { grade: Number(grade.replace(",", ".")) } : {}),
          ...(feedback.trim() ? { feedback } : {}),
        },
      }),
    onSuccess: (result) => {
      toast.success(
        result.pauta ? "Entrega devolvida e nota lançada na pauta." : "Entrega devolvida ao aluno.",
      );
      setGrading(false);
      void refresh();
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível devolver.")),
  });

  const sub = line.submission;
  const history = line.history ?? [];
  const detail = !sub
    ? "Ainda não entregou."
    : [
        `Entregue ${when(sub.submitted_at)}${sub.on_paper ? " (papel)" : ""}`,
        line.attempts > 1 ? `${line.attempts}.ª tentativa` : null,
        sub.is_late ? "com atraso" : null,
        assessment && line.pautaScore != null ? `na pauta: ${line.pautaScore}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
        >
          {initials(line.studentName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{line.studentName}</p>
          <p className="text-muted-foreground">{detail}</p>
        </div>
        {sub?.status === "returned" && sub.grade != null ? (
          <span className={cn("text-sm font-semibold tabular-nums", gradeToneClass(sub.grade))}>
            {sub.grade}
          </span>
        ) : null}
        <StatePill
          state={!sub ? "open" : sub.status === "returned" ? "returned" : "submitted"}
          label={!sub ? "Por entregar" : sub.status === "returned" ? "Devolvida" : "Por devolver"}
        />
      </div>
      {sub?.body ? (
        <p className="whitespace-pre-line rounded-lg bg-muted/40 px-3 py-2 text-muted-foreground">
          {sub.body}
        </p>
      ) : null}
      {sub?.file ? (
        <div className="pl-11">
          <AttachmentLink taskId={taskId} submissionId={sub.id} file={sub.file} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1 pl-11">
        {!sub ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={paper.isPending}
            onClick={() => paper.mutate(undefined)}
          >
            Entregou em papel
          </Button>
        ) : null}
        {!sub ? (
          <>
            <input
              ref={paperPhoto}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-label={`Foto do trabalho em papel de ${line.studentName}`}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setPreparingPhoto(true);
                try {
                  paper.mutate(await prepareAttachment(file));
                } catch (error) {
                  toast.error(publicErrorMessage(error, "Não foi possível usar este ficheiro."));
                } finally {
                  setPreparingPhoto(false);
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              disabled={paper.isPending || preparingPhoto}
              onClick={() => paperPhoto.current?.click()}
            >
              <Camera className="size-3.5" aria-hidden />
              {preparingPhoto ? "A preparar…" : "Papel com foto"}
            </Button>
          </>
        ) : null}
        {sub?.status === "submitted" && !grading ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setGrading(true)}
          >
            Devolver
          </Button>
        ) : null}
        {history.length > 1 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((open) => !open)}
          >
            <History className="size-3.5" aria-hidden />
            {showHistory ? "Esconder tentativas" : `Ver as ${history.length} tentativas`}
          </Button>
        ) : null}
      </div>
      {grading ? (
        <div className="flex flex-wrap items-end gap-2 pl-11">
          <Input
            aria-label={`Nota de ${line.studentName}`}
            inputMode="decimal"
            placeholder={`0–${assessment?.maxScore ?? 20}`}
            className="h-8 w-20"
            value={grade}
            onChange={(event) => setGrade(event.target.value)}
          />
          <Input
            aria-label={`Comentário para ${line.studentName}`}
            placeholder="Comentário (opcional)"
            className="h-8 min-w-[12rem] flex-1"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={giveBack.isPending}
            onClick={() => giveBack.mutate()}
          >
            Devolver
          </Button>
        </div>
      ) : null}
      {showHistory ? (
        <ol
          aria-label={`Tentativas de ${line.studentName}`}
          className="ml-11 space-y-2 border-l pl-3"
        >
          {history.map((attempt) => (
            <li key={attempt.id} className="space-y-0.5">
              <p className="text-muted-foreground">
                {attemptLine(attempt)}
                {attempt.status === "returned" ? " · devolvida" : ""}
              </p>
              {attempt.body ? <p className="whitespace-pre-line">{attempt.body}</p> : null}
              {attempt.file ? (
                <AttachmentLink taskId={taskId} submissionId={attempt.id} file={attempt.file} />
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

/** Aluno (entrega) ou encarregado (acompanha): a entrega do aluno nesta tarefa. */
export function MyTaskSubmission({
  taskId,
  studentId,
}: {
  taskId: string;
  studentId?: string | null;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["my-task-submission", taskId, studentId ?? "self"];
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<PreparedAttachment | null>(null);
  const [preparing, setPreparing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const query = useQuery({
    queryKey,
    queryFn: () => getMyTaskSubmission({ data: { taskId, ...(studentId ? { studentId } : {}) } }),
    retry: false,
  });
  const submit = useMutation({
    mutationFn: () =>
      submitTaskWork({
        data: {
          taskId,
          ...(body.trim() ? { body } : {}),
          ...(attachment
            ? {
                attachment: {
                  name: attachment.name,
                  contentType: attachment.contentType,
                  base64: attachment.base64,
                },
              }
            : {}),
        },
      }),
    onSuccess: (result) => {
      toast.success(result.late ? "Trabalho entregue, com atraso." : "Trabalho entregue.");
      setBody("");
      setAttachment(null);
      void queryClient.invalidateQueries({ queryKey });
      // A página da disciplina mostra o mesmo trabalho: actualizá-la também.
      void queryClient.invalidateQueries({ queryKey: ["subject-work"] });
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível entregar.")),
  });
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    try {
      setAttachment(await prepareAttachment(file));
    } catch (error) {
      toast.error(publicErrorMessage(error, "Não foi possível usar este ficheiro."));
    } finally {
      setPreparing(false);
    }
  };
  // Sem acesso a esta tarefa (ex.: pessoal sem a disciplina): não há nada a mostrar.
  if (!query.data) return null;
  const { submission, canSubmit } = query.data;
  const returned = submission?.status === "returned";
  const ready = Boolean(body.trim() || attachment);

  return (
    <div className="mt-2 space-y-2 text-xs">
      {submission ? (
        <p className="text-muted-foreground">
          {returned
            ? `Devolvido${submission.grade != null ? ` · ${submission.grade} valores` : ""}`
            : `Entregue ${when(submission.submittedAt)}${submission.onPaper ? " em papel" : ""}${
                submission.isLate ? " · com atraso" : ""
              }`}
        </p>
      ) : (
        <p className="text-muted-foreground">Ainda não entregue.</p>
      )}
      {submission?.file ? (
        <AttachmentLink taskId={taskId} submissionId={submission.id} file={submission.file} />
      ) : null}
      {returned && submission?.feedback ? (
        <p className="whitespace-pre-line">Comentário do professor: {submission.feedback}</p>
      ) : null}
      {canSubmit && !returned ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) submit.mutate();
          }}
        >
          <Textarea
            aria-label="O meu trabalho"
            rows={3}
            maxLength={4000}
            placeholder="Escreva aqui a resposta, ou anexe a foto do caderno ou um PDF."
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-label="Anexar foto ou PDF"
            onChange={(event) => {
              void pick(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            // Os botões visíveis («Anexar», «Tirar foto») accionam estes campos.
            tabIndex={-1}
            aria-label="Tirar foto do trabalho"
            onChange={(event) => {
              void pick(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {attachment ? (
            <div className="flex max-w-full items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5">
              <Paperclip className="size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 truncate font-medium">{attachment.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatBytes(attachment.sizeBytes)}
              </span>
              <button
                type="button"
                className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Retirar anexo"
                onClick={() => setAttachment(null)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              disabled={preparing}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip className="size-3.5" aria-hidden />
              {preparing ? "A preparar…" : attachment ? "Trocar anexo" : "Anexar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              disabled={preparing}
              onClick={() => cameraInput.current?.click()}
            >
              <Camera className="size-3.5" aria-hidden /> Tirar foto
            </Button>
            <Button
              type="submit"
              size="sm"
              className="ml-auto h-8"
              disabled={!ready || preparing || submit.isPending}
            >
              {submit.isPending ? "A enviar…" : submission ? "Reenviar" : "Entregar"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">PDF ou foto, até 5 MB.</p>
        </form>
      ) : null}
    </div>
  );
}
