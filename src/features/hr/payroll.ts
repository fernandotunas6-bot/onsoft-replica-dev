import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  assertModuleNotBlocked,
  loadSgaAdminClient,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import type { Json } from "@/integrations/supabase/types";
import { createPayrollRunInputSchema, payrollRunIdInputSchema } from "@/features/hr/schemas";

const PAYROLL_ROLES = new Set(["Administrador", "Tesouraria"]);

async function requirePayrollAdmin(userId: string, mode: "read" | "write" = "read") {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  if (!PAYROLL_ROLES.has(membership.appRole)) {
    throw new Error("Sem permissão para processar a folha salarial.");
  }
  // Permissões por módulo (Nenhum/Leitura) também valem no RH.
  await assertModuleNotBlocked(membership.schoolId, userId, "financeiro", mode);
  return membership;
}

function missingPayrollSchema(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /hr_payroll|hr_employments|hr_contracts|schema cache|does not exist/i.test(
        error.message ?? "",
      )),
  );
}

export const createPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createPayrollRunInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePayrollAdmin(context.userId, "write");
    const { data: result, error } = await context.supabase.rpc("hr_create_payroll_run", {
      p_year: data.year,
      p_month: data.month,
      // `p_notes` tem DEFAULT NULL na base; omitir é o mesmo que passar NULL.
      p_notes: data.notes || undefined,
    });
    if (error) throw publicDatabaseError(error, "Não foi possível criar a competência salarial.");
    return result;
  });

export const calculatePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => payrollRunIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePayrollAdmin(context.userId, "write");
    const { data: result, error } = await context.supabase.rpc("hr_calculate_payroll_run", {
      p_payroll_run_id: data.payrollRunId,
    });
    if (error) throw publicDatabaseError(error, "Não foi possível calcular a folha salarial.");
    const row = Array.isArray(result) ? result[0] : result;
    return row ?? null;
  });

export const approvePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => payrollRunIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePayrollAdmin(context.userId, "write");
    const { data: result, error } = await context.supabase.rpc("hr_approve_payroll_run", {
      p_payroll_run_id: data.payrollRunId,
    });
    if (error) throw publicDatabaseError(error, "Não foi possível aprovar a folha salarial.");
    return result;
  });

export type PayrollItemReviewRow = {
  id: string;
  employmentId: string;
  personName: string;
  employeeNumber: string | null;
  salaryType: string | null;
  remunerationModel: string | null;
  baseAmountKz: number;
  hourlyAmountKz: number;
  allowancesKz: number;
  bonusesKz: number;
  overtimeKz: number;
  deductionsKz: number;
  grossAmountKz: number;
  netAmountKz: number;
  status: string;
  calculationDetails: Record<string, Json>;
};

export const getPayrollRunDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => payrollRunIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requirePayrollAdmin(context.userId);
    const db = await loadSgaAdminClient();

    const { data: run, error: runError } = await db
      .from("hr_payroll_runs")
      .select(
        "id, competence_year, competence_month, period_start, period_end, status, total_gross_kz, total_deductions_kz, total_net_kz, approved_at, approved_by, notes",
      )
      .eq("id", data.payrollRunId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (runError) {
      if (missingPayrollSchema(runError)) return null;
      throw publicDatabaseError(runError, "Não foi possível carregar a folha salarial.");
    }
    if (!run) return null;

    const { data: items, error: itemsError } = await db
      .from("hr_payroll_items")
      .select(
        "id, employment_id, contract_id, base_amount_kz, hourly_amount_kz, allowances_kz, bonuses_kz, overtime_kz, deductions_kz, gross_amount_kz, net_amount_kz, status, calculation_details",
      )
      .eq("payroll_run_id", data.payrollRunId)
      .eq("school_id", membership.schoolId)
      .order("net_amount_kz", { ascending: false });
    if (itemsError)
      throw publicDatabaseError(itemsError, "Não foi possível carregar os itens da folha.");

    const employmentIds = [...new Set((items ?? []).map((row) => String(row.employment_id)))];
    const contractIds = [
      ...new Set(
        (items ?? [])
          .map((row) => row.contract_id && String(row.contract_id))
          .filter(Boolean) as string[],
      ),
    ];

    let employments: Array<Record<string, unknown>> = [];
    if (employmentIds.length) {
      const response = await db
        .from("hr_employments")
        .select("id, person_id, employee_number")
        .eq("school_id", membership.schoolId)
        .in("id", employmentIds);
      if (response.error)
        throw publicDatabaseError(
          response.error,
          "Não foi possível carregar os vínculos da folha.",
        );
      employments = (response.data ?? []) as Array<Record<string, unknown>>;
    }

    const personIds = [...new Set(employments.map((row) => String(row.person_id)))];
    let people: Array<Record<string, unknown>> = [];
    if (personIds.length) {
      const response = await db
        .from("people")
        .select("id, full_name")
        .eq("school_id", membership.schoolId)
        .in("id", personIds);
      if (response.error)
        throw publicDatabaseError(response.error, "Não foi possível carregar as pessoas da folha.");
      people = (response.data ?? []) as Array<Record<string, unknown>>;
    }

    let contracts: Array<Record<string, unknown>> = [];
    if (contractIds.length) {
      const response = await db
        .from("hr_contracts")
        .select("id, salary_type")
        .eq("school_id", membership.schoolId)
        .in("id", contractIds);
      if (response.error)
        throw publicDatabaseError(
          response.error,
          "Não foi possível carregar os contratos da folha.",
        );
      contracts = (response.data ?? []) as Array<Record<string, unknown>>;
    }

    let policies: Array<Record<string, unknown>> = [];
    if (contractIds.length) {
      const response = await db
        .from("hr_contract_remuneration_policies")
        .select("contract_id, remuneration_model")
        .eq("school_id", membership.schoolId)
        .in("contract_id", contractIds)
        .eq("active", true);
      if (!response.error) policies = (response.data ?? []) as Array<Record<string, unknown>>;
    }

    const employmentMap = new Map(employments.map((row) => [String(row.id), row]));
    const peopleMap = new Map(people.map((row) => [String(row.id), String(row.full_name ?? "")]));
    const contractMap = new Map(contracts.map((row) => [String(row.id), row]));
    const policyMap = new Map(policies.map((row) => [String(row.contract_id), row]));

    const reviewItems: PayrollItemReviewRow[] = (items ?? []).map((row) => {
      const employment = employmentMap.get(String(row.employment_id));
      const contractId = row.contract_id ? String(row.contract_id) : null;
      return {
        id: String(row.id),
        employmentId: String(row.employment_id),
        personName: employment
          ? peopleMap.get(String(employment.person_id)) || "Pessoa sem nome"
          : "Pessoa não encontrada",
        employeeNumber: employment?.employee_number ? String(employment.employee_number) : null,
        salaryType: contractId
          ? String(contractMap.get(contractId)?.salary_type ?? "") || null
          : null,
        remunerationModel: contractId
          ? String(policyMap.get(contractId)?.remuneration_model ?? "") || null
          : null,
        baseAmountKz: Number(row.base_amount_kz ?? 0),
        hourlyAmountKz: Number(row.hourly_amount_kz ?? 0),
        allowancesKz: Number(row.allowances_kz ?? 0),
        bonusesKz: Number(row.bonuses_kz ?? 0),
        overtimeKz: Number(row.overtime_kz ?? 0),
        deductionsKz: Number(row.deductions_kz ?? 0),
        grossAmountKz: Number(row.gross_amount_kz ?? 0),
        netAmountKz: Number(row.net_amount_kz ?? 0),
        status: String(row.status),
        calculationDetails: (row.calculation_details ?? {}) as Record<string, Json>,
      };
    });

    return {
      run: {
        id: String(run.id),
        competenceYear: Number(run.competence_year),
        competenceMonth: Number(run.competence_month),
        periodStart: String(run.period_start),
        periodEnd: String(run.period_end),
        status: String(run.status),
        totalGrossKz: Number(run.total_gross_kz ?? 0),
        totalDeductionsKz: Number(run.total_deductions_kz ?? 0),
        totalNetKz: Number(run.total_net_kz ?? 0),
        approvedAt: run.approved_at ? String(run.approved_at) : null,
        notes: run.notes ? String(run.notes) : null,
      },
      items: reviewItems,
    };
  });
