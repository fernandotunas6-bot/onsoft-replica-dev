import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

const inputSchema = z.object({ requestId: z.string().uuid() });

/** Apply an approved request to an effective-dated ledger; never mutate past payroll. */
export const applyApprovedHrSalaryChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(inputSchema)
  .handler(async ({ context, data }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership || membership.appRole !== "Administrador") {
      throw new Error("A aplicação salarial exige autorização administrativa.");
    }
    const db = await loadSgaAdminClient();
    const { data: amendmentId, error } = await db.rpc("hr_apply_approved_salary_change", {
      p_request_id: data.requestId,
      p_school_id: membership.schoolId,
      p_actor_id: context.userId,
    });
    if (error) throw publicDatabaseError(error, "Não foi possível aplicar a alteração salarial.");
    if (!amendmentId) throw new Error("Não foi possível confirmar a alteração salarial.");
    return { amendmentId: String(amendmentId), applied: true };
  });

export const listHrSalaryChangeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership || !["Administrador", "Tesouraria"].includes(membership.appRole)) {
      throw new Error("Sem permissão para consultar pedidos salariais.");
    }
    const db = await loadSgaAdminClient();
    const { data, error } = await db.from("hr_salary_change_requests")
      .select("id,contract_id,proposed_base_salary_kz,effective_on,reason,status,requested_by,reviewed_by,reviewed_at,review_reason,applied_at,created_at")
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw publicDatabaseError(error, "Não foi possível carregar os pedidos salariais.");
    return data ?? [];
  });
