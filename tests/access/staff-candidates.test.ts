import { describe, expect, it } from "vitest";
import { isUnassignedStaffCandidate } from "@/features/access/staff-candidates";

describe("seleccionar candidatos sem cargo para a equipa", () => {
  it("mostra só contas sem papel na vista por omissão", () => {
    expect(isUnassignedStaffCandidate({ cargo: "Utilizador", is_self: false }, "unassigned")).toBe(
      true,
    );
    expect(isUnassignedStaffCandidate({ cargo: "", is_self: false }, "unassigned")).toBe(true);
    expect(isUnassignedStaffCandidate({ cargo: "Aluno", is_self: false }, "unassigned")).toBe(
      false,
    );
    expect(isUnassignedStaffCandidate({ cargo: "Secretaria", is_self: false }, "unassigned")).toBe(
      false,
    );
  });

  it("pode mostrar contas sem função de funcionário sem repetir quem já tem cargo", () => {
    for (const cargo of ["Utilizador", "Aluno", "Encarregado"]) {
      expect(isUnassignedStaffCandidate({ cargo, is_self: false }, "without_staff")).toBe(true);
    }
    for (const cargo of ["Administrador", "Secretaria", "Tesouraria", "Professor"]) {
      expect(isUnassignedStaffCandidate({ cargo, is_self: false }, "without_staff")).toBe(false);
    }
  });

  it("nunca oferece a conta corrente para uma mudança de cargo inadvertida", () => {
    expect(isUnassignedStaffCandidate({ cargo: "Utilizador", is_self: true }, "unassigned")).toBe(
      false,
    );
    expect(
      isUnassignedStaffCandidate({ cargo: "Encarregado", is_self: true }, "without_staff"),
    ).toBe(false);
  });
});
