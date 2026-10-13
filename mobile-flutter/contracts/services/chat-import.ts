import type { Context, Message } from "../domain/model";
// Projection of SIGA chat-server MessageRow. Feed must be authorized server-side.
export interface SigaDirectThread {
  schoolId: string;
  memberIds: string[];
  messages: {
    id: string;
    sender_id: string;
    body?: string | null;
    created_at: string;
    deleted_at?: string | null;
  }[];
}
export function importSigaDirectMessages(ctx: Context, threads: SigaDirectThread[]): Message[] {
  const out: Message[] = [];
  const seen = new Set<string>();
  for (const thread of threads) {
    if (
      thread.schoolId !== ctx.schoolId ||
      thread.memberIds.length !== 2 ||
      !thread.memberIds.includes(ctx.userId)
    )
      throw new Error("Conversa fora do contexto autorizado.");
    const peer = thread.memberIds.find((id) => id !== ctx.userId);
    if (!peer) throw new Error("Participantes inválidos.");
    for (const m of thread.messages) {
      if (!thread.memberIds.includes(m.sender_id)) throw new Error("Remetente fora da conversa.");
      if (m.deleted_at) continue;
      if (!m.id || !Number.isFinite(Date.parse(m.created_at)) || typeof m.body !== "string")
        throw new Error("Mensagem inválida.");
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({
        id: m.id,
        from: m.sender_id,
        to: m.sender_id === ctx.userId ? peer : ctx.userId,
        text: m.body,
        sentAt: m.created_at,
      });
    }
  }
  return out.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}
