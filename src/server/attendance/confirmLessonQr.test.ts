import { describe, expect, it } from "vitest";
import { importLessonQrKey, issueLessonQr, type AtomicQrStore } from "./lessonQrChallenge";
import { confirmLessonQr, type QrAttendanceTransaction } from "./confirmLessonQr";

const identity = {
  schoolId: "school-1", snapshotId: "snapshot-1", lessonId: "lesson-1",
  teacherId: "teacher-1", operation: "check_in" as const,
};
const now = Date.parse("2026-09-24T08:00:00+01:00");
async function fixture(failEvent = false) {
  const key = await importLessonQrKey(crypto.getRandomValues(new Uint8Array(32)));
  const issued = new Set<string>();
  const issuer: AtomicQrStore = {
    async register({ nonceHash }) { issued.add(nonceHash); },
    async consume() { throw new Error("Issuer must not consume"); },
  };
  const token = await issueLessonQr(identity, key, issuer, now);
  let committed = 0;
  let rolledBack = 0;
  const statements: string[] = [];
  const openTransaction = async (): Promise<QrAttendanceTransaction> => ({
    async query(sql, params) {
      statements.push(sql);
      if (/UPDATE academic_evidence\.lesson_qr_challenges/.test(sql)) {
        return { rowCount: issued.has(params[0] as string) ? 1 : 0 };
      }
      if (failEvent) throw new Error("Inserção falhou");
      return { rowCount: 1 };
    },
    async commit() { committed += 1; },
    async rollback() { rolledBack += 1; },
  });
  return { key, token, openTransaction, statements,
    counts: () => ({ committed, rolledBack }) };
}
describe("confirmação transaccional da aula por QR", () => {
  it("consome o desafio e insere o evento antes de confirmar", async () => {
    const f = await fixture();
    expect(await confirmLessonQr(f.token, identity, f.key, f.openTransaction, now + 1000)).toBe(true);
    expect(f.statements).toHaveLength(2);
    expect(f.statements[0]).toMatch(/UPDATE academic_evidence/);
    expect(f.statements[1]).toMatch(/INSERT INTO academic_evidence\.lesson_qr_events/);
    expect(f.counts()).toEqual({ committed: 1, rolledBack: 0 });
  });
  it("reverte o consumo quando a gravação do evento falha", async () => {
    const f = await fixture(true);
    await expect(confirmLessonQr(f.token, identity, f.key, f.openTransaction, now + 1000))
      .rejects.toThrow(/Inserção falhou/);
    expect(f.counts()).toEqual({ committed: 0, rolledBack: 1 });
  });
  it("não grava evento nem confirma token adulterado", async () => {
    const f = await fixture();
    expect(await confirmLessonQr(f.token + "a", identity, f.key, f.openTransaction, now + 1000)).toBe(false);
    expect(f.statements).toHaveLength(0);
    expect(f.counts()).toEqual({ committed: 0, rolledBack: 1 });
  });
});
