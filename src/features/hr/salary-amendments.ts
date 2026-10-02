import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAal2 } from "@/features/hr/require-aal2";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

const inputSchema = z.object({ requestId: z.string().uuid() });

/** Apply an approved request to an effective-dated ledger; never mutate past payroll. */
export const applyApprovedHrSalaryChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ context, data }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership || membership.appRole !== "Administrador") {
      throw new Error("A aplicação salarial exige autorização administrativa.");
    }
    requireAal2(context.claims, "Aplicar uma alteração salarial");
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
    const { data, error } = await db
      .from("hr_salary_change_requests")
      .select(
        "id,contract_id,proposed_base_salary_kz,effective_on,reason,status,requested_by,reviewed_by,reviewed_at,review_reason,applied_at,created_at",
      )
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw publicDatabaseError(error, "Não foi possível carregar os pedidos salariais.");
    return data ?? [];
  });

/** Only contracts of the active school are selectable for a salary proposal. */
export const listHrContractsForSalaryChange = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership || !["Administrador", "Tesouraria"].includes(membership.appRole)) {
      throw new Error("Sem permissão para consultar contratos.");
    }
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("hr_contracts")
      .select("id,employment_id,contract_number,base_salary_kz,starts_on,ends_on,status")
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("starts_on", { ascending: false })
      .limit(200);
    if (error) throw publicDatabaseError(error, "Não foi possível consultar contratos.");
    return data ?? [];
  });

/** Read-only, school-scoped audit ledger for applied salary amendments. */
export const listHrSalaryAmendments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership || !["Administrador", "Tesouraria"].includes(membership.appRole)) {
      throw new Error("Sem permissão para consultar o histórico salarial.");
    }
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("hr_contract_salary_amendments")
      .select(
        "id,contract_id,request_id,effective_on,previous_base_salary_kz,new_base_salary_kz,salary_scale_step_id,applied_by,created_at",
      )
      .eq("school_id", membership.schoolId)
      .order("effective_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw publicDatabaseError(error, "Não foi possível consultar o histórico salarial.");
    return data ?? [];
  });
