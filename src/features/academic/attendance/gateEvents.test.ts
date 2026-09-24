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
  });
});
