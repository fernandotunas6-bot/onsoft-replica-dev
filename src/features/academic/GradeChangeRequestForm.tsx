import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toastActionError } from "@/lib/action-error-toast";
import { GRADE_COMPONENTS, requestGradeChange } from "./grade-change-requests";

const selectClass = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";

/** Pedido de alteração de uma nota numa pauta oficial (vai para a coordenação). */
export function GradeChangeRequestForm({
  sheetId,
  enrollmentId,
  studentName,
  subjects,
  onDone,
}: {
  sheetId: string;
  enrollmentId: string;
  studentName: string;
  subjects: Array<{ subject: string; subjectId: string }>;
  onDone: () => void;
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.subjectId ?? "");
  const [component, setComponent] = useState<(typeof GRADE_COMPONENTS)[number]>("MAC");
  const [newScore, setNewScore] = useState("");
  const [reason, setReason] = useState("");
  const submit = useMutation({
    mutationFn: () =>
      requestGradeChange({
        data: {
          sheetId,
          enrollmentId,
          subjectId,
          component,
          newScore: Number(newScore.replace(",", ".")),
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("Pedido enviado à coordenação.");
      onDone();
    },
    onError: (error) => toastActionError(error, "Não foi possível enviar o pedido."),
  });
  const valid =
    subjectId &&
    reason.trim().length >= 5 &&
    /^\d{1,2}([.,]\d)?$/.test(newScore) &&
    Number(newScore.replace(",", ".")) <= 20;

  return (
    <form
      className="space-y-3 rounded-lg bg-muted/40 p-3"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (valid) submit.mutate();
      }}
    >
      <p className="text-sm">Pedir alteração · {studentName}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`gc-subject-${enrollmentId}`} className="text-xs">
            Disciplina
          </Label>
          <select
            id={`gc-subject-${enrollmentId}`}
            className={selectClass}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            {subjects.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                {s.subject}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`gc-component-${enrollmentId}`} className="text-xs">
            Componente
          </Label>
          <select
            id={`gc-component-${enrollmentId}`}
            className={selectClass}
            value={component}
            onChange={(e) => setComponent(e.target.value as (typeof GRADE_COMPONENTS)[number])}
          >
            {GRADE_COMPONENTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`gc-score-${enrollmentId}`} className="text-xs">
            Nova nota (0–20)
          </Label>
          <Input
            id={`gc-score-${enrollmentId}`}
            inputMode="decimal"
            value={newScore}
            onChange={(e) => setNewScore(e.target.value)}
            placeholder="ex.: 14"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`gc-reason-${enrollmentId}`} className="text-xs">
          Motivo (obrigatório; fica no histórico)
        </Label>
        <Textarea
          id={`gc-reason-${enrollmentId}`}
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!valid || submit.isPending}>
          {submit.isPending ? "A enviar…" : "Enviar pedido"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
