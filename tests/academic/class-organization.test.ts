import { describe, expect, it } from "vitest";
import {
  ageOn,
  buildOrganizationPlan,
  classLetter,
  orderMoves,
  type OrganizationStudent,
} from "@/features/academic/class-organization";

const scope = {
  schoolId: "s1",
  academicYearId: "y1",
  gradeLevelId: "g7",
  programId: null,
  shift: "morning",
};
const classes = [
  { id: "cA", code: "7A-M", name: "7ª A — Manhã", capacity: 2, status: "active" },
  { id: "cB", code: "7B-M", name: "7ª B — Manhã", capacity: 2, status: "active" },
];
const student = (
  n: number,
  birthDate: string | null,
  classGroupId: string,
  hasRecords = false,
): OrganizationStudent => ({
  enrollmentId: `e${n}`,
  studentId: `s${n}`,
  studentNumber: `126000${n}`,
  name: `Aluno ${n}`,
  birthDate,
  classGroupId,
  hasRecords,
});

describe("letra da turma", () => {
  it("lê os códigos reais da escola e, sem código, o nome", () => {
    expect(classLetter("7A-M")).toBe("A");
    expect(classLetter("CFB10B-T")).toBe("B");
    expect(classLetter("DEMO1C")).toBe("C");
    expect(classLetter("DH26-10A")).toBe("A");
    expect(classLetter("12a")).toBe("A");
    expect(classLetter("TURMA-X", "7ª D — Tarde")).toBe("D");
    expect(classLetter("TURMA-X", "10ª CFB E — Manhã")).toBe("E");
    expect(classLetter("TURMA", "Turma sem letra")).toBeNull();
  });
});

describe("idade", () => {
  it("anos completos na data de referência", () => {
    expect(ageOn("2013-10-26", "2026-10-26")).toBe(13);
    expect(ageOn("2013-10-27", "2026-10-26")).toBe(12);
    expect(ageOn(null, "2026-10-26")).toBeNull();
    expect(ageOn("2030-01-01", "2026-10-26")).toBeNull();
    expect(ageOn("2013-02-30", "2026-10-26")).toBeNull();
  });
});

describe("organizar uma classe por idade", () => {
  it("A fica com os mais novos, B com os seguintes; só muda quem precisa", () => {
    const plan = buildOrganizationPlan({
      scope,
      referenceDate: "2026-10-26",
      classes,
      students: [
        student(1, "2012-01-01", "cA"), // o mais velho, estava na A
        student(2, "2014-06-01", "cB"), // o mais novo, estava na B
        student(3, "2013-05-01", "cA"),
        student(4, "2012-08-01", "cB"),
      ],
    });
    expect(plan.blockers).toEqual([]);
    const to = Object.fromEntries(plan.lines.map((line) => [line.studentId, line.toLetter]));
    expect(to).toEqual({ s2: "A", s3: "A", s4: "B", s1: "B" });
    expect(plan.moves.map((move) => move.studentId).sort()).toEqual(["s1", "s2"]);
    expect(plan.classes.map((c) => [c.letter, c.proposed, c.youngest, c.oldest])).toEqual([
      ["A", 2, 12, 13],
      ["B", 2, 14, 14],
    ]);
  });

  it("quem já tem notas ou presenças fica, e o lugar dele conta como ocupado", () => {
    const plan = buildOrganizationPlan({
      scope,
      referenceDate: "2026-10-26",
      classes,
      students: [
        student(1, "2012-01-01", "cA", true), // mais velho mas com notas na A
        student(2, "2014-06-01", "cB"),
        student(3, "2013-05-01", "cB"),
      ],
    });
    const byId = Object.fromEntries(plan.lines.map((line) => [line.studentId, line]));
    expect(byId.s1).toMatchObject({ status: "records", toLetter: "A" });
    // A tinha 1 lugar livre: o mais novo vai para lá; o seguinte fica na B.
    expect(byId.s2).toMatchObject({ status: "move", toLetter: "A" });
    expect(byId.s3).toMatchObject({ status: "same", toLetter: "B" });
    expect(plan.warnings.join(" ")).toContain("ficam onde estão");
  });

  it("sem data de nascimento: fica, e a ficha tem de ser corrigida", () => {
    const plan = buildOrganizationPlan({
      scope,
      referenceDate: "2026-10-26",
      classes,
      students: [student(1, null, "cB"), student(2, "2014-01-01", "cB")],
    });
    expect(plan.lines.find((line) => line.studentId === "s1")).toMatchObject({
      status: "no_birth_date",
      toLetter: "B",
    });
    expect(plan.warnings.join(" ")).toContain("sem data de nascimento");
  });

  it("letras repetidas ou ilegíveis impedem aplicar", () => {
    const plan = buildOrganizationPlan({
      scope,
      referenceDate: "2026-10-26",
      classes: [...classes, { id: "cA2", code: "07A", name: "Outra", capacity: 30, status: "active" }],
      students: [student(1, "2013-01-01", "cA")],
    });
    expect(plan.blockers.join(" ")).toContain("duas turmas A");
    expect(plan.moves).toEqual([]);
  });

  it("lotação acima do Decreto Presidencial 162/23 é assinalada", () => {
    const plan = buildOrganizationPlan({
      scope,
      referenceDate: "2026-10-26",
      classes: [{ ...classes[0]!, capacity: 40 }, { ...classes[1]!, capacity: 50 }],
      students: [],
    });
    expect(plan.warnings.join(" ")).toContain("acima de 36 só com autorização regional");
    expect(plan.warnings.join(" ")).toContain("no máximo 45");
  });

  it("a assinatura muda quando o plano muda, e não depende da ordem", () => {
    // Um lugar por turma: os dois planos são de facto diferentes.
    const one = classes.map((group) => ({ ...group, capacity: 1 }));
    const base = [student(1, "2012-01-01", "cA"), student(2, "2014-06-01", "cB")];
    const a = buildOrganizationPlan({ scope, referenceDate: "2026-10-26", classes: one, students: base });
    const b = buildOrganizationPlan({
      scope,
      referenceDate: "2026-10-26",
      classes: one,
      students: [...base].reverse(),
    });
    const c = buildOrganizationPlan({
      scope,
      referenceDate: "2026-10-26",
      classes: one,
      students: [student(1, "2014-06-01", "cA"), student(2, "2012-01-01", "cB")],
    });
    expect(a.signature).toBe(b.signature);
    expect(a.signature).not.toBe(c.signature);
  });
});

describe("ordem das mudanças", () => {
  it("liberta lugar antes de o ocupar; troca entre turmas cheias fica bloqueada", () => {
    const capacity = new Map([
      ["A", 2],
      ["B", 2],
    ]);
    const { ordered } = orderMoves(
      [
        { id: 1, from: "B", to: "A" },
        { id: 2, from: "A", to: "B" },
      ],
      new Map([
        ["A", 2],
        ["B", 1],
      ]),
      capacity,
    );
    expect(ordered.map((move) => move.id)).toEqual([2, 1]);

    const blocked = orderMoves(
      [
        { id: 1, from: "B", to: "A" },
        { id: 2, from: "A", to: "B" },
      ],
      new Map([
        ["A", 2],
        ["B", 2],
      ]),
      capacity,
    );
    expect(blocked.blocked).toHaveLength(2);
  });
});
