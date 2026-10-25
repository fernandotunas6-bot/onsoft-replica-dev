import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OFFLINE_RECEIPT_IN_PROGRESS,
  OFFLINE_RECEIPT_MISMATCH,
  canonicalJson,
  payloadHash,
  withOfflineReceipt,
} from "@/features/offline-sync/receipts";

/** As três funções da 20261025130000, em memória, com as mesmas regras. */
function fakeReceipts(options: { missing?: boolean } = {}) {
  const rows = new Map<
    string,
    { actor: string; kind: string; hash: string; status: string; result?: unknown; stale?: boolean }
  >();
  const calls: string[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push(name);
    if (options.missing) return { data: null, error: { code: "PGRST202", message: "missing" } };
    const key = `${args["school_id"]}:${args["op_id"]}`;
    const row = rows.get(key);
    if (name === "offline_receipt_claim") {
      if (!row) {
        rows.set(key, {
          actor: String(args["actor_id"]),
          kind: String(args["kind"]),
          hash: String(args["payload_hash"]),
          status: "started",
        });
        return { data: { outcome: "claimed" }, error: null };
      }
      if (
        row.actor !== args["actor_id"] ||
        row.kind !== args["kind"] ||
        row.hash !== args["payload_hash"]
      )
        return { data: { outcome: "mismatch" }, error: null };
      if (row.status === "done")
        return { data: { outcome: "done", result: row.result }, error: null };
      if (row.stale) {
        row.stale = false;
        return { data: { outcome: "stale" }, error: null };
      }
      return { data: { outcome: "in_progress" }, error: null };
    }
    if (name === "offline_receipt_complete") {
      if (row?.status === "started") Object.assign(row, { status: "done", result: args["result"] });
      return { data: true, error: null };
    }
    if (name === "offline_receipt_release") {
      if (row?.status === "started") rows.delete(key);
      return { data: true, error: null };
    }
    throw new Error(`rpc inesperada ${name}`);
  });
  return { db: { rpc } as unknown as SupabaseClient, rows, calls };
}

const SCHOOL = "00000000-0000-4000-8000-00000000000a";
const ACTOR = "00000000-0000-4000-8000-0000000000a1";
const OP = "11111111-1111-4111-8111-111111111111";
const base = (db: SupabaseClient, payload: unknown = { sessionId: "s", records: [1, 2] }) => ({
  db,
  schoolId: SCHOOL,
  actorId: ACTOR,
  opId: OP,
  kind: "attendance.submit" as const,
  payload,
});

describe("recibo idempotente dos envios offline", () => {
  it("sem op_id grava como antes, sem recibo", async () => {
    const { db, calls } = fakeReceipts();
    const run = vi.fn(async () => ({ ok: true }));
    await expect(withOfflineReceipt({ ...base(db), opId: undefined }, run)).resolves.toEqual({
      ok: true,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it("o mesmo op_id grava uma vez e devolve o mesmo resultado (ACK perdido)", async () => {
    const { db } = fakeReceipts();
    const run = vi.fn(async () => ({ ok: true, count: 2 }));
    await withOfflineReceipt(base(db), run);
    await expect(withOfflineReceipt(base(db), run)).resolves.toEqual({ ok: true, count: 2 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("o mesmo op_id com outros dados é recusado sem gravar", async () => {
    const { db } = fakeReceipts();
    const run = vi.fn(async () => ({ ok: true }));
    await withOfflineReceipt(base(db), run);
    await expect(
      withOfflineReceipt(base(db, { sessionId: "s", records: [9] }), run),
    ).rejects.toThrow(OFFLINE_RECEIPT_MISMATCH);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("uma recusa liberta o op_id: corrigido, o mesmo envio volta a entrar", async () => {
    const { db, rows } = fakeReceipts();
    await expect(
      withOfflineReceipt(base(db), async () => {
        throw new Error("Período fechado.");
      }),
    ).rejects.toThrow("Período fechado.");
    expect(rows.size).toBe(0);
    await expect(withOfflineReceipt(base(db), async () => ({ ok: true }))).resolves.toEqual({
      ok: true,
    });
  });

  it("dois pedidos com o mesmo op_id ao mesmo tempo: o segundo espera", async () => {
    const { db, rows } = fakeReceipts();
    rows.set(`${SCHOOL}:${OP}`, {
      actor: ACTOR,
      kind: "attendance.submit",
      hash: await payloadHash({ sessionId: "s", records: [1, 2] }),
      status: "started",
    });
    const run = vi.fn(async () => ({ ok: true }));
    await expect(withOfflineReceipt(base(db), run)).rejects.toThrow(OFFLINE_RECEIPT_IN_PROGRESS);
    expect(run).not.toHaveBeenCalled();
  });

  it("envio que caiu a meio: se os dados já estão gravados, não grava de novo", async () => {
    const { db, rows } = fakeReceipts();
    rows.set(`${SCHOOL}:${OP}`, {
      actor: ACTOR,
      kind: "attendance.submit",
      hash: await payloadHash({ sessionId: "s", records: [1, 2] }),
      status: "started",
      stale: true,
    });
    const run = vi.fn(async () => ({ ok: true, count: 2 }));
    const applied = vi.fn(async () => ({ ok: true, count: 2 }));
    await expect(
      withOfflineReceipt({ ...base(db), alreadyApplied: applied }, run),
    ).resolves.toEqual({
      ok: true,
      count: 2,
    });
    expect(run).not.toHaveBeenCalled();
    expect(rows.get(`${SCHOOL}:${OP}`)?.status).toBe("done");
  });

  it("envio que caiu a meio sem os dados gravados: repete", async () => {
    const { db, rows } = fakeReceipts();
    rows.set(`${SCHOOL}:${OP}`, {
      actor: ACTOR,
      kind: "attendance.submit",
      hash: await payloadHash({ sessionId: "s", records: [1, 2] }),
      status: "started",
      stale: true,
    });
    const run = vi.fn(async () => ({ ok: true, count: 2 }));
    await withOfflineReceipt({ ...base(db), alreadyApplied: async () => null }, run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("sem a migração aplicada grava como antes", async () => {
    const { db } = fakeReceipts({ missing: true });
    const run = vi.fn(async () => ({ ok: true }));
    await expect(withOfflineReceipt(base(db), run)).resolves.toEqual({ ok: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("o hash não depende da ordem das chaves nem de campos vazios", async () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe('{"a":[2,{"d":3}],"b":1}');
    expect(await payloadHash({ a: 1, b: 2 })).toBe(await payloadHash({ b: 2, a: 1 }));
    expect(await payloadHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
