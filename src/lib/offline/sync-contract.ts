/**
 * Contrato de sincronização da futura base local. Não efectua pedidos HTTP,
 * não abre SQLite e não transforma timeouts em ACKs. Só opera sobre metadados.
 * O servidor ainda precisa de idempotência transaccional por op_id e revisão.
 */
export type OfflineSyncContext = {
  schoolId: string;
  actorId: string;
  deviceId: string;
  authorizationExpiresAt: string;
};

export type OfflineSyncKind = "attendance.submit" | "grades.term";

export type OfflineSyncOperation = {
  opId: string;
  schoolId: string;
  actorId: string;
  deviceId: string;
  kind: OfflineSyncKind;
  expectedRevision: number;
  state: "pending" | "sending" | "acknowledged" | "conflict" | "rejected";
  createdAt: string;
};

export type OfflineSyncResolution =
  | { state: "acknowledged"; serverRevision: number }
  | { state: "conflict"; serverRevision: number }
  | { state: "rejected"; errorCode: string };

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function assertContext(ctx: OfflineSyncContext, now: number): void {
  if (!validId(ctx.schoolId) || !validId(ctx.actorId) || !validId(ctx.deviceId)) {
    throw new Error("Contexto de sincronização inválido.");
  }
  const expiresAt = Date.parse(ctx.authorizationExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new Error("Autorização offline expirada. Ligue-se para renovar a sessão.");
  }
}

function belongsToContext(op: OfflineSyncOperation, ctx: OfflineSyncContext): boolean {
  return (
    op.schoolId === ctx.schoolId &&
    op.actorId === ctx.actorId &&
    op.deviceId === ctx.deviceId
  );
}

function assertOperation(op: OfflineSyncOperation): void {
  if (
    !validId(op.opId) ||
    !validId(op.schoolId) ||
    !validId(op.actorId) ||
    !validId(op.deviceId) ||
    !validRevision(op.expectedRevision) ||
    (op.kind !== "attendance.submit" && op.kind !== "grades.term") ||
    !["pending", "sending", "acknowledged", "conflict", "rejected"].includes(op.state) ||
    !Number.isFinite(Date.parse(op.createdAt))
  ) {
    throw new Error("Operação offline inválida; requer reconciliação.");
  }
}

/**
 * A mesma op_id não pode mudar de origem: é a chave idempotente do servidor.
 * Operações em "sending" ficam fora de novos envios até confirmação remota
 * ou retorno explícito para pending após consultar o recibo no servidor.
 */
export function planOfflineSync(
  context: OfflineSyncContext,
  operations: readonly OfflineSyncOperation[],
  now: number = Date.now(),
  maxBatch = 50,
): OfflineSyncOperation[] {
  assertContext(context, now);
  if (!Number.isSafeInteger(maxBatch) || maxBatch < 1 || maxBatch > 50) {
    throw new Error("Limite inválido para sincronização.");
  }

  const seen = new Set<string>();
  const pending: OfflineSyncOperation[] = [];
  for (const operation of operations) {
    assertOperation(operation);
    if (seen.has(operation.opId)) {
      throw new Error("Identificador de operação offline duplicado.");
    }
    seen.add(operation.opId);
    if (!belongsToContext(operation, context) || operation.state !== "pending") continue;
    pending.push(operation);
  }

  return pending
    .sort((left, right) => {
      const byDate = left.createdAt.localeCompare(right.createdAt);
      return byDate || left.opId.localeCompare(right.opId);
    })
    .slice(0, maxBatch);
}

/**
 * Só uma resposta do endpoint autenticado do servidor pode ser submetida aqui.
 * Uma falha de rede/timeout não é uma resposta: a operação permanece pendente.
 * Nunca converter um conflito em ACK ou resolver "última escrita vence".
 */
export function validateOfflineSyncReply(
  context: OfflineSyncContext,
  operation: OfflineSyncOperation,
  reply: unknown,
  now: number = Date.now(),
): OfflineSyncResolution {
  assertContext(context, now);
  assertOperation(operation);
  if (!belongsToContext(operation, context)) {
    throw new Error("Operação de outra escola, conta ou dispositivo.");
  }
  if (operation.state !== "pending" && operation.state !== "sending") {
    throw new Error("A operação não está em estado de sincronização.");
  }
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) {
    throw new Error("Resposta do servidor inválida: manter operação sem confirmação.");
  }
  const data = reply as Record<string, unknown>;
  if (
    data.opId !== operation.opId ||
    data.schoolId !== context.schoolId ||
    data.actorId !== context.actorId ||
    data.deviceId !== context.deviceId
  ) {
    throw new Error("Confirmação incompatível com a origem da operação offline.");
  }
  if (data.status === "acknowledged" && validRevision(data.serverRevision)) {
    if (data.serverRevision < operation.expectedRevision) {
      throw new Error("Revisão do servidor recuou; requer reconciliação.");
    }
    return { state: "acknowledged", serverRevision: data.serverRevision };
  }
  if (data.status === "conflict" && validRevision(data.serverRevision)) {
    return { state: "conflict", serverRevision: data.serverRevision };
  }
  if (
    data.status === "rejected" &&
    typeof data.errorCode === "string" &&
    /^[A-Z_]{2,64}$/.test(data.errorCode)
  ) {
    return { state: "rejected", errorCode: data.errorCode };
  }
  throw new Error("Resposta desconhecida: manter operação para reconciliação.");
}
