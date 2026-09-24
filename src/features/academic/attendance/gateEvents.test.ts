import { describe, expect, it } from "vitest";
import { reconcileGateEvents, type GateEvent } from "./gateEvents";

const base: GateEvent = {
  deviceId: "gate-1", externalEventId: "evt-1", schoolId: "school-1", teacherId: "teacher-1",
  direction: "entry", occurredAt: "2026-09-24T08:00:00+01:00",
  receivedAt: "2026-09-24T08:01:00+01:00",
};
const devices = new Set(["gate-1"]);
describe("eventos de catracas", () => {
  it("aceita eventos da escola e equipamento registado", () => {
    const result = reconcileGateEvents([base], "school-1", devices);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });
  it("bloqueia duplicação e eventos de outra instituição", () => {
    const result = reconcileGateEvents([base, base, { ...base, externalEventId: "evt-2", schoolId: "school-2" }], "school-1", devices);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
  });
  it("rejeita equipamento desconhecido e datas sem fuso", () => {
    expect(reconcileGateEvents([{ ...base, deviceId: "unknown" }], "school-1", devices).accepted).toHaveLength(0);
    expect(reconcileGateEvents([{ ...base, occurredAt: "2026-09-24T08:00:00" }], "school-1", devices).accepted).toHaveLength(0);
  });
  it("sinaliza relógio adiantado sem inventar ausência docente", () => {
    const result = reconcileGateEvents([{ ...base, occurredAt: "2026-09-24T09:00:00+01:00" }], "school-1", devices);
    expect(result.warnings).toHaveLength(1);
    expect(result.accepted).toHaveLength(0);
  });
  it("permite retransmissão corrigida após evento com timestamp inválido", () => {
    const result = reconcileGateEvents([{ ...base, occurredAt: "sem-data" }, base], "school-1", devices);
    expect(result.rejected).toHaveLength(1);
    expect(result.accepted).toHaveLength(1);
  });
  it("impede repetição de evento de lote anterior", () => {
    const key = JSON.stringify([base.deviceId, base.externalEventId]);
    const result = reconcileGateEvents([base], "school-1", devices, 5, new Set([key]));
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/duplicado/);
  });
  it("aceita retransmissão corrigida após alerta de relógio", () => {
    const skewed = { ...base, occurredAt: "2026-09-24T09:00:00+01:00" };
    const result = reconcileGateEvents([skewed, base, base], "school-1", devices);
    expect(result.warnings).toHaveLength(1);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/duplicado/);
  });
  it("rejeita datas inexistentes sem consumir a retransmissão correta", () => {
    const invalid = { ...base, occurredAt: "2026-09-31T08:00:00+01:00" };
    const result = reconcileGateEvents([invalid, base], "school-1", devices);
    expect(result.rejected).toHaveLength(1);
    expect(result.accepted).toHaveLength(1);
  });

  it("rejeita tolerância de relógio desmedida ou fracionária", () => {
    expect(() => reconcileGateEvents([base], "school-1", devices, 1000000000000000)).toThrow();
    expect(() => reconcileGateEvents([base], "school-1", devices, 1.5)).toThrow();
  });

  it("coloca em quarentena eventos offline com mais de 24 horas", () => {
    const result = reconcileGateEvents([{ ...base, receivedAt: "2026-09-26T08:01:00+01:00" }], "school-1", devices);
    expect(result.accepted).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });
});
