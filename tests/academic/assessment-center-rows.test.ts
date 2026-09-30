import { describe, expect, it } from "vitest";
import {
  computeAssessmentRows,
  countInvalidCells,
  filterAssessmentRows,
  groupItemsByComponent,
  scoreParser,
} from "@/features/academic/assessment-center-rows";
import type { ActiveAssessmentEngine } from "@/features/academic/assessment-models";
import { cellKey } from "@/features/academic/use-grade-editor";
import { scoreAverage } from "@/lib/angola-academic";

// MT = MAC × 40% + NPT × 60%, arredondado às unidades; recurso fica com a maior.
const engine: ActiveAssessmentEngine = {
  continuousWeight: 40,
  examWeight: 60,
  roundingMethod: "nearest",
  scale: { minimum: 0, maximum: 20, decimalPlaces: 0 },
  calculation: { nppMode: "in_mac", recoveryMethod: "max" },
};

const items = [
  { id: "t1", component: "MAC", counts_toward_pauta: true },
  { id: "t2", component: "MAC", counts_toward_pauta: true },
  { id: "extra", component: "MAC", counts_toward_pauta: false },
  { id: "rec", component: "recurso", counts_toward_pauta: false },
  { id: "ex", component: "exame", counts_toward_pauta: false },
];
const itemsByComponent = groupItemsByComponent(items);
const roster = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("groupItemsByComponent", () => {
  it("MAC/NPP/NPT só com itens que contam; recurso e exame todos", () => {
    expect(itemsByComponent.contam.get("MAC")?.map((i) => i.id)).toEqual(["t1", "t2"]);
    expect(itemsByComponent.todos.get("MAC")).toHaveLength(3);
    expect(itemsByComponent.contam.has("recurso")).toBe(false);
    expect(itemsByComponent.todos.get("recurso")?.map((i) => i.id)).toEqual(["rec"]);
  });
});

describe("computeAssessmentRows", () => {
  it("usa os pesos e o arredondamento do modelo activo", () => {
    const [row] = computeAssessmentRows({
      roster: [roster[0]!],
      values: { a: { mac: "10", npp: "12", npt: "15" } },
      itemsByComponent,
      engine,
      passingGrade: 10,
    });
    expect(row!.average).toBe(13);
    expect(row!.finalScore).toBe(13);
    expect(row!.situacao.label).toBe("Transita");
  });

  it("sem modelo, segue o cálculo do Decreto 424/25", () => {
    const [row] = computeAssessmentRows({
      roster: [roster[0]!],
      values: { a: { mac: "10", npp: "12", npt: "15" } },
      itemsByComponent,
      engine: null,
      passingGrade: 10,
    });
    expect(row!.average).toBe(scoreAverage(10, 12, 15));
  });

  it("MAC vazio → média dos itens que contam para a pauta", () => {
    const [row] = computeAssessmentRows({
      roster: [roster[0]!],
      values: { a: { t1: "8", t2: "12", extra: "20", npp: "10", npt: "10" } },
      itemsByComponent,
      engine,
      passingGrade: 10,
    });
    expect(row!.mac).toBe(10);
  });

  it("recurso pelo método do modelo; exame substitui a nota", () => {
    const [comRecurso, comExame] = computeAssessmentRows({
      roster: [roster[0]!, roster[1]!],
      values: {
        a: { mac: "5", npp: "5", npt: "5", rec: "12" },
        b: { mac: "5", npp: "5", npt: "5", ex: "9" },
      },
      itemsByComponent,
      engine,
      passingGrade: 10,
    });
    expect(comRecurso!.average).toBe(5);
    expect(comRecurso!.finalScore).toBe(12);
    expect(comExame!.finalScore).toBe(9);
    expect(comExame!.situacao.label).toBe("Não transita");
  });

  it("sem notas fica Pendente", () => {
    const [row] = computeAssessmentRows({
      roster: [roster[2]!],
      values: {},
      itemsByComponent,
      engine,
      passingGrade: 10,
    });
    expect(row!.average).toBeNull();
    expect(row!.situacao.label).toBe("Pendente");
  });
});

describe("filterAssessmentRows", () => {
  const rows = computeAssessmentRows({
    roster,
    values: {
      a: { mac: "15", npp: "15", npt: "15" },
      b: { mac: "5", npp: "5", npt: "5" },
      c: { mac: "12" },
    },
    itemsByComponent,
    engine,
    passingGrade: 10,
  });
  const ids = (list: ReadonlyArray<{ student: { id: string } }>) => list.map((r) => r.student.id);
  const base = { mode: "lancamento" as const, dirtyKeys: new Set<string>(), passingGrade: 10 };

  it("filtra por situação", () => {
    expect(ids(filterAssessmentRows(rows, { ...base, situacao: "todos" }))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(ids(filterAssessmentRows(rows, { ...base, situacao: "pendente" }))).toEqual(["c"]);
    expect(ids(filterAssessmentRows(rows, { ...base, situacao: "transita" }))).toEqual(["a"]);
    expect(ids(filterAssessmentRows(rows, { ...base, situacao: "reprovado" }))).toEqual(["b"]);
  });

  it("em Revisão mostra incompletas e alteradas, ignorando o filtro", () => {
    const visible = filterAssessmentRows(rows, {
      ...base,
      mode: "revisao",
      situacao: "transita",
      dirtyKeys: new Set([cellKey("b", "npt")]),
    });
    expect(ids(visible)).toEqual(["b", "c"]);
  });
});

describe("countInvalidCells", () => {
  it("conta células MAC/NPP/NPT fora da escala", () => {
    const parse = scoreParser(engine);
    const count = countInvalidCells(
      [{ row: { mac: "25", npp: "abc", npt: "10" } }, { row: { mac: "", npt: "  " } }],
      parse,
    );
    expect(count).toBe(2);
  });
});
