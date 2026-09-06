import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";

const HR_READ_ROLES = new Set(["Administrador", "Tesouraria"]);

function isMissingHrSchema(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST205" ||
        /hr_(departments|positions|employments|contracts|payroll)|schema cache|does not exist|relation .* does not exist/i.test(
          error.message ?? "",
        )),
  );
}

async function requireHrReader(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  if (!HR_READ_ROLES.has(membership.appRole)) {
    throw new Error("Sem permissão para consultar dados de RH e folha salarial.");
  }
  return membership;
}

export type HrDashboardData = {
  ready: boolean;
  employeeCount: number;
  activeContractCount: number;
  payrollDraftCount: number;
  latestPayroll: null | {
    id: string;
    competence_year: number;
    competence_month: number;
    status: string;
    total_gross_kz: number;
    total_deductions_kz: number;
    total_net_kz: number;
  };
};

export const getHrDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HrDashboardData> => {
    const membership = await requireHrReader(context.userId);
    const db = await loadSgaAdminClient();

    const schemaProbe = await db
      .from("hr_employments")
      .select("id", { count: "exact", head: true })
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null);

    if (schemaProbe.error) {
      if (isMissingHrSchema(schemaProbe.error)) {
        return {
          ready: false,
          employeeCount: 0,
          activeContractCount: 0,
          payrollDraftCount: 0,
          latestPayroll: null,
        };
      }
      throw publicDatabaseError(schemaProbe.error, "Não foi possível validar o módulo de RH.");
    }

    const [employees, contracts, draftPayrolls, latestPayroll] = await Promise.all([
      db
        .from("hr_employments")
        .select("id", { count: "exact", head: true })
        .eq("school_id", membership.schoolId)
        .eq("status", "active")
        .is("deleted_at", null),
      db
        .from("hr_contracts")
        .select("id", { count: "exact", head: true })
        .eq("school_id", membership.schoolId)
        .eq("status", "active")
        .is("deleted_at", null),
      db
        .from("hr_payroll_runs")
        .select("id", { count: "exact", head: true })
        .eq("school_id", membership.schoolId)
        .in("status", ["draft", "calculating", "review"]),
      db
        .from("hr_payroll_runs")
        .select(
          "id, competence_year, competence_month, status, total_gross_kz, total_deductions_kz, total_net_kz",
        )
        .eq("school_id", membership.schoolId)
        .order("competence_year", { ascending: false })
        .order("competence_month", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    for (const result of [employees, contracts, draftPayrolls, latestPayroll]) {
      if (result.error) {
        throw publicDatabaseError(result.error, "Não foi possível carregar o resumo de RH.");
      }
    }

    return {
      ready: true,
      employeeCount: employees.count ?? 0,
      activeContractCount: contracts.count ?? 0,
      payrollDraftCount: draftPayrolls.count ?? 0,
      latestPayroll: latestPayroll.data
        ? {
            id: String(latestPayroll.data.id),
            competence_year: Number(latestPayroll.data.competence_year),
            competence_month: Number(latestPayroll.data.competence_month),
            status: String(latestPayroll.data.status),
            total_gross_kz: Number(latestPayroll.data.total_gross_kz ?? 0),
            total_deductions_kz: Number(latestPayroll.data.total_deductions_kz ?? 0),
            total_net_kz: Number(latestPayroll.data.total_net_kz ?? 0),
          }
        : null,
    };
  });

export const listHrPayrollRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireHrReader(context.userId);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("hr_payroll_runs")
      .select(
        "id, competence_year, competence_month, period_start, period_end, status, total_gross_kz, total_deductions_kz, total_net_kz, approved_at, paid_at",
      )
      .eq("school_id", membership.schoolId)
      .order("competence_year", { ascending: false })
      .order("competence_month", { ascending: false })
      .limit(36);

    if (error) {
      if (isMissingHrSchema(error)) return [];
      throw publicDatabaseError(error, "Não foi possível carregar as folhas salariais.");
    }
    return data ?? [];
  });
