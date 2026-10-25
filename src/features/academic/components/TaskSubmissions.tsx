import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { publicErrorMessage } from "@/lib/public-error";
import {
  getMyTaskSubmission,
  listTaskSubmissions,
  recordPaperSubmission,
  returnTaskSubmission,
  submitTaskWork,
  type TaskSubmissionLine,
} from "@/features/academic/task-submissions-server";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-AO", { day: "2-digit", month: "short" }) : "";

/** Professor ou direcção: a turma inteira, quem entregou, devolver com nota. */
export function TaskSubmissionsPanel({ taskId }: { taskId: string }) {
  const queryKey = ["task-submissions", taskId];
  const query = useQuery({
    queryKey,
    queryFn: () => listTaskSubmissions({ data: { taskId } }),
    retry: false,
  });
  if (query.isLoading) return <p className="text-xs text-muted-foreground">A carregar…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {publicErrorMessage(query.error, "Não foi possível ler as entregas.")}
      </p>
    );
  }
  const lines = query.data?.lines ?? [];
  const delivered = lines.filter((line) => line.submission).length;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-muted-foreground">
        Entregaram {delivered} de {lines.length}.
      </p>
      <ul aria-label="Entregas da turma" className="divide-y rounded-md border text-xs">
        {lines.map((line) => (
          <SubmissionLine key={line.enrollmentId} taskId={taskId} line={line} queryKey={queryKey} />
        ))}
      </ul>
    </div>
  );
}

function SubmissionLine({
  taskId,
  line,
  queryKey,
}: {
  taskId: string;
  line: TaskSubmissionLine;
  queryKey: unknown[];
}) {
  const queryClient = useQueryClient();
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState("");
  const [feedback, setFeedback] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const paper = useMutation({
    mutationFn: () => recordPaperSubmission({ data: { taskId, enrollmentId: line.enrollmentId } }),
    onSuccess: () => {
      toast.success("Entrega em papel registada.");
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
    onSuccess: () => {
      toast.success("Entrega devolvida ao aluno.");
      setGrading(false);
      void refresh();
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível devolver.")),
  });

  const sub = line.submission;
  const state = !sub
    ? "Por entregar"
    : sub.status === "returned"
      ? `Devolvida${sub.grade != null ? ` · ${sub.grade} valores` : ""}`
      : `Entregue ${when(sub.submitted_at)}${sub.on_paper ? " (papel)" : ""}${
          line.attempts > 1 ? ` · ${line.attempts}.ª tentativa` : ""
        }`;

  return (
    <li className="space-y-1 px-2 py-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{line.studentName}</span>
        <span className="text-muted-foreground">
          {state}
          {sub?.is_late ? <span className="ml-1 text-warning">· com atraso</span> : null}
        </span>
      </div>
      {sub?.body ? <p className="whitespace-pre-line text-muted-foreground">{sub.body}</p> : null}
      <div className="flex gap-2">
        {!sub ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={paper.isPending}
            onClick={() => paper.mutate()}
          >
            Entregou em papel
          </Button>
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
      </div>
      {grading ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            aria-label={`Nota de ${line.studentName}`}
            inputMode="decimal"
            placeholder="0–20"
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
  const query = useQuery({
    queryKey,
    queryFn: () => getMyTaskSubmission({ data: { taskId, ...(studentId ? { studentId } : {}) } }),
    retry: false,
  });
  const submit = useMutation({
    mutationFn: () => submitTaskWork({ data: { taskId, body } }),
    onSuccess: (result) => {
      toast.success(result.late ? "Trabalho entregue, com atraso." : "Trabalho entregue.");
      setBody("");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível entregar.")),
  });
  // Sem acesso a esta tarefa (ex.: pessoal sem a disciplina): não há nada a mostrar.
  if (!query.data) return null;
  const { submission, canSubmit } = query.data;
  const returned = submission?.status === "returned";

  return (
    <div className="mt-2 space-y-1 text-xs">
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
      {returned && submission?.feedback ? (
        <p className="whitespace-pre-line">Comentário do professor: {submission.feedback}</p>
      ) : null}
      {canSubmit && !returned ? (
        <form
          className="space-y-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (body.trim()) submit.mutate();
          }}
        >
          <Textarea
            aria-label="O meu trabalho"
            rows={3}
            maxLength={4000}
            placeholder="Escreva aqui a resposta ou o resumo do trabalho."
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            className="h-8"
            disabled={!body.trim() || submit.isPending}
          >
            {submission ? "Reenviar" : "Entregar"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
