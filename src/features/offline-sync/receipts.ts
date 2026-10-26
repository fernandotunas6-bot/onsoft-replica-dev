/**
 * Recibos idempotentes dos envios da app desktop (20261025130000_offline_sync_receipts).
 *
 * A fila offline manda cada lançamento com um `op_id`. Aqui, antes de gravar, abre-se o
 * recibo; depois de gravar, fecha-se com o resultado. Repetir o mesmo `op_id` (ACK
 * perdido, app fechada a meio do envio) devolve o resultado guardado em vez de gravar
 * outra vez; com outros dados é recusado. Ver docs/desktop/OFFLINE_SYNC_CONTRACT.md.
 *
 * Sem `op_id` (navegador, versões antigas da app) ou sem a migração aplicada, grava
 * como antes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type OfflineReceiptKind = "attendance.submit" | "grades.term";

/** Envio igual a outro em curso: o cliente volta a tentar mais tarde, sem marcar recusa. */
export const OFFLINE_RECEIPT_IN_PROGRESS =
  "Este envio ainda está a ser gravado no servidor. Volte a tentar dentro de um minuto.";
export const OFFLINE_RECEIPT_MISMATCH =
  "Este envio offline já foi usado com outros dados. Peça à secretaria para confirmar o lançamento.";

/** Recibo aberto há mais do que isto é um envio que caiu a meio. */
const STALE_SECONDS = 120;

type ClaimOutcome =
  | { outcome: "claimed" | "in_progress" | "stale" | "mismatch" }
  | { outcome: "done"; result: unknown };

/** JSON com as chaves ordenadas: o mesmo lançamento dá sempre o mesmo hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export async function payloadHash(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isMissingFunction(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (error.code === "PGRST202" ||
      error.code === "42883" ||
      /could not find the function/i.test(error.message ?? "")),
  );
}

/**
 * Corre `run` uma só vez por `op_id`. `alreadyApplied` responde, depois de um envio que
 * caiu a meio, se os dados já estão gravados (devolve o resultado) ou não (`null`).
 */
export async function withOfflineReceipt<T>(
  params: {
    db: SupabaseClient;
    schoolId: string;
    actorId: string;
    opId?: string | undefined;
    deviceId?: string | undefined;
    kind: OfflineReceiptKind;
    /** Só os dados do lançamento: sem op_id, escola nem conta de origem. */
    payload: unknown;
    alreadyApplied?: () => Promise<T | null>;
  },
  run: () => Promise<T>,
): Promise<T> {
  if (!params.opId) return run();
  const { db, schoolId, opId } = params;
  const rpc = (name: string, args: Record<string, unknown>) =>
    db.rpc(name as never, args as never) as unknown as Promise<{
      data: unknown;
      error: { code?: string; message?: string } | null;
    }>;

  const { data, error } = await rpc("offline_receipt_claim", {
    school_id: schoolId,
    op_id: opId,
    actor_id: params.actorId,
    device_id: params.deviceId ?? null,
    kind: params.kind,
    payload_hash: await payloadHash(params.payload),
    stale_seconds: STALE_SECONDS,
  });
  if (isMissingFunction(error)) return run();
  if (error) throw new Error("Não foi possível registar o envio. Tente de novo.");
  const claim = data as ClaimOutcome;

  if (claim.outcome === "done") return claim.result as T;
  if (claim.outcome === "mismatch") throw new Error(OFFLINE_RECEIPT_MISMATCH);
  if (claim.outcome === "in_progress") throw new Error(OFFLINE_RECEIPT_IN_PROGRESS);

  const complete = async (result: T) => {
    // Se falhar, o recibo fica aberto e o próximo envio cai em «stale»: verifica e
    // repete, que é seguro. A gravação já está feita; não a dar como falhada.
    await rpc("offline_receipt_complete", {
      school_id: schoolId,
      op_id: opId,
      result: (result ?? {}) as unknown,
    });
    return result;
  };

  if (claim.outcome === "stale" && params.alreadyApplied) {
    const applied = await params.alreadyApplied();
    if (applied !== null) return complete(applied);
  }

  let result: T;
  try {
    result = await run();
  } catch (failure) {
    // Recusa ou falha antes de acabar: as gravações são idempotentes, por isso
    // libertar o op_id deixa repetir (ou corrigir e reenviar) sem duplicar.
    await rpc("offline_receipt_release", { school_id: schoolId, op_id: opId });
    throw failure;
  }
  return complete(result);
}
