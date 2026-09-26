/**
 * Registo em `audit_logs` das acções sobre contas e acessos.
 *
 * `audit_logs` não tem política de escrita para utilizadores: só o servidor
 * grava, com a chave de serviço, e ninguém apaga nem altera o que ficou. Falha
 * em silêncio (com log): a auditoria não deve impedir uma acção que já
 * aconteceu.
 */
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

export type AccessAuditEntry = {
  schoolId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

export async function recordAccessAudit(entry: AccessAuditEntry): Promise<void> {
  try {
    const db = await loadSgaAdminClient();
    const { error } = await db.from("audit_logs").insert({
      school_id: entry.schoolId,
      actor_user_id: entry.actorUserId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      metadata: entry.metadata ?? {},
    });
    if (error) console.error(`[audit] ${entry.action}:`, error.message);
  } catch (error) {
    console.error(`[audit] ${entry.action}:`, error);
  }
}
