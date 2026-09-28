import { describe, expect, it } from "vitest";
import {
  buildPrePautaChecks,
  canRebuildGradeSheet,
  gradeSheetActions,
  isGradeSheetLocked,
  prePautaIsClean,
} from "@/features/academic/grade-sheet-workflow";

const subject = (over = {}) => ({
  subjectName: "Matemática",
  hasTeacher: true,
  gradebookStatus: "submitted",
  missingMac: 0,
  missingNpt: 0,
  outOfScale: 0,
  pendingChanges: 0,
  ...over,
});

describe("fluxo da pauta", () => {
  it("acções por estado espelham transition_grade_sheet", () => {
    expect(gradeSheetActions("draft").map((a) => a.next)).toEqual(["submitted", "rebuild"]);
    expect(gradeSheetActions("submitted").map((a) => a.next)).toEqual([
      "in_review",
      "homologated",
      "rebuild",
    ]);
    expect(gradeSheetActions("homologated").map((a) => a.next)).toEqual(["published", "closed"]);
    expect(gradeSheetActions("published").map((a) => a.next)).toEqual([
      "closed",
      "contested",
      "rectified",
    ]);
    expect(gradeSheetActions("closed")).toEqual([
      { next: "rectified", label: "Reabrir para rectificação", needsReason: true },
    ]);
  });

  it("reabrir exige motivo; publicada e fechada ficam bloqueadas", () => {
    expect(gradeSheetActions("published").find((a) => a.next === "rectified")?.needsReason).toBe(
      true,
    );
    expect(isGradeSheetLocked("published")).toBe(true);
    expect(isGradeSheetLocked("closed")).toBe(true);
    expect(isGradeSheetLocked("draft")).toBe(false);
  });

  it("nunca recalcula (apagar linhas) depois de homologada", () => {
    expect(canRebuildGradeSheet(null)).toBe(true);
    expect(canRebuildGradeSheet("in_review")).toBe(true);
    for (const s of ["homologated", "published", "closed", "contested"] as const) {
      expect(canRebuildGradeSheet(s)).toBe(false);
    }
  });
});

describe("pré-pauta", () => {
  it("limpa quando tudo está lançado e submetido", () => {
    const checks = buildPrePautaChecks({
      enrolled: 30,
      hasActiveRule: true,
      subjects: [subject()],
    });
    expect(prePautaIsClean(checks)).toBe(true);
  });

  it("aponta cada problema com detalhe", () => {
    const checks = buildPrePautaChecks({
      enrolled: 30,
      hasActiveRule: false,
      subjects: [
        subject({
          subjectName: "Física",
          hasTeacher: false,
          gradebookStatus: "open",
          missingNpt: 4,
        }),
        subject({ subjectName: "Química", outOfScale: 1, pendingChanges: 2 }),
      ],
    });
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    expect(prePautaIsClean(checks)).toBe(false);
    expect(byId.rule!.ok).toBe(false);
    expect(byId.teachers!.detail).toBe("Sem professor: Física");
    expect(byId.gradebooks!.detail).toBe("Por submeter: Física");
    expect(byId.missing!.detail).toBe("4 em falta em Física");
    expect(byId.scale!.detail).toBe("1 fora da escala");
    expect(byId.pending!.detail).toBe("2 à espera de aprovação");
  });

  it("exige gerar de novo a pauta se houve notas alteradas depois", () => {
    const base = { enrolled: 30, hasActiveRule: true, subjects: [subject()] };
    // Pauta ainda por gerar: a verificação não se aplica.
    expect(buildPrePautaChecks(base).some((c) => c.id === "fresh")).toBe(false);

    const fresh = buildPrePautaChecks({ ...base, scoresChangedAfterBuild: 0 });
    expect(prePautaIsClean(fresh)).toBe(true);

    const stale = buildPrePautaChecks({ ...base, scoresChangedAfterBuild: 3 });
    expect(prePautaIsClean(stale)).toBe(false);
    expect(stale.find((c) => c.id === "fresh")!.detail).toMatch(
      /3 nota\(s\) alterada\(s\).*gere-a de novo/,
    );
  });

  it("a verificação da escala diz qual é a escala do modelo", () => {
    const checks = buildPrePautaChecks({
      enrolled: 1,
      hasActiveRule: true,
      subjects: [subject()],
      scale: { minimum: 0, maximum: 100 },
    });
    expect(checks.find((c) => c.id === "scale")!.label).toBe("Notas dentro da escala 0–100");
    const fallback = buildPrePautaChecks({
      enrolled: 1,
      hasActiveRule: true,
      subjects: [subject()],
    });
    expect(fallback.find((c) => c.id === "scale")!.label).toBe("Notas dentro da escala 0–20");
  });
});
