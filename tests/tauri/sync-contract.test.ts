import { describe, expect, it } from "vitest";
import {
  planOfflineSync,
  validateOfflineSyncReply,
  type OfflineSyncContext,
  type OfflineSyncOperation,
} from "@/lib/offline/sync-contract";

const context: OfflineSyncContext = {
  schoolId: "school-a",
  actorId: "teacher-a",
  deviceId: "device-a",
  authorizationExpiresAt: "2030-01-01T00:00:00.000Z",
};
const operation: OfflineSyncOperation = {
  opId: "op-1",
  schoolId: context.schoolId,
  actorId: context.actorId,
  deviceId: context.deviceId,
  kind: "attendance.submit",
  expectedRevision: 3,
  state: "pending",
  createdAt: "2026-10-25T08:00:00.000Z",
};
const now = Date.parse("2026-10-25T09:00:00.000Z");
const reply = {
  opId: operation.opId,
  schoolId: context.schoolId,
  actorId: context.actorId,
  deviceId: context.deviceId,
  status: "acknowledged",
  serverRevision: 4,
};

describe("contrato futuro de sincronização offline", () => {
  it("envia apenas operações pendentes da escola, actor e dispositivo exactos", () => {
    const operations: OfflineSyncOperation[] = [
      { ...operation, opId: "different-school", schoolId: "school-b" },
      { ...operation, opId: "different-user", actorId: "teacher-b" },
      { ...operation, opId: "different-device", deviceId: "device-b" },
      { ...operation, opId: "already-sending", state: "sending" },
      { ...operation, opId: "conflict", state: "conflict" },
      operation,
    ];
    expect(planOfflineSync(context, operations, now)).toEqual([operation]);
  });

  it("ordena por criação e ID sem decidir conflitos a partir da data", () => {
    const later = { ...operation, opId: "later", createdAt: "2026-10-25T09:00:00Z" };
    const earlier = { ...operation, opId: "earlier", createdAt: "2026-10-25T08:00:00Z" };
    expect(planOfflineSync(context, [later, earlier], now, 1)).toEqual([earlier]);
  });

  it("recusa duplicações do op_id, incluindo entre escolas", () => {
    expect(() =>
      planOfflineSync(context, [operation, { ...operation, schoolId: "school-b" }], now),
    ).toThrow(/duplicado/);
  });

  it("recusa permissões expiradas e IDs ou revisões inválidas", () => {
    expect(() =>
      planOfflineSync({ ...context, authorizationExpiresAt: "2026-10-24" }, [operation], now),
    ).toThrow(/expirada/);
    expect(() => planOfflineSync(context, [{ ...operation, expectedRevision: -1 }], now)).toThrow(
      /inválida/,
    );
    expect(() => planOfflineSync(context, [operation], now, 51)).toThrow(/Limite/);
  });

  it("aceita ACK apenas da origem, com revisão válida", () => {
    expect(validateOfflineSyncReply(context, operation, reply, now)).toEqual({
      state: "acknowledged",
      serverRevision: 4,
    });
    expect(() =>
      validateOfflineSyncReply(context, operation, { ...reply, actorId: "teacher-b" }, now),
    ).toThrow(/incompatível/);
    expect(() =>
      validateOfflineSyncReply(context, operation, { ...reply, opId: "outro" }, now),
    ).toThrow(/incompatível/);
    expect(() =>
      validateOfflineSyncReply(context, operation, { ...reply, serverRevision: 2 }, now),
    ).toThrow(/recuou/);
  });

  it("mantém conflitos explícitos para revisão humana", () => {
    expect(
      validateOfflineSyncReply(context, operation, {
        ...reply,
        status: "conflict",
        serverRevision: 6,
      }, now),
    ).toEqual({ state: "conflict", serverRevision: 6 });
  });

  it("aceita rejeições explicitas e falha fechado nas respostas desconhecidas", () => {
    expect(
      validateOfflineSyncReply(context, operation, {
        ...reply,
        status: "rejected",
        errorCode: "PERIOD_CLOSED",
      }, now),
    ).toEqual({ state: "rejected", errorCode: "PERIOD_CLOSED" });
    expect(() => validateOfflineSyncReply(context, operation, null, now)).toThrow(/inválida/);
    expect(() =>
      validateOfflineSyncReply(context, operation, { ...reply, status: "timeout" }, now),
    ).toThrow(/desconhecida/);
  });

  it("não envia novamente uma operação já reconhecida ou em estado incerto", () => {
    expect(planOfflineSync(context, [{ ...operation, state: "sending" }], now)).toEqual([]);
    expect(planOfflineSync(context, [{ ...operation, state: "acknowledged" }], now)).toEqual([]);
    expect(() =>
      validateOfflineSyncReply(context, { ...operation, state: "acknowledged" }, reply, now),
    ).toThrow(/não está em estado/);
  });
});
