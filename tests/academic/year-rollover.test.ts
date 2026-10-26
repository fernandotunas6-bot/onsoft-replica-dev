import { describe, expect, it } from "vitest";
import {
  finalOutcome,
  nextGradeLevel,
  planRenewal,
  suggestTargetGroup,
  type RolloverGroup,
  type RolloverStudent,
} from "@/features/academic/year-rollover";

const levels = [
  { id: "g7", programId: "geral", sequence: 7 },
  { id: "g8", programId: "geral", sequence: 8 },
  { id: "g9", programId: "geral", sequence: 9 },
  { id: "t10", programId: "tecnico", sequence: 10 },
  { id: "sem", programId: null, sequence: null },
];

const group = (id: string, extra: Partial<RolloverGroup> = {}): RolloverGroup => ({
  id,
  name: id,
  academicYearId: "2027",
  gradeLevelId: "g8",
  ...extra,
});

const student = (id: string, outcome: string | null, extra: Partial<RolloverStudent> = {}) => ({
  studentId: id,
  name: id,
  studentStatus: "active",
  outcome,
  targetYearClassGroupId: null,
  ...extra,
});

describe("resultado final gravado no histórico", () => {
  it("lê os textos do histórico, com ou sem acentos", () => {
    expect(finalOutcome("Transitou")).toBe("pass");
    expect(finalOutcome("Não transitou")).toBe("fail");
    expect(finalOutcome("nao transitou")).toBe("fail");
    expect(finalOutcome("Reprovado")).toBe("fail");
    expect(finalOutcome("Aprovado")).toBe("pass");
    expect(finalOutcome("Incompleto")).toBeNull();
    expect(finalOutcome(null)).toBeNull();
  });
});

describe("classe seguinte e fim de ciclo", () => {
  it("é a do mesmo curso com a sequência imediatamente acima", () => {
    expect(nextGradeLevel(levels, "g7")).toMatchObject({ next: { id: "g8" }, isLast: false });
  });
  it("a última classe do curso é fim de ciclo (não salta para outro curso)", () => {
    expect(nextGradeLevel(levels, "g9")).toEqual({ next: null, isLast: true, known: true });
  });
  it("sem curso ou sequência não adivinha", () => {
    expect(nextGradeLevel(levels, "sem")).toEqual({ next: null, isLast: false, known: false });
  });
});

describe("turma sugerida no novo ano", () => {
  const source = group("7.ª A", { name: "7.ª A", gradeLevelId: "g7", shift: "afternoon" });
  const candidates = [
    group("x", { name: "8.ª B", shift: "afternoon" }),
    group("y", { name: "8.ª A", shift: "morning" }),
    group("z", { name: "9.ª A", gradeLevelId: "g9" }),
  ];
  it("prefere a mesma letra, depois o mesmo turno", () => {
    expect(suggestTargetGroup(source, candidates, "g8")?.id).toBe("y");
    expect(suggestTargetGroup({ ...source, name: "7.ª C" }, candidates, "g8")?.id).toBe("x");
  });
  it("sem turma dessa classe no novo ano: nenhuma", () => {
    expect(suggestTargetGroup(source, candidates, "t10")).toBeNull();
  });
});

describe("plano de renovação", () => {
  const pass = group("8A", { name: "8.ª A", capacity: 2, enrolledCount: 0 });
  const repeat = group("7A", { name: "7.ª A", gradeLevelId: "g7" });

  it("transita para a classe seguinte, quem não transita repete, sem resultado fica de fora", () => {
    const lines = planRenewal({
      students: [
        student("Ana", "Transitou"),
        student("Bia", "Não transitou"),
        student("Caio", null),
      ],
      passTarget: pass,
      repeatTarget: repeat,
      isLastGrade: false,
    });
    expect(lines.map((l) => [l.studentId, l.action, l.targetClassGroupId])).toEqual([
      ["Ana", "enroll", "8A"],
      ["Bia", "enroll", "7A"],
      ["Caio", "skip", null],
    ]);
    expect(lines[2]!.reason).toBe("Sem resultado final registado no histórico.");
  });

  it("respeita as vagas da turma de destino", () => {
    const lines = planRenewal({
      students: [
        student("Ana", "Transitou"),
        student("Bia", "Transitou"),
        student("Caio", "Transitou"),
      ],
      passTarget: { ...pass, enrolledCount: 1 },
      repeatTarget: null,
      isLastGrade: false,
    });
    expect(lines.map((l) => l.action)).toEqual(["enroll", "skip", "skip"]);
    expect(lines[1]!.reason).toBe("A turma 8.ª A não tem vagas.");
  });

  it("repetir não duplica e nunca muda quem já está noutra turma do novo ano", () => {
    const lines = planRenewal({
      students: [
        student("Ana", "Transitou", { targetYearClassGroupId: "8A" }),
        student("Bia", "Transitou", { targetYearClassGroupId: "8B" }),
      ],
      passTarget: pass,
      repeatTarget: null,
      isLastGrade: false,
    });
    expect(lines.map((l) => l.action)).toEqual(["already", "skip"]);
  });

  it("fim de ciclo, transferidos e desistentes não renovam", () => {
    const lines = planRenewal({
      students: [
        student("Ana", "Transitou"),
        student("Bia", "Transitou", { studentStatus: "transferred" }),
        student("Caio", "Não transitou", { studentStatus: "inactive" }),
      ],
      passTarget: null,
      repeatTarget: repeat,
      isLastGrade: true,
    });
    expect(lines.map((l) => [l.action, l.reason])).toEqual([
      ["skip", "Fim de ciclo: concluiu a última classe do curso."],
      ["skip", "O aluno foi transferido."],
      ["skip", "O aluno desistiu."],
    ]);
  });

  it("não transitou sem turma de repetência: fica de fora com o motivo", () => {
    const [line] = planRenewal({
      students: [student("Bia", "Não transitou")],
      passTarget: pass,
      repeatTarget: null,
      isLastGrade: false,
    });
    expect(line).toMatchObject({
      action: "skip",
      reason: "Não transitou: falta escolher a turma para repetir a classe.",
    });
  });
});
