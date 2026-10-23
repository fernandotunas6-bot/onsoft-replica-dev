import { useSyncExternalStore } from "react";
import { isSessionError } from "@/lib/session-expiry";

/**
 * Fila de envio sem rede (app desktop).
 *
 * Presenças e notas lançadas sem rede ficam aqui, no cofre do posto (cifrado com o
 * PIN), e seguem para o servidor quando a rede volta. Diferente das mutações em pausa
 * do TanStack Query, que vivem só em memória:
 *  - sobrevive a fechar a app e ao fim de sessão por inactividade;
 *  - cada envio guarda quem o fez e só sai com a sessão dessa pessoa;
 *  - só sai da fila quando o servidor confirma; um erro de rede deixa-o à espera e um
 *    erro de sessão espera pelo próximo início de sessão. Uma recusa do servidor fica
 *    visível («Descartar») em vez de desaparecer.
 *
 * Só para escritas que o servidor aceita repetir sem duplicar (chamada: upsert por
 * sessão e aluno; notas: actualiza a nota que já existe). Pagamentos não: o registo
 * não tem ainda chave contra repetições.
 *
 * Fora da app desktop (navegador, PWA), a fila fica desligada e tudo funciona como
 * antes: grava com rede, falha sem ela.
 */

export type OutboxKind = "attendance.submit" | "grades.term";

export type OutboxItem = {
  id: string;
  kind: OutboxKind;
  userId: string;
  /** Texto para o professor reconhecer o envio («Chamada 7ª A, 06/10»). */
  label: string;
  variables: unknown;
  createdAt: string;
  /** Mensagem do servidor quando recusou; o envio fica parado até ser descartado. */
  failedReason?: string;
};

export type OutboxStorage = {
  load(): Promise<OutboxItem[]>;
  save(items: OutboxItem[]): Promise<void>;
};

type Sender = (variables: unknown) => Promise<unknown>;

const SENDERS: Record<OutboxKind, Sender> = {
  "attendance.submit": async (variables) => {
    const { submitAttendanceCallBatch } = await import("@/features/pedagogica/attendance-server");
    return submitAttendanceCallBatch({ data: variables as never });
  },
  "grades.term": async (variables) => {
    const { upsertTermGradesBatch } = await import("@/features/academic/server");
    return upsertTermGradesBatch({ data: variables as never });
  },
};

/** O cofre aceita até 64 KiB por valor; fica uma margem. */
export const OUTBOX_MAX_BYTES = 60 * 1024;
const VAULT_KEY = "siga.offline-outbox";

let storage: OutboxStorage | null = null;
let items: OutboxItem[] = [];
let flushing: Promise<void> | null = null;
const listeners = new Set<() => void>();
let senders: Record<OutboxKind, Sender> = SENDERS;

function emit() {
  for (const listener of listeners) listener();
}

/** Liga a fila a um armazenamento (o cofre do posto) e carrega o que lá ficou. */
export async function enableOutbox(next: OutboxStorage) {
  storage = next;
  items = await next.load();
  emit();
}

/** Armazenamento no cofre do posto (valor JSON numa só chave). */
export function vaultOutboxStorage(vault: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}): OutboxStorage {
  return {
    async load() {
      const raw = await vault.getItem(VAULT_KEY);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
      } catch {
        return [];
      }
    },
    async save(next) {
      if (next.length === 0) await vault.removeItem(VAULT_KEY);
      else await vault.setItem(VAULT_KEY, JSON.stringify(next));
    },
  };
}

export function isOutboxEnabled() {
  return storage !== null;
}

async function persist(next: OutboxItem[]) {
  if (!storage) throw new Error("A fila de envio sem rede não está disponível.");
  if (new TextEncoder().encode(JSON.stringify(next)).length > OUTBOX_MAX_BYTES) {
    throw new Error(
      "Há demasiadas alterações por enviar para guardar neste computador. Ligue-se à Internet para as enviar.",
    );
  }
  await storage.save(next);
  items = next;
  emit();
}

/** Falha de rede (sem resposta do servidor), por oposição a uma recusa do servidor. */
export function isNetworkError(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    error instanceof TypeError && /fetch|network|load failed|internet|connection/i.test(message)
  );
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Envia já; sem rede (ou se a rede falhar no envio), guarda na fila do posto.
 * Sem fila (fora da app desktop), comporta-se como o envio directo.
 */
export async function sendOrQueue(
  kind: OutboxKind,
  variables: unknown,
  meta: { label: string; userId: string | null },
): Promise<{ queued: false; result: unknown } | { queued: true }> {
  const queueIt = async () => {
    if (!meta.userId) throw new Error("Sem sessão: não é possível guardar para enviar depois.");
    await persist([
      ...items,
      {
        id: newId(),
        kind,
        userId: meta.userId,
        label: meta.label,
        variables,
        createdAt: new Date().toISOString(),
      },
    ]);
    return { queued: true } as const;
  };
  if (storage && typeof navigator !== "undefined" && navigator.onLine === false) {
    return queueIt();
  }
  try {
    return { queued: false, result: await senders[kind](variables) };
  } catch (error) {
    if (storage && isNetworkError(error)) return queueIt();
    throw error;
  }
}

/**
 * Envia, por ordem, o que está na fila desta pessoa. Pára no primeiro erro de rede
 * ou de sessão; uma recusa do servidor marca o envio e passa ao seguinte.
 */
export function flushOutbox(userId: string | null): Promise<void> {
  if (!storage || !userId) return Promise.resolve();
  flushing ??= (async () => {
    try {
      for (const item of items.filter((entry) => entry.userId === userId && !entry.failedReason)) {
        try {
          await senders[item.kind](item.variables);
          await persist(items.filter((entry) => entry.id !== item.id));
        } catch (error) {
          if (isNetworkError(error) || isSessionError(error)) return;
          const reason = error instanceof Error ? error.message : "O servidor recusou o envio.";
          await persist(
            items.map((entry) =>
              entry.id === item.id ? { ...entry, failedReason: reason } : entry,
            ),
          );
        }
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Retira da fila um envio recusado pelo servidor (depois de o ler). */
export async function discardOutboxItem(id: string) {
  await persist(items.filter((entry) => entry.id !== id));
}

export function outboxItems(): readonly OutboxItem[] {
  return items;
}

export function subscribeOutbox(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** `{ waiting, failed }` da fila, para o aviso de ligação. */
export function useOutbox() {
  const snapshot = useSyncExternalStore(
    subscribeOutbox,
    () => items,
    () => items,
  );
  return {
    items: snapshot,
    waiting: snapshot.filter((entry) => !entry.failedReason).length,
    failed: snapshot.filter((entry) => entry.failedReason),
  };
}

/** Só para testes. */
export function resetOutboxForTests(nextSenders: Record<OutboxKind, Sender> = SENDERS) {
  storage = null;
  items = [];
  flushing = null;
  senders = nextSenders;
  listeners.clear();
}
