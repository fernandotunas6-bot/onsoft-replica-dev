import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normaliseAlumniSurveyQuestions } from "./survey-schema";

export function AlumniSurveyForm({
  schema,
  onSubmit,
  submitting = false,
}: {
  schema: unknown;
  onSubmit: (response: Record<string, unknown>) => Promise<unknown>;
  submitting?: boolean;
}) {
  const questions = useMemo(() => normaliseAlumniSurveyQuestions(schema), [schema]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);

  const canSubmit =
    questions.length > 0 &&
    questions.every((question) => {
      if (!question.required) return true;
      const value = values[question.id];
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "boolean") return true;
      return value !== undefined && value !== null && String(value).trim().length > 0;
    });

  if (!questions.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta pesquisa ainda não tem perguntas configuradas.
      </p>
    );
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-border/70 bg-muted/40 p-4 text-sm font-medium">
        Resposta enviada com sucesso. Obrigado por ajudar a escola a acompanhar os seus Alumni.
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSubmit || submitting) return;
        await onSubmit(values);
        setSubmitted(true);
      }}
    >
      {questions.map((question) => (
        <div key={question.id} className="space-y-2">
          <label className="text-sm font-semibold" htmlFor={`alumni-survey-${question.id}`}>
            {question.label}
            {question.required ? <span className="ml-1 text-destructive">*</span> : null}
          </label>
          {question.helpText ? (
            <p className="text-xs text-muted-foreground">{question.helpText}</p>
          ) : null}
          {question.type === "textarea" ? (
            <textarea
              id={`alumni-survey-${question.id}`}
              className="min-h-28 w-full rounded-xl border border-input bg-background p-3 text-sm"
              required={question.required}
              value={String(values[question.id] ?? "")}
              onChange={(event) =>
                setValues((current) => ({ ...current, [question.id]: event.target.value }))
              }
            />
          ) : question.type === "select" ? (
            <select
              id={`alumni-survey-${question.id}`}
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              required={question.required}
              value={String(values[question.id] ?? "")}
              onChange={(event) =>
                setValues((current) => ({ ...current, [question.id]: event.target.value }))
              }
            >
              <option value="">Seleccionar…</option>
              {(question.options ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : question.type === "multiselect" ? (
            <div className="flex flex-wrap gap-2" id={`alumni-survey-${question.id}`}>
              {(question.options ?? []).map((option) => {
                const selected =
                  Array.isArray(values[question.id]) &&
                  (values[question.id] as unknown[]).includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                    onClick={() =>
                      setValues((current) => {
                        const existing = Array.isArray(current[question.id])
                          ? (current[question.id] as string[])
                          : [];
                        return {
                          ...current,
                          [question.id]: selected
                            ? existing.filter((value) => value !== option)
                            : [...existing, option],
                        };
                      })
                    }
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          ) : question.type === "boolean" ? (
            <label className="flex items-center gap-3 rounded-xl border border-border/70 p-3 text-sm">
              <input
                id={`alumni-survey-${question.id}`}
                type="checkbox"
                checked={Boolean(values[question.id])}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [question.id]: event.target.checked }))
                }
              />
              <span>Sim</span>
            </label>
          ) : (
            <Input
              id={`alumni-survey-${question.id}`}
              type={
                question.type === "number" ? "number" : question.type === "date" ? "date" : "text"
              }
              className="rounded-xl"
              required={question.required}
              value={String(values[question.id] ?? "")}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [question.id]:
                    question.type === "number"
                      ? event.target.value === ""
                        ? ""
                        : Number(event.target.value)
                      : event.target.value,
                }))
              }
            />
          )}
        </div>
      ))}
      <Button type="submit" disabled={!canSubmit || submitting} className="rounded-xl">
        {submitting ? "A enviar…" : "Enviar respostas"}
      </Button>
    </form>
  );
}
