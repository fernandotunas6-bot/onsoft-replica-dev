import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

const salaryRequestSchema = z.object({
  contractId: z.string().uuid(),
  requestedStepId: z.string().uuid().nullable().optional(),
  proposedBaseSalaryKz: z.number().finite().min(0).max(1_000_000_000),
  effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(10).max(1500),
});
const reviewSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(10).max(1500),
});
async function requireHrWriter(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership || !["Administrador", "Tesouraria"].includes(membership.appRole)) {
    throw new Error("Sem permissão para gerir remunerações.");
  }
  return membership;
}
/** Creates a proposal only; contract and payroll remain unchanged. */
export const requestHrSalaryChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => salaryRequestSchema.parse(input))
  .handler(async ({ context, data }) => {
    const membership = await requireHrWriter(context.userId);
    const db = await loadSgaAdminClient();
    const { data: contract, error: contractError } = await db
      .from("hr_contracts")
      .select("id,school_id,starts_on,ends_on,status")
      .eq("id", data.contractId)
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .maybeSingle();
    if (contractError)
      throw publicDatabaseError(contractError, "Não foi possível validar o contrato.");
    if (!contract || contract.status !== "active") {
      throw new Error("Contrato inexistente ou indisponível para alteração.");
    }
    if (
      data.effectiveOn < contract.starts_on ||
      (contract.ends_on && data.effectiveOn > contract.ends_on)
    ) {
      throw new Error("Data da alteração fora da vigência do contrato.");
    }
    const luandaParts = new Intl.DateTimeFormat("en", {
      timeZone: "Africa/Luanda",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const part = (type: string) => luandaParts.find((item) => item.type === type)?.value ?? "";
    const todayLuanda = `${part("year")}-${part("month")}-${part("day")}`;
    if (data.effectiveOn < todayLuanda) {
      throw new Error("Alterações retroactivas exigem um procedimento de rectificação.");
    }
    const { data: request, error } = await db
      .from("hr_salary_change_requests")
      .insert({
        school_id: membership.schoolId,
        contract_id: contract.id,
        requested_step_id: data.requestedStepId ?? null,
        proposed_base_salary_kz: data.proposedBaseSalaryKz,
        effective_on: data.effectiveOn,
        reason: data.reason,
        requested_by: context.userId,
      })
      .select("id,status")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível registar o pedido salarial.");
    return request;
  });

/** Review is separate from applying the new remuneration to a contract. */
export const reviewHrSalaryChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ context, data }) => {
    const membership = await requireHrWriter(context.userId);
    const db = await loadSgaAdminClient();
    const { data: request, error: readError } = await db
      .from("hr_salary_change_requests")
      .select("id,school_id,requested_by,status")
      .eq("id", data.requestId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (readError) throw publicDatabaseError(readError, "Não foi possível consultar o pedido.");
    if (!request || request.status !== "pending")
      throw new Error("Pedido indisponível para decisão.");
    if (request.requested_by === context.userId)
      throw new Error("Não pode aprovar o próprio pedido.");
    const { data: updated, error } = await db
      .from("hr_salary_change_requests")
      .update({
        status: data.decision,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_reason: data.reason,
      })
      .eq("id", data.requestId)
      .eq("school_id", membership.schoolId)
      .eq("status", "pending")
      .select("id,status")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível decidir o pedido.");
    if (!updated) throw new Error("O pedido já foi decidido por outro utilizador.");
    return updated;
  });
