import { describe, expect, it } from "vitest";
import { lessonQrStore } from "./lessonQrStore";

const record = {
  nonceHash: "a".repeat(43), schoolId: "school-1", snapshotId: "snapshot-1",
  lessonId: "lesson-1", teacherId: "teacher-1",
  operation: "check_in" as const,
  issuedAtMs: Date.parse("2026-09-24T08:00:00+01:00"),
  expiresAtMs: Date.parse("2026-09-24T08:01:00+01:00"),
};
describe("adaptador SQL de desafios QR", () => {
  it("regista antes de emitir e consome com UPDATE condicional parametrizado", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const store = lessonQrStore({
      async query(sql, params) {
        calls.push({ sql, params });
        return { rowCount: 1 };
      },
    });
    await store.register(record);
    expect(await store.consume(record)).toBe(true);
    expect(calls[0].sql).toMatch(/INSERT INTO academic_evidence\.lesson_qr_challenges/);
    expect(calls[1].sql).toMatch(/consumed_at IS NULL AND expires_at > clock_timestamp\(\)/);
    expect(calls[1].sql).toMatch(/RETURNING nonce_hash/);
    expect(calls[0].params).toEqual(calls[1].params);
    expect(calls[0].params[0]).toBe(record.nonceHash);
  });
  it("bloqueia emissão sem registo e rejeita consumo inexistente", async () => {
    const noRows = lessonQrStore({ async query() { return { rowCount: 0 }; } });
    await expect(noRows.register(record)).rejects.toThrow(/não registado/);
    expect(await noRows.consume(record)).toBe(false);
  });
});
