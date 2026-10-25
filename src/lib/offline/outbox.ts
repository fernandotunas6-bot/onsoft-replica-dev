import { useSyncExternalStore } from "react";
import { isSessionError } from "@/lib/session-expiry";
import { readStoredActiveSchool } from "@/features/auth/active-school";

/**
 * Fila de envio sem rede (app desktop).
 *
 * Presenças e notas lançadas sem rede ficam aqui, no cofre do posto (cifrado com o
 * PIN), e seguem para o servidor quando a rede volta. Diferente das mutações em pausa
 * do TanStack Query, que vivem só em memória:
 *  - sobrevive a fechar a app e ao fim de sessão por inactividade;
 *  - cada envio guarda quem o fez e só sai com a sessão dessa pessoa;
 *  - só sai da fila quando o servidor confirma. Após perder uma resposta de rede
 *    ou fechar a app durante um envio, o resultado fica INCERTO e bloqueado para
 *    reconciliação humana, nunca reenviado automaticamente sem recibo idempotente.
 *    Um erro de sessão anterior ao envio confirmado mantém a entrada pendente.
 *
 * O servidor ainda não oferece recibos transaccionais por op_id; upserts não
 * garantem idempotência de todo o workflow. Pagamentos ficam excluídos.
 *
 * Fora da app desktop (navegador, PWA), a fila fica desligada e tudo funciona como
 * antes: grava com rede, falha sem ela.
 */

export type OutboxKind = "attendance.submit" | "grades.term";

export type OutboxItem = {
  id: string;
  kind: OutboxKind;
  userId: string;
  /** Escola de origem; ausente apenas nas entradas legadas. */
  schoolId?: string;
  /** Texto para o professor reconhecer o envio («Chamada 7ª A, 06/10»). */
  label: string;
  variables: unknown;
  createdAt: string;
  /** Estado de entrega persistido antes de iniciar o HTTP; ausência = pendente legado. */
  deliveryState?: "pending" | "sending" | "needs_verification";
  /** Recusa explícita ou confirmação ambígua, preservada até revisão. */
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

/** A resposta pode ter-se perdido depois de o servidor concluir o lançamento. */
export const OUTBOX_UNCERTAIN_MESSAGE =
  "Não foi possível confirmar se o servidor já guardou esta operação. Não reenvie nem descarte antes de a secretaria confirmar o estado no SIGA.";

let storage: OutboxStorage | null = null;
let items: OutboxItem[] = [];
let flushing: Promise<void> | null = null;
/** Serializa persistências para impedir que dois lançamentos concorrentes se percam. */
let persistenceQueue: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
let senders: Record<OutboxKind, Sender> = SENDERS;

function emit() {
  for (const listener of listeners) listener();
}

/** Liga a fila a um armazenamento (o cofre do posto) e carrega o que lá ficou. */
export async function enableOutbox(next: OutboxStorage) {
  // Só activar depois de ler o cofre: nunca sobrescrever uma fila persistida
  // com uma fila vazia quando o carregamento falha.
  await persistenceQueue;
  const loaded = await next.load();
  // Se a aplicação fechou durante o envio, a última gravação confirmada no
  // cofre era "sending". Tratar o resultado como incerto, nunca fazer replay.
  const recovered = loaded.map((item) =>
    item.deliveryState === "sending"
      ? {
          ...item,
          deliveryState: "needs_verification" as const,
          failedReason: OUTBOX_UNCERTAIN_MESSAGE,
        }
      : item,
  );
  if (recovered.some((item, i) => item !== loaded[i])) {
    await next.save(recovered);
  }
  storage = next;
  items = recovered;
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
        if (
          !Array.isArray(parsed) ||
          !parsed.every(
            (item) =>
              item &&
              typeof item === "object" &&
              typeof item.id === "string" &&
              typeof item.userId === "string" &&
              (item.schoolId === undefined ||
                (typeof item.schoolId === "string" && item.schoolId.length > 0)) &&
              typeof item.label === "string" &&
              (item.deliveryState === undefined ||
                item.deliveryState === "pending" ||
                item.deliveryState === "sending" ||
                item.deliveryState === "needs_verification") &&
              (item.kind === "attendance.submit" || item.kind === "grades.term"),
          )
        ) {
          throw new Error("formato inválido");
        }
        return parsed as OutboxItem[];
      } catch {
        // Falhar fechado: um cofre danificado NÃO equivale a uma fila vazia.
        throw new Error(
          "A fila offline guardada neste computador não pôde ser lida. Não a substitua; peça assistência para recuperar os lançamentos.",
        );
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

/** A transformação lê sempre a última versão confirmada da fila. */
function mutateItems(change: (current: OutboxItem[]) => OutboxItem[]): Promise<void> {
  const task = persistenceQueue.then(() => persist(change(items)));
  // Um erro de gravação não deve bloquear permanentemente as próximas tentativas.
  persistenceQueue = task.catch(() => undefined);
  return task;
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
  meta: { label: string; userId: string | null; schoolId: string | null },
): Promise<{ queued: false; result: unknown } | { queued: true; requiresVerification: boolean }> {
  // Fora do Tauri (navegador/PWA), manter o contrato do servidor sem cofre.
  if (!storage) {
    return { queued: false, result: await senders[kind](variables) };
  }

  if (!meta.userId) throw new Error("Sem sessão: não é possível guardar um lançamento.");
  if (!meta.schoolId) {
    throw new Error(
      "Seleccione uma escola antes de guardar. A operação não pode ficar sem instituição.",
    );
  }

  const staged: OutboxItem = {
    id: newId(),
    kind,
    userId: meta.userId,
    schoolId: meta.schoolId,
    label: meta.label,
    variables,
    createdAt: new Date().toISOString(),
    deliveryState:
      typeof navigator !== "undefined" && navigator.onLine === false ? "pending" : "sending",
  };
  // Write-ahead: nenhuma requisição sai antes do cofre confirmar o lançamento.
  // Se falhar a escrita, o servidor NÃO é chamado.
  await mutateItems((current) => [...current, staged]);
  if (staged.deliveryState === "pending") {
    return { queued: true, requiresVerification: false };
  }

  try {
    const result = await senders[kind](variables);
    // ACK recebido: só concluir após remover persistentemente do cofre.
    await mutateItems((current) => current.filter((entry) => entry.id !== staged.id));
    return { queued: false, result };
  } catch (error) {
    if (isNetworkError(error)) {
      await mutateItems((current) =>
        current.map((entry) =>
          entry.id === staged.id
            ? {
                ...entry,
                deliveryState: "needs_verification",
                failedReason: OUTBOX_UNCERTAIN_MESSAGE,
              }
            : entry,
        ),
      );
      return { queued: true, requiresVerification: true };
    }
    // Recusa explícita do servidor: preservar a semântica anterior de erro
    // para o formulário; o registo no cofre só é retirado após a resposta.
    await mutateItems((current) => current.filter((entry) => entry.id !== staged.id));
    throw error;
  }
}

/**
 * Envia, por ordem, o que está na fila desta pessoa. Pára no primeiro erro de rede
 * ou de sessão; uma recusa do servidor marca o envio e passa ao seguinte.
 */
export function flushOutbox(userId: string | null, schoolId: string | null): Promise<void> {
  if (!storage || !userId || !schoolId) return Promise.resolve();
  // Uma tentativa sem entradas é válida. O antigo `??=` com `finally`
  // síncrono deixava uma Promise concluída presa em `flushing`.
  const previous = flushing;
  const run = async () => {
    // Entradas legadas sem escola nunca são transmitidas automaticamente.
    for (const item of items.filter(
      (entry) =>
        entry.userId === userId &&
        entry.schoolId === schoolId &&
        !entry.failedReason &&
        (entry.deliveryState === undefined || entry.deliveryState === "pending"),
    )) {
      if (!items.some((entry) => entry.id === item.id)) continue;
      // A escola pode mudar enquanto a tentativa anterior estava em curso.
      if (typeof window !== "undefined" && readStoredActiveSchool() !== schoolId) return;
      if (!item.variables || typeof item.variables !== "object" || Array.isArray(item.variables)) {
        await mutateItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, failedReason: "Os dados guardados são inválidos." }
              : entry,
          ),
        );
        continue;
      }
      // Commit local ANTES do HTTP. Se a app fechar no meio, o cofre conserva
      // "sending" e o próximo arranque exige verificação manual do recibo.
      await mutateItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, deliveryState: "sending" } : entry,
        ),
      );
      try {
        await senders[item.kind]({
          ...item.variables,
          offlineSchoolId: item.schoolId,
          offlineActorId: item.userId,
        });
        // Só apaga após ACK e persistência bem-sucedida no cofre.
        await mutateItems((current) => current.filter((entry) => entry.id !== item.id));
      } catch (error) {
        if (isSessionError(error)) {
          await mutateItems((current) =>
            current.map((entry) =>
              entry.id === item.id ? { ...entry, deliveryState: "pending" } : entry,
            ),
          );
          return;
        }
        if (isNetworkError(error)) {
          await mutateItems((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    deliveryState: "needs_verification",
                    failedReason: OUTBOX_UNCERTAIN_MESSAGE,
                  }
                : entry,
            ),
          );
          return;
        }
        const reason = error instanceof Error ? error.message : "O servidor recusou o envio.";
        await mutateItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, deliveryState: "needs_verification", failedReason: reason }
              : entry,
          ),
        );
      }
    }
  };
  // Tentativas concorrentes, mesmo para escolas diferentes, não sobrepõem envios.
  // Depois da primeira terminar, a próxima verifica o contexto da escola de novo.
  const task = (previous ?? Promise.resolve()).catch(() => undefined).then(run);
  flushing = task;
  void task.then(
    () => {
      if (flushing === task) flushing = null;
    },
    () => {
      if (flushing === task) flushing = null;
    },
  );
  return task;
}

/**
 * Nunca descartar um lançamento "sending" ou cuja confirmação é incerta:
 * mesmo um erro remoto pode ter sido recebido depois de uma escrita concluída.
 * Só a futura reconciliação idempotente do servidor poderá limpar esse estado.
 */
export async function discardOutboxItem(id: string) {
  const current = items.find((entry) => entry.id === id);
  if (current?.deliveryState === "sending" || current?.deliveryState === "needs_verification") {
    throw new Error(
      "O lançamento precisa de confirmação no servidor antes de ser retirado do cofre.",
    );
  }
  await mutateItems((entries) => entries.filter((entry) => entry.id !== id));
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
    waiting: snapshot.filter(
      (entry) => !entry.failedReason && entry.deliveryState !== "needs_verification",
    ).length,
    failed: snapshot.filter((entry) => entry.failedReason),
    legacy: snapshot.filter((entry) => !entry.schoolId),
  };
}

/** Só para testes. */
export function resetOutboxForTests(nextSenders: Record<OutboxKind, Sender> = SENDERS) {
  storage = null;
  items = [];
  flushing = null;
  persistenceQueue = Promise.resolve();
  senders = nextSenders;
  listeners.clear();
}
