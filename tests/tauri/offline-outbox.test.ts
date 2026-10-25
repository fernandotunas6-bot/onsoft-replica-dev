import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { activeSchool } = vi.hoisted(() => ({ activeSchool: { id: "school-a" } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/features/auth/active-school", () => ({
  readStoredActiveSchool: () => activeSchool.id,
}));

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
  activeSchool.id = "school-a";
  vault.clear();
  attendance.mockReset();
  grades.mockReset();
  setOnline(true);
  resetOutboxForTests({ "attendance.submit": attendance, "grades.term": grades });
  await enableOutbox(vaultOutboxStorage(fakeVault));
});
afterEach(() => setOnline(true));

const meta = { label: "Chamada 7ª A", userId: "prof-1", schoolId: "school-a" };

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
      {
        kind: "attendance.submit",
        userId: "prof-1",
        schoolId: "school-a",
        label: "Chamada 7ª A",
      },
    ]);
  });

  it("não perde chamadas concorrentes durante a gravação do cofre", async () => {
    setOnline(false);
    await Promise.all([
      sendOrQueue("attendance.submit", { n: 1 }, meta),
      sendOrQueue("attendance.submit", { n: 2 }, meta),
      sendOrQueue("grades.term", { n: 3 }, meta),
    ]);
    expect(outboxItems()).toHaveLength(3);
    const persisted = JSON.parse(vault.get("siga.offline-outbox")!) as OutboxItem[];
    expect(persisted.map((item) => (item.variables as { n: number }).n)).toEqual([1, 2, 3]);
  });

  it("cofre corrompido não pode ser silenciosamente substituído por fila vazia", async () => {
    vault.set("siga.offline-outbox", "{incompleto");
    await expect(enableOutbox(vaultOutboxStorage(fakeVault))).rejects.toThrow(/não pôde ser lida/);
    expect(vault.get("siga.offline-outbox")).toBe("{incompleto");
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
    await sendOrQueue(
      "grades.term",
      { subjectId: "m1" },
      { label: "Pauta", userId: "prof-1", schoolId: "school-a" },
    );
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
    await flushOutbox("prof-1", "school-a");
    expect(attendance).toHaveBeenCalledWith({
      n: 1,
      offlineSchoolId: "school-a",
      offlineActorId: "prof-1",
    });
    expect(outboxItems()).toMatchObject([{ kind: "grades.term" }]);

    grades.mockResolvedValueOnce({});
    await flushOutbox("prof-1", "school-a");
    expect(outboxItems()).toHaveLength(0);
    expect(vault.has("siga.offline-outbox")).toBe(false);
  });

  it("só envia com a sessão de quem fez o lançamento", async () => {
    setOnline(false);
    await sendOrQueue("attendance.submit", { n: 1 }, meta);
    setOnline(true);
    await flushOutbox("outra-pessoa", "school-a");
    expect(attendance).not.toHaveBeenCalled();
    expect(outboxItems()).toHaveLength(1);
  });

  it("não envia para outra escola, mesmo com o mesmo professor", async () => {
    setOnline(false);
    await sendOrQueue("attendance.submit", { n: 7 }, { ...meta, schoolId: "school-b" });
    setOnline(true);
    await flushOutbox("prof-1", "school-a");
    expect(attendance).not.toHaveBeenCalled();
    expect(outboxItems()).toHaveLength(1);

    attendance.mockResolvedValueOnce({});
    activeSchool.id = "school-b";
    await flushOutbox("prof-1", "school-b");
    expect(attendance).toHaveBeenCalledWith({
      n: 7,
      offlineSchoolId: "school-b",
      offlineActorId: "prof-1",
    });
    expect(outboxItems()).toHaveLength(0);
  });

  it("não bloqueia uma tentativa nova após uma anterior sem operações", async () => {
    setOnline(true);
    await flushOutbox("prof-1", "school-a");
    setOnline(false);
    await sendOrQueue("attendance.submit", { n: 8 }, meta);
    setOnline(true);
    attendance.mockResolvedValueOnce({});
    await flushOutbox("prof-1", "school-a");
    expect(attendance).toHaveBeenCalledTimes(1);
    expect(outboxItems()).toHaveLength(0);
  });

  it("serializa duas sincronizações solicitadas ao mesmo tempo", async () => {
    setOnline(false);
    await sendOrQueue("attendance.submit", { n: 9 }, meta);
    setOnline(true);
    attendance.mockResolvedValueOnce({});
    await Promise.all([
      flushOutbox("prof-1", "school-a"),
      flushOutbox("prof-1", "school-a"),
    ]);
    expect(attendance).toHaveBeenCalledTimes(1);
    expect(outboxItems()).toHaveLength(0);
  });

  it("sem escola activa recusa guardar sem rede", async () => {
    setOnline(false);
    await expect(
      sendOrQueue("attendance.submit", { n: 1 }, { ...meta, schoolId: null }),
    ).rejects.toThrow(/Seleccione uma escola/);
    expect(outboxItems()).toHaveLength(0);
  });

  it("preserva lançamentos legados sem escola, sem sincronizar nem apagar", async () => {
    const legacy: OutboxItem[] = [
      {
        id: "legacy-1",
        kind: "attendance.submit",
        userId: "prof-1",
        label: "Chamada antiga",
        variables: { n: 1 },
        createdAt: "2026-10-01T08:00:00.000Z",
      },
    ];
    vault.set("siga.offline-outbox", JSON.stringify(legacy));
    await enableOutbox(vaultOutboxStorage(fakeVault));
    await flushOutbox("prof-1", "school-a");
    expect(attendance).not.toHaveBeenCalled();
    expect(outboxItems()).toEqual(legacy);
    expect(vault.get("siga.offline-outbox")).toBe(JSON.stringify(legacy));
  });

  it("sessão expirada: fica à espera do próximo início de sessão", async () => {
    setOnline(false);
    await sendOrQueue("attendance.submit", { n: 1 }, meta);
    setOnline(true);
    attendance.mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { status: 401 }));
    await flushOutbox("prof-1", "school-a");
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
    await flushOutbox("prof-1", "school-a");
    expect(outboxItems()).toMatchObject([
      { kind: "attendance.submit", failedReason: "O período está fechado." },
    ]);
    await flushOutbox("prof-1", "school-a");
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
