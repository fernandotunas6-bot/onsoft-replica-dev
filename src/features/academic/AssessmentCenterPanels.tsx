import { Button } from "@/components/ui/button";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { formatScore, pautaSituations } from "@/lib/angola-academic";
import type {
  ClassGroupOption,
  SubjectOption,
  filterDefaults,
} from "@/features/academic/assessment-center-config";

/** Painéis que abrem por baixo da barra do Centro de Avaliação. */

export type AssessmentDocType = "pauta" | "boletim" | "mapa" | "relacao" | "acta" | "validacao";

type FilterName = keyof typeof filterDefaults;

export function AssessmentFiltersPanel({
  filters,
  setFilter,
  resetFilters,
  activeCount,
  classes,
  courses,
  classGroups,
  subjects,
  periodNoun,
  periodOptions,
}: {
  filters: Record<string, string>;
  setFilter: (name: FilterName, value: string) => void;
  resetFilters: () => void;
  activeCount: number;
  classes: ReadonlyArray<unknown>;
  courses: ReadonlyArray<unknown>;
  classGroups: ReadonlyArray<Pick<ClassGroupOption, "id" | "name">>;
  subjects: ReadonlyArray<Pick<SubjectOption, "id" | "name">>;
  periodNoun: string;
  periodOptions: ReadonlyArray<number>;
}) {
  return (
    <div className="border-b px-5 py-3">
      <ListFilterBar
        values={filters}
        onChange={(name, value) => setFilter(name as FilterName, value)}
        onReset={resetFilters}
        activeCount={activeCount}
        fields={[
          { name: "q", type: "search", placeholder: "Nome, nº ou processo…" },
          {
            name: "classe",
            label: "Classe",
            type: "select",
            options: [
              { value: "todas", label: "Todas" },
              ...classes.map((item) => ({ value: String(item), label: String(item) })),
            ],
          },
          {
            name: "curso",
            label: "Curso",
            type: "select",
            options: [
              { value: "todos", label: "Todos" },
              ...courses.map((item) => ({ value: String(item), label: String(item) })),
            ],
          },
          {
            name: "turma",
            label: "Turma",
            type: "select",
            options: [
              { value: "todas", label: "Todas" },
              ...classGroups.map((group) => ({ value: group.id, label: group.name })),
            ],
          },
          {
            name: "disciplina",
            label: "Disciplina",
            type: "select",
            options: [
              { value: "todas", label: "Todas" },
              ...subjects.map((subject) => ({ value: subject.id, label: subject.name })),
            ],
          },
          {
            name: "trimestre",
            label: periodNoun,
            type: "select",
            options: periodOptions.map((p) => ({ value: String(p), label: `${p}º` })),
          },
          {
            name: "situacao",
            label: "Situação",
            type: "select",
            options: pautaSituations.map((item) => ({ value: item.id, label: item.label })),
          },
        ]}
      />
    </div>
  );
}

export function AssessmentDocumentsPanel({
  contextKind,
  hasSelectedStudent,
  exportDocument,
}: {
  contextKind: string;
  hasSelectedStudent: boolean;
  exportDocument: (kind: "pdf" | "excel", docType?: AssessmentDocType) => void;
}) {
  return (
    <div className="border-b bg-muted/30 px-5 py-3 text-sm">
      <p className="mb-2 text-xs font-bold text-muted-foreground">Gerar para {contextKind}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => exportDocument("pdf")}>
          {contextKind === "aluno"
            ? "Pauta individual PDF"
            : contextKind === "disciplina"
              ? "Pauta da disciplina PDF"
              : "Pauta da turma PDF"}
        </Button>
        {hasSelectedStudent ? (
          <Button size="sm" variant="outline" onClick={() => exportDocument("pdf", "boletim")}>
            Boletim do aluno
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => exportDocument("pdf", "relacao")}>
          Relação de alunos
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportDocument("pdf", "mapa")}>
          Mapa de aproveitamento
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportDocument("pdf", "acta")}>
          Acta do conselho
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportDocument("pdf", "validacao")}>
          Validação de notas
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportDocument("excel")}>
          Exportar Excel
        </Button>
      </div>
    </div>
  );
}

export type AssessmentHistoryLine = {
  id: string;
  studentName: string;
  itemName: string;
  previous: number | null;
  current: number | null;
};

export function AssessmentHistoryPanel({ lines }: { lines: ReadonlyArray<AssessmentHistoryLine> }) {
  return (
    <div className="border-b bg-muted/20 px-5 py-3">
      <p className="mb-2 text-xs font-bold text-muted-foreground">
        Histórico (nota original → nova)
      </p>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ainda não há alterações gravadas neste contexto.
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {lines.slice(0, 12).map((line) => (
            <li key={line.id}>
              <span className="font-semibold">{line.studentName}</span> · {line.itemName}:{" "}
              {formatScore(line.previous)} → {formatScore(line.current)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
