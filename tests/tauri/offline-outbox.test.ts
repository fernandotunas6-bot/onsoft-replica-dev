import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  discardOutboxItem,
  enableOutbox,
  flushOutbox,
  OUTBOX_MAX_BYTES,
  outboxItems,
  resetOutboxForTests,
  sendOrQueue,
  vaultOutboxStorage,
  type OutboxItem,
} from "@/lib/offline/outbox";

const attendance = vi.fn();
const grades = vi.fn();
const vault = new Map<string, string>();
const fakeVault = {
  getItem: async (key: string) => vault.get(key) ?? null,
  setItem: async (key: string, value: string) => void vault.set(key, value),
  removeItem: async (key: string) => void vault.delete(key),
};
const offline = () => new TypeError("Failed to fetch");
const setOnline = (value: boolean) =>
  Object.defineProperty(globalThis, "navigator", { value: { onLine: value }, configurable: true });

beforeEach(async () => {
  vault.clear();
  attendance.mockReset();
  grades.mockReset();
  setOnline(true);
  resetOutboxForTests({ "attendance.submit": attendance, "grades.term": grades });
  await enableOutbox(vaultOutboxStorage(fakeVault));
});
afterEach(() => setOnline(true));

const meta = { label: "Chamada 7ª A", userId: "prof-1" };

describe("fila de envio sem rede", () => {
  it("com rede envia logo e não guarda nada", async () => {
    attendance.mockResolvedValueOnce({ ok: true });
    await expect(sendOrQueue("attendance.submit", { sessionId: "s1" }, meta)).resolves.toEqual({
      queued: false,
      result: { ok: true },
    });
    expect(outboxItems()).toHaveLength(0);
    expect(vault.size).toBe(0);
  });

  it("sem rede guarda no cofre com o autor, sem tentar enviar", async () => {
    setOnline(false);
    await expect(sendOrQueue("attendance.submit", { sessionId: "s1" }, meta)).resolves.toEqual({
      queued: true,
    });
    expect(attendance).not.toHaveBeenCalled();
    const saved = JSON.parse(vault.get("siga.offline-outbox")!) as OutboxItem[];
    expect(saved).toMatchObject([
      { kind: "attendance.submit", userId: "prof-1", label: "Chamada 7ª A" },
    ]);
  });

  it("se a rede cai durante o envio, guarda em vez de perder", async () => {
    attendance.mockRejectedValueOnce(offline());
    await expect(sendOrQueue("attendance.submit", { sessionId: "s1" }, meta)).resolves.toEqual({
      queued: true,
    });
    expect(outboxItems()).toHaveLength(1);
  });

  it("uma recusa do servidor com rede não vai para a fila: o erro chega ao ecrã", async () => {
    attendance.mockRejectedValueOnce(new Error("Turma fechada."));
    await expect(sendOrQueue("attendance.submit", {}, meta)).rejects.toThrow("Turma fechada.");
    expect(outboxItems()).toHaveLength(0);
  });

  it("sobrevive a fechar a app: a fila volta a carregar do cofre", async () => {
    setOnline(false);
    await sendOrQueue("grades.term", { subjectId: "m1" }, { label: "Pauta", userId: "prof-1" });
    resetOutboxForTests({ "attendance.submit": attendance, "grades.term": grades });
    await enableOutbox(vaultOutboxStorage(fakeVault));
    expect(outboxItems()).toMatchObject([{ kind: "grades.term", label: "Pauta" }]);
  });

  it("envia por ordem quando volta a rede e só apaga o que o servidor confirmou", async () => {
    setOnline(false);
    await sendOrQueue("attendance.submit", { n: 1 }, meta);
    await sendOrQueue("grades.term", { n: 2 }, meta);
    setOnline(true);
    attendance.mockResolvedValueOnce({});
    grades.mockRejectedValueOnce(offline());
    await flushOutbox("prof-1");
    expect(attendance).toHaveBeenCalledWith({ n: 1 });
    expect(outboxItems()).toMatchObject([{ kind: "grades.term" }]);

    grades.mockResolvedValueOnce({});
    await flushOutbox("prof-1");
    expect(outboxItems()).toHaveLength(0);
    expect(vault.has("siga.offline-outbox")).toBe(false);
  });

  it("só envia com a sessão de quem fez o lançamento", async () => {
    setOnline(false);
    await sendOrQueue("attendance.submit", { n: 1 }, meta);
    setOnline(true);
    await flushOutbox("outra-pessoa");
    expect(attendance).not.toHaveBeenCalled();
    expect(outboxItems()).toHaveLength(1);
  });

  it("sessão expirada: fica à espera do próximo início de sessão", async () => {
    setOnline(false);
    await sendOrQueue("attendance.submit", { n: 1 }, meta);
    setOnline(true);
    attendance.mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { status: 401 }));
    await flushOutbox("prof-1");
    expect(outboxItems()).toMatchObject([{ kind: "attendance.submit" }]);
    expect(outboxItems()[0]!.failedReason).toBeUndefined();
  });

  it("recusa do servidor: fica marcada, não bloqueia as seguintes e pode ser descartada", async () => {
    setOnline(false);
    await sendOrQueue("attendance.submit", { n: 1 }, meta);
    await sendOrQueue("grades.term", { n: 2 }, meta);
    setOnline(true);
    attendance.mockRejectedValueOnce(new Error("O período está fechado."));
    grades.mockResolvedValueOnce({});
    await flushOutbox("prof-1");
    expect(outboxItems()).toMatchObject([
      { kind: "attendance.submit", failedReason: "O período está fechado." },
    ]);
    await flushOutbox("prof-1");
    expect(attendance).toHaveBeenCalledTimes(1);
    await discardOutboxItem(outboxItems()[0]!.id);
    expect(outboxItems()).toHaveLength(0);
  });

  it("recusa guardar mais do que o cofre aceita, sem perder o que já estava", async () => {
    setOnline(false);
    await sendOrQueue("attendance.submit", { n: 1 }, meta);
    await expect(
      sendOrQueue("grades.term", { big: "x".repeat(OUTBOX_MAX_BYTES) }, meta),
    ).rejects.toThrow(/demasiadas alterações/);
    expect(outboxItems()).toHaveLength(1);
  });

  it("fora da app desktop não há fila: sem rede o erro chega ao ecrã", async () => {
    resetOutboxForTests({ "attendance.submit": attendance, "grades.term": grades });
    attendance.mockRejectedValueOnce(offline());
    await expect(sendOrQueue("attendance.submit", {}, meta)).rejects.toThrow("Failed to fetch");
  });
});
