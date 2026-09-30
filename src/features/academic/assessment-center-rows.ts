import {
  continuousComponent,
  recoveryResult,
  termAverageByRule,
} from "@/features/academic/assessment-model";
import type { ActiveAssessmentEngine } from "@/features/academic/assessment-models";
import type { WorkMode } from "@/features/academic/assessment-center-config";
import { cellKey, type GradeValues } from "@/features/academic/use-grade-editor";
import {
  annualAverage,
  parsePautaScore,
  recursoFinal,
  scoreAverage,
  situacaoPauta,
} from "@/lib/angola-academic";

/**
 * Cálculo das linhas do Centro de Avaliação (`AssessmentCenter.tsx`): notas
 * escritas → MAC/NPP/NPT, média, recurso, exame, nota final e situação.
 * Sem React, para se poder testar e para o componente ficar só com estado e
 * apresentação.
 */

/** Nota depois do recurso: método do modelo activo, ou média sem modelo. */
export function recoveryCombiner(engine: ActiveAssessmentEngine | null) {
  return (original: number | null, recovery: number | null) =>
    engine
      ? recoveryResult(original, recovery, engine.calculation.recoveryMethod)
      : recursoFinal(original, recovery);
}

export type AssessmentItemLike = {
  id: unknown;
  component?: unknown;
  counts_toward_pauta?: unknown;
};

export type AssessmentSituacao = ReturnType<typeof situacaoPauta>;

export type AssessmentComputedRow<S> = {
  student: S;
  mac: number | null;
  npp: number | null;
  npt: number | null;
  average: number | null;
  recurso: number | null;
  exame: number | null;
  finalScore: number | null;
  situacao: AssessmentSituacao | { label: "Pendente"; tone: "muted" };
  row: Record<string, string>;
};

/** Leitura de uma célula na escala do modelo activo (0–20 sem modelo). */
export function scoreParser(engine: ActiveAssessmentEngine | null) {
  return (value: string) => parsePautaScore(value, engine?.scale);
}

/**
 * Itens agrupados por componente. São dois mapas: MAC/NPP/NPT só contam itens
 * com `counts_toward_pauta`, recurso e exame contam todos.
 *
 * Agrupar uma vez evita cinco `items.filter(...)` por aluno a cada tecla.
 */
export function groupItemsByComponent<I extends AssessmentItemLike>(items: ReadonlyArray<I>) {
  const contam = new Map<string, I[]>();
  const todos = new Map<string, I[]>();
  for (const item of items) {
    const componente = String(item.component ?? "");
    if (!todos.has(componente)) todos.set(componente, []);
    todos.get(componente)!.push(item);
    if (item.counts_toward_pauta) {
      if (!contam.has(componente)) contam.set(componente, []);
      contam.get(componente)!.push(item);
    }
  }
  return { contam, todos };
}

export type ItemsByComponent<I> = { contam: Map<string, I[]>; todos: Map<string, I[]> };

const isScore = (value: number | null): value is number => value != null && !Number.isNaN(value);

/**
 * Uma linha por aluno. MAC/NPP/NPT escritos à mão prevalecem sobre a média dos
 * itens; a média do trimestre segue os pesos e o arredondamento do modelo
 * (Decreto 424/25 sem modelo); o exame substitui a nota, o recurso combina-se
 * pelo método do modelo.
 */
export function computeAssessmentRows<S extends { id: string }, I extends AssessmentItemLike>({
  roster,
  values,
  itemsByComponent,
  engine,
  passingGrade,
}: {
  roster: ReadonlyArray<S>;
  values: GradeValues;
  itemsByComponent: ItemsByComponent<I>;
  engine: ActiveAssessmentEngine | null;
  passingGrade: number;
}): AssessmentComputedRow<S>[] {
  const parseScore = scoreParser(engine);
  const notasDe = (mapa: Map<string, I[]>, componente: string, row: Record<string, string>) =>
    (mapa.get(componente) ?? []).map((item) => parseScore(row[String(item.id)] ?? ""));
  const afterRecovery = recoveryCombiner(engine);

  return roster.map((student) => {
    const row = values[student.id] ?? {};
    const componente = (key: "mac" | "npp" | "npt", component: string) =>
      parseScore(row[key] ?? "") ??
      annualAverage(notasDe(itemsByComponent.contam, component, row).filter(isScore));
    const mac = componente("mac", "MAC");
    const npp = componente("npp", "NPP");
    const npt = componente("npt", "NPT");
    const average =
      mac != null && npp != null && npt != null
        ? engine
          ? termAverageByRule(
              continuousComponent(mac, npp, engine.calculation.nppMode),
              npt,
              engine,
              engine.scale.decimalPlaces,
            )
          : scoreAverage(mac, npp, npt)
        : null;
    const recurso = annualAverage(notasDe(itemsByComponent.todos, "recurso", row).filter(isScore));
    const exame = annualAverage(notasDe(itemsByComponent.todos, "exame", row).filter(isScore));
    const finalScore = exame ?? afterRecovery(average, recurso);
    const situacao =
      finalScore == null
        ? { label: "Pendente" as const, tone: "muted" as const }
        : situacaoPauta(finalScore, passingGrade);
    return { student, mac, npp, npt, average, recurso, exame, finalScore, situacao, row };
  });
}

/**
 * Linhas visíveis: em "Revisão", as que estão por completar ou foram alteradas;
 * nos outros modos, o filtro de situação.
 */
export function filterAssessmentRows<S extends { id: string }>(
  rows: ReadonlyArray<AssessmentComputedRow<S>>,
  {
    mode,
    situacao,
    dirtyKeys,
    passingGrade,
  }: { mode: WorkMode; situacao: string; dirtyKeys: ReadonlySet<string>; passingGrade: number },
) {
  return rows.filter((entry) => {
    if (mode === "revisao") {
      const dirty = ["mac", "npp", "npt"].some((key) =>
        dirtyKeys.has(cellKey(entry.student.id, key)),
      );
      return entry.average == null || dirty;
    }
    if (situacao === "todos") return true;
    if (situacao === "pendente") return entry.average == null;
    if (situacao === "completo") return entry.average != null;
    if (situacao === "transita") return entry.situacao.label === "Transita";
    if (situacao === "nao_transita") return entry.situacao.label === "Não transita";
    if (situacao === "em_recurso") return entry.recurso != null;
    if (situacao === "aprovado") return (entry.exame ?? entry.finalScore ?? 0) >= passingGrade;
    if (situacao === "reprovado")
      return entry.finalScore != null && entry.finalScore < passingGrade;
    return true;
  });
}

/** Células MAC/NPP/NPT preenchidas com algo que não é nota válida na escala. */
export function countInvalidCells(
  rows: ReadonlyArray<{ row: Record<string, string> }>,
  parseScore: (value: string) => number | null,
) {
  return rows.reduce(
    (count, entry) =>
      count +
      ["mac", "npp", "npt"].filter((key) => {
        const value = entry.row[key] ?? "";
        return value.trim() !== "" && Number.isNaN(parseScore(value));
      }).length,
    0,
  );
}
