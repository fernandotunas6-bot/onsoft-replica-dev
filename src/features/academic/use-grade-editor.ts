import { useEffect, useMemo, useRef, useState } from "react";
import { mergeReloadedValues } from "@/features/academic/assessment-views";

/** Valores da grelha por aluno (`enrollmentId`) e por campo (`mac`, `npp`, `npt` ou id do item). */
export type GradeValues = Record<string, Record<string, string>>;

type TermGrade = {
  enrollment_id: string;
  subject_id: string;
  term: number;
  mac: number | null;
  npp: number | null;
  npt: number | null;
};

type AssessmentItemRef = { id: unknown };
type AssessmentScoreRef = { item_id: unknown; enrollment_id: unknown; score: unknown };

export function cellKey(enrollmentId: string, field: string) {
  return `${enrollmentId}:${field}`;
}

/** Até onde vai o "desfazer". */
const HISTORY_LIMIT = 30;

/**
 * Estado da edição de notas do Centro de Avaliação: valores, histórico
 * (desfazer/refazer), recarregamento do servidor e células alteradas.
 *
 * Com o mesmo contexto (turma, disciplina, trimestre), um recarregamento não
 * apaga o que o professor escreveu — por exemplo, quando a lista de avaliações
 * chega depois das notas. Mudar de contexto recarrega tudo e limpa o histórico.
 */
export function useGradeEditor({
  open,
  roster,
  termGrades,
  items,
  scores,
  classGroupId,
  subjectId,
  term,
}: {
  open: boolean;
  roster: ReadonlyArray<{ id: string }>;
  termGrades: ReadonlyArray<TermGrade>;
  items: ReadonlyArray<AssessmentItemRef>;
  scores: ReadonlyArray<AssessmentScoreRef>;
  classGroupId: string | undefined;
  subjectId: string | undefined;
  term: number;
}) {
  const [values, setValues] = useState<GradeValues>({});
  const [history, setHistory] = useState<GradeValues[]>([]);
  const [future, setFuture] = useState<GradeValues[]>([]);

  // O que está gravado no servidor para o contexto actual.
  const loaded = useMemo(() => {
    const next: GradeValues = {};
    for (const student of roster) {
      const grade = termGrades.find(
        (row) =>
          row.enrollment_id === student.id && row.subject_id === subjectId && row.term === term,
      );
      const row: Record<string, string> = {
        mac: grade?.mac != null ? String(grade.mac) : "",
        npp: grade?.npp != null ? String(grade.npp) : "",
        npt: grade?.npt != null ? String(grade.npt) : "",
      };
      for (const item of items) {
        const score = scores.find(
          (entry) =>
            String(entry.item_id) === String(item.id) && String(entry.enrollment_id) === student.id,
        );
        row[String(item.id)] = score?.score == null ? "" : String(score.score);
      }
      next[student.id] = row;
    }
    return next;
  }, [items, roster, scores, subjectId, term, termGrades]);

  const lastLoadRef = useRef<{ context: string; values: GradeValues } | null>(null);

  useEffect(() => {
    if (!open) {
      lastLoadRef.current = null;
      return;
    }
    const context = `${classGroupId ?? ""}|${subjectId ?? ""}|${term}`;
    const previous = lastLoadRef.current;
    lastLoadRef.current = { context, values: loaded };
    if (previous?.context === context) {
      setValues((current) => mergeReloadedValues(loaded, current, previous.values));
      return;
    }
    setValues(loaded);
    setHistory([]);
    setFuture([]);
  }, [classGroupId, loaded, open, subjectId, term]);

  const pushHistory = (snapshot: GradeValues) => {
    setHistory((current) => [...current.slice(-(HISTORY_LIMIT - 1)), snapshot]);
    setFuture([]);
  };

  const updateCell = (enrollmentId: string, key: string, value: string) => {
    setValues((current) => {
      pushHistory(current);
      return {
        ...current,
        [enrollmentId]: { ...(current[enrollmentId] ?? {}), [key]: value },
      };
    });
  };

  const undo = () => {
    setHistory((current) => {
      const previous = current[current.length - 1];
      if (!previous) return current;
      setFuture((next) => [values, ...next]);
      setValues(previous);
      return current.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((current) => {
      const [next, ...rest] = current;
      if (!next) return current;
      setHistory((historyRows) => [...historyRows, values]);
      setValues(next);
      return rest;
    });
  };

  // Células que diferem do que está gravado (pintadas na grelha, contadas no "Guardar").
  const dirtyKeys = useMemo(() => {
    const dirty = new Set<string>();
    for (const student of roster) {
      const row = values[student.id] ?? {};
      const saved = loaded[student.id] ?? {};
      for (const key of ["mac", "npp", "npt", ...items.map((item) => String(item.id))]) {
        if ((row[key] ?? "") !== (saved[key] ?? "")) dirty.add(cellKey(student.id, key));
      }
    }
    return dirty;
  }, [items, loaded, roster, values]);

  return {
    values,
    setValues,
    history,
    future,
    pushHistory,
    updateCell,
    undo,
    redo,
    dirtyKeys,
  };
}
