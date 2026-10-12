import { describe, expect, it } from "vitest";
import {
  enrollmentWindow,
  outsideCycleRefusal,
  parseEnrollmentCycles,
  validateEnrollmentCycles,
} from "@/features/students/enrollment-cycle";
import { isWithoutEnrollment, matchesQuickCategory } from "@/features/students/academic-status";

/** Pedido do dono (2026-10-10): matrículas só nos ciclos próprios, nunca em período de aulas. */
const periods = [
  { name: "1.º Trimestre", starts_on: "2026-09-15", ends_on: "2026-12-18" },
  { name: "2.º Trimestre", starts_on: "2027-01-05", ends_on: "2027-04-02" },
];
const cycles = [
  { label: "Matrículas 2026/27", opens_on: "2026-08-01", closes_on: "2026-09-10" },
  { label: "Matrículas tardias", opens_on: "2026-12-21", closes_on: "2027-01-03" },
];

describe("estado das matrículas", () => {
  it("dentro de um ciclo e fora das aulas: aberto", () => {
    expect(enrollmentWindow({ today: "2026-08-20", cycles, periods })).toMatchObject({
      open: true,
      cycle: { label: "Matrículas 2026/27" },
    });
  });

  it("durante um período de aulas: fechado, com o próximo ciclo", () => {
    const window = enrollmentWindow({ today: "2026-10-10", cycles, periods });
    expect(window.open).toBe(false);
    expect(window.message).toContain("decorre o 1.º Trimestre");
    expect(window.message).toContain("Matrículas tardias");
  });

  it("fora das aulas mas fora de qualquer ciclo: fechado", () => {
    const window = enrollmentWindow({ today: "2026-09-12", cycles, periods });
    expect(window).toMatchObject({ open: false });
    expect(window.message).toContain("Fora do período de matrículas");
  });

  it("um ciclo nunca abre durante as aulas, mesmo mal configurado", () => {
    const overlap = [{ label: "Errado", opens_on: "2026-10-01", closes_on: "2026-10-31" }];
    expect(enrollmentWindow({ today: "2026-10-10", cycles: overlap, periods }).open).toBe(false);
  });

  it("sem ciclos definidos: aberto só fora dos períodos de aulas", () => {
    expect(enrollmentWindow({ today: "2026-12-25", cycles: [], periods }).open).toBe(true);
    expect(enrollmentWindow({ today: "2026-10-10", cycles: [], periods }).open).toBe(false);
  });
});

describe("excepção da Administração", () => {
  const closed = enrollmentWindow({ today: "2026-10-10", cycles, periods });

  it("a Secretaria é recusada fora do ciclo", () => {
    expect(outsideCycleRefusal({ window: closed, canOverride: false, reason: "qualquer" })).toMatch(
      /Só a Administração/,
    );
  });

  it("a Administração precisa de dizer porquê", () => {
    expect(outsideCycleRefusal({ window: closed, canOverride: true })).toMatch(/indique o motivo/);
    expect(
      outsideCycleRefusal({
        window: closed,
        canOverride: true,
        reason: "Transferência autorizada",
      }),
    ).toBeNull();
  });

  it("dentro do ciclo ninguém precisa de motivo", () => {
    const open = enrollmentWindow({ today: "2026-08-20", cycles, periods });
    expect(outsideCycleRefusal({ window: open, canOverride: false })).toBeNull();
  });
});

describe("gravar ciclos", () => {
  it("recusa ciclos em período de aulas, sobrepostos ou ao contrário", () => {
    const errors = validateEnrollmentCycles(
      [
        { label: "A", opens_on: "2026-08-01", closes_on: "2026-09-20" },
        { label: "B", opens_on: "2026-08-15", closes_on: "2026-08-20" },
        { label: "C", opens_on: "2027-06-10", closes_on: "2027-06-01" },
      ],
      periods,
    );
    expect(errors.join(" ")).toMatch(/A coincide com o 1\.º Trimestre/);
    expect(errors.join(" ")).toMatch(/B sobrepõe-se a A/);
    expect(errors.join(" ")).toMatch(/C: o fecho tem de ser depois da abertura/);
    expect(validateEnrollmentCycles(cycles, periods)).toEqual([]);
  });

  it("a leitura tolera valores estragados e ordena pela abertura", () => {
    expect(
      parseEnrollmentCycles({
        cycles: [
          cycles[1],
          { label: "", opens_on: "2026-01-01", closes_on: "2026-01-31" },
          { label: "x", opens_on: "ontem", closes_on: "2026-01-31" },
          null,
        ],
      }).map((cycle) => cycle.label),
    ).toEqual(["Matrículas", "Matrículas tardias"]);
    expect(parseEnrollmentCycles(null)).toEqual([]);
  });
});

describe("filtro «Sem matrícula»", () => {
  const row = (student_status: string, has_current_enrollment: boolean) => ({
    student_status,
    has_current_enrollment,
  });

  it("alunos da escola sem matrícula pendente ou activa", () => {
    expect(isWithoutEnrollment(row("active", false))).toBe(true);
    expect(isWithoutEnrollment(row("applicant", false))).toBe(true);
    expect(isWithoutEnrollment(row("inactive", false))).toBe(true);
    expect(isWithoutEnrollment(row("active", true))).toBe(false);
  });

  it("transferidos e concluídos saíram de vez e não entram", () => {
    expect(isWithoutEnrollment(row("transferred", false))).toBe(false);
    expect(isWithoutEnrollment(row("graduated", false))).toBe(false);
  });

  it("é uma categoria rápida da lista", () => {
    expect(matchesQuickCategory(row("applicant", false), "sem_matricula")).toBe(true);
    expect(matchesQuickCategory(row("active", true), "sem_matricula")).toBe(false);
  });
});

describe("dívida na lista de alunos", () => {
  it("conta a multa por atraso, como a ficha e as Finanças", async () => {
    const { deriveFinancialSnapshot } = await import("@/features/students/academic-status");
    const snapshot = deriveFinancialSnapshot(
      [
        {
          id: "f1",
          amount: 10000,
          discount_amount: 0,
          penalty_amount: 500,
          amount_paid: 0,
          due_date: "2026-01-01",
          status: "issued",
        },
      ],
      "2026-10-10",
    );
    expect(snapshot.debtAmount).toBe(10500);
  });

  it("a lista pede a multa à base", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/features/students/server.ts", "utf8")).toContain(
      '"id, contract_id, amount, discount_amount, penalty_amount, due_date, status"',
    );
  });
});
