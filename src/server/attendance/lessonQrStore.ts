import type { AtomicQrStore, QrStoreRecord } from "./lessonQrChallenge";

/** Database adapter; pass a transaction-scoped client when inserting attendance. */
export type QrSqlClient = {
  query(sql: string, parameters: unknown[]): Promise<{ rowCount: number | null }>;
};
const registerSql = `
INSERT INTO academic_evidence.lesson_qr_challenges
  (nonce_hash, school_id, snapshot_id, occurrence_id, teacher_id,
   operation, issued_at, expires_at)
VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz)
`;
const consumeSql = `
UPDATE academic_evidence.lesson_qr_challenges
SET consumed_at = clock_timestamp()
WHERE nonce_hash=$1 AND school_id=$2 AND snapshot_id=$3
  AND occurrence_id=$4 AND teacher_id=$5 AND operation=$6
  AND issued_at=$7::timestamptz AND expires_at=$8::timestamptz
  AND consumed_at IS NULL AND expires_at > clock_timestamp()
RETURNING nonce_hash
`;
function parameters(record: QrStoreRecord): unknown[] {
  return [
    record.nonceHash, record.schoolId, record.snapshotId, record.lessonId,
    record.teacherId, record.operation,
    new Date(record.issuedAtMs).toISOString(),
    new Date(record.expiresAtMs).toISOString(),
  ];
}
export function lessonQrStore(client: QrSqlClient): AtomicQrStore {
  return {
    async register(record) {
      const result = await client.query(registerSql, parameters(record));
      if (result.rowCount !== 1) throw new Error("QR não registado.");
    },
    async consume(record) {
      const result = await client.query(consumeSql, parameters(record));
      return result.rowCount === 1;
    },
  };
}
