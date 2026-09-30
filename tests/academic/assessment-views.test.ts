import { describe, expect, it } from "vitest";
import {
  buildClassCourseMap,
  buildStudentDossier,
  buildTermCloseChecklist,
  changeHistoryLines,
  documentValidationCode,
  mergeReloadedValues,
  rowsToTsv,
  selectIdRange,
} from "@/features/academic/assessment-views";

describe("assessment context views", () => {
  it("monta o dossiê do aluno com os três trimestres e MFA", () => {
    const dossier = buildStudentDossier(
      [
        { enrollment_id: "e1", subject_id: "mat", term: 1, mac: 12, npp: 12, npt: 12 },
        { enrollment_id: "e1", subject_id: "mat", term: 2, mac: 10, npp: 10, npt: 10 },
        { enrollment_id: "e1", subject_id: "lp", term: 1, mac: 8, npp: 8, npt: 8 },
      ],
      [
        { id: "mat", name: "Matemática" },
        { id: "lp", name: "Língua Portuguesa" },
      ],
      "e1",
      10,
    );
    expect(dossier[0]?.mfa).toBeCloseTo(11);
    expect(dossier[0]?.situacao.label).toBe("Transita");
    expect(dossier[1]?.terms[0]).toBeCloseTo(8);
    expect(dossier[1]?.situacao.label).toBe("Não transita");
  });

  it("agrega turmas de uma classe/curso", () => {
    const rows = buildClassCourseMap(
      [{ id: "g1", name: "10ª A", grade_name: "10ª", course_name: "CFB" }],
      [
        { id: "e1", class_group_id: "g1" },
        { id: "e2", class_group_id: "g1" },
      ],
      [
        { enrollment_id: "e1", mac: 14, npp: 14, npt: 14 },
        { enrollment_id: "e2", mac: 8, npp: 8, npt: 8 },
      ],
      10,
    );
    expect(rows[0]?.alunos).toBe(2);
    expect(rows[0]?.transitam).toBe(1);
    expect(rows[0]?.media).toBeCloseTo(11);
  });

  it("lista histórico sem apagar a nota original", () => {
    const lines = changeHistoryLines(
      [
        {
          item_id: "i1",
          enrollment_id: "e1",
          score: 14,
          previous_score: 8,
          updated_at: "2026-08-11",
        },
      ],
      [{ id: "i1", name: "Recurso" }],
      [{ id: "e1", student_name: "Noé Mateus" }],
    );
    expect(lines[0]?.previous).toBe(8);
    expect(lines[0]?.current).toBe(14);
    expect(lines[0]?.studentName).toBe("Noé Mateus");
  });

  it("só permite fechar o trimestre com a pauta completa e válida", () => {
    expect(
      buildTermCloseChecklist({
        total: 2,
        pending: 0,
        dirty: 0,
        invalid: 0,
        closed: false,
      }).ready,
    ).toBe(true);
    expect(
      buildTermCloseChecklist({
        total: 2,
        pending: 1,
        dirty: 0,
        invalid: 0,
        closed: false,
      }).ready,
    ).toBe(false);
  });

  it("gera código de validação e selecciona intervalos na grelha", () => {
    expect(documentValidationCode(["Escola", "10ª A", "1"])).toMatch(/^SIGA-[0-9A-F]{8}$/);
    expect(selectIdRange(["a", "b", "c", "d"], "b", "d")).toEqual(["b", "c", "d"]);
  });
});

describe("mergeReloadedValues", () => {
  const loaded = { e1: { mac: "12", npp: "14" }, e2: { mac: "" } };

  it("mantém o que o professor escreveu e actualiza o resto", () => {
    const current = { e1: { mac: "18", npp: "14" }, e2: { mac: "" } };
    const reloaded = { e1: { mac: "12", npp: "15", item1: "9" }, e2: { mac: "10" } };
    expect(mergeReloadedValues(reloaded, current, loaded)).toEqual({
      e1: { mac: "18", npp: "15", item1: "9" },
      e2: { mac: "10" },
    });
  });

  it("apagar uma nota também conta como edição", () => {
    const current = { e1: { mac: "", npp: "14" } };
    expect(mergeReloadedValues({ e1: { mac: "12", npp: "14" } }, current, loaded).e1.mac).toBe("");
  });

  it("alunos que saíram da lista saem também", () => {
    const current = { e1: { mac: "12" }, e2: { mac: "7" } };
    expect(Object.keys(mergeReloadedValues({ e1: { mac: "12" } }, current, loaded))).toEqual([
      "e1",
    ]);
  });
});
