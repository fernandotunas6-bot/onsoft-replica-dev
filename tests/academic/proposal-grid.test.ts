import { describe, it, expect } from "vitest";
import { proposalGrid, type ProposalShift } from "@/features/academic/schedule/utils/proposalGrid";
const shift: ProposalShift = {
  id: "s",
  code: "custom",
  name: "Sábado",
  status: "active",
  starts_at: "08:00",
  ends_at: "12:00",
  active_days: [6],
  slots: [
    { starts_at: "08:00", ends_at: "09:30", is_break: false },
    { starts_at: "09:30", ends_at: "10:00", is_break: true },
    { starts_at: "10:00", ends_at: "11:00", is_break: false },
  ],
};
describe("grelha institucional da proposta", () => {
  it("preserva sábado, blocos 90/60 e a pausa configurada", () => {
    expect(proposalGrid(shift)).toEqual({
      weekdays: [6],
      error: null,
      windows: [
        { startsAt: "08:00", endsAt: "09:30" },
        { startsAt: "10:00", endsAt: "11:00" },
      ],
    });
  });
  it("sem turno ou sem tempos não inventa 45 minutos", () => {
    expect(proposalGrid(undefined).windows).toEqual([]);
    expect(proposalGrid({ ...shift, slots: [] }).error).toMatch(/Configure/);
  });
  it("recusa tempos sobrepostos, turno inactivo e dias inválidos", () => {
    expect(proposalGrid({ ...shift, status: "inactive" }).error).not.toBeNull();
    expect(proposalGrid({ ...shift, active_days: [0] }).error).not.toBeNull();
    expect(
      proposalGrid({
        ...shift,
        slots: [...shift.slots, { starts_at: "08:45", ends_at: "10:30", is_break: false }],
      }).error,
    ).toMatch(/sobrepõem/);
  });
  it("preserva os segundos da configuração em vez de antecipar a aula", () => {
    const result = proposalGrid({
      ...shift,
      slots: [{ starts_at: "08:00:30", ends_at: "09:30:30", is_break: false }],
    });
    expect(result.error).toBeNull();
    expect(result.windows).toEqual([{ startsAt: "08:00:30", endsAt: "09:30:30" }]);
  });
  it("recusa sobreposição e saída do turno inferiores a um minuto", () => {
    expect(
      proposalGrid({
        ...shift,
        ends_at: "09:30:00",
        slots: [{ starts_at: "08:00:00", ends_at: "09:30:30", is_break: false }],
      }).error,
    ).not.toBeNull();
    expect(
      proposalGrid({
        ...shift,
        slots: [
          { starts_at: "08:00:00", ends_at: "09:00:30", is_break: false },
          { starts_at: "09:00:00", ends_at: "10:00:00", is_break: false },
        ],
      }).error,
    ).not.toBeNull();
  });
});
