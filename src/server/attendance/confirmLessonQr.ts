import { consumeLessonQr, type AtomicQrStore, type LessonQrIdentity } from "./lessonQrChallenge";
import { lessonQrStore, type QrSqlClient } from "./lessonQrStore";

export type QrAttendanceTransaction = QrSqlClient & {
  commit(): Promise<void>;
  rollback(): Promise<void>;
};
export type OpenQrAttendanceTransaction = () => Promise<QrAttendanceTransaction>;
const insertEventSql = `
INSERT INTO academic_evidence.lesson_qr_events
  (nonce_hash,school_id,snapshot_id,occurrence_id,teacher_id,operation)
VALUES ($1,$2,$3,$4,$5,$6)
RETURNING id
`;

/**
 * Call only after server-side authentication, teacher assignment, published
 * occurrence, school membership and operation time-window checks. The
 * transaction must use one database connection for UPDATE and INSERT.
 */
export async function confirmLessonQr(
  token: string, expected: LessonQrIdentity, key: CryptoKey,
  openTransaction: OpenQrAttendanceTransaction, nowMs: number,
): Promise<boolean> {
  const tx = await openTransaction();
  let finished = false;
  try {
    let nonceHash: string | undefined;
    const store = lessonQrStore(tx);
    const capturingStore: AtomicQrStore = {
      register: store.register,
      async consume(record) {
        const accepted = await store.consume(record);
        if (accepted) nonceHash = record.nonceHash;
        return accepted;
      },
    };
    const accepted = await consumeLessonQr(token, expected, key, capturingStore, nowMs);
    if (!accepted || !nonceHash) {
      await tx.rollback();
      finished = true;
      return false;
    }
    const result = await tx.query(insertEventSql, [
      nonceHash, expected.schoolId, expected.snapshotId,
      expected.lessonId, expected.teacherId, expected.operation,
    ]);
    if (result.rowCount !== 1) throw new Error("Evento QR não registado.");
    await tx.commit();
    finished = true;
    return true;
  } catch (error) {
    if (!finished) await tx.rollback();
    throw error;
  }
}
