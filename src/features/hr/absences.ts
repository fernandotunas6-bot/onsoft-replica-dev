import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  assertModuleNotBlocked,
  loadSgaAdminClient,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { requireAal2 } from "@/features/hr/require-aal2";
import {
  hrAbsenceTypeSchema,
  reviewHrAbsenceInputSchema,
  type HrAbsenceType,
  type HrRemunerationModel,
  type HrValidationStatus,
} from "@/features/hr/schemas";

const ABSENCE_ADMIN_ROLES = new Set(["Administrador", "Tesouraria"]);

async function requireAbsenceAdmin(userId: string, mode: "read" | "write" = "read") {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  if (!ABSENCE_ADMIN_ROLES.has(membership.appRole)) {
    throw new Error("Sem permissão para rever faltas e assiduidade.");
  }
  // Permissões por módulo (Nenhum/Leitura) também valem no RH.
  await assertModuleNotBlocked(membership.schoolId, userId, "financeiro", mode);
  return membership;
}

function missingAbsenceSchema(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /hr_absence_events|hr_contract_remuneration_policies|schema cache|does not exist/i.test(
        error.message ?? "",
      )),
  );
}

export type HrAbsenceReviewRow = {
  id: string;
  employmentId: string;
  contractId: string | null;
  personName: string;
  employeeNumber: string | null;
  absenceDate: string;
  absenceType: HrAbsenceType;
  durationMinutes: number;
  reason: string | null;
  evidenceRef: string | null;
  validationStatus: HrValidationStatus;
  estimatedDeductionKz: number | null;
  remunerationModel: HrRemunerationModel | null;
};

export const listHrAbsencesForReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HrAbsenceReviewRow[]> => {
    const membership = await requireAbsenceAdmin(context.userId);
    const db = await loadSgaAdminClient();

    const { data: absences, error } = await db
      .from("hr_absence_events")
      .select(
        "id, employment_id, contract_id, absence_date, absence_type, duration_minutes, deduction_multiplier, reason, evidence_ref, validation_status",
      )
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .order("absence_date", { ascending: false })
      .limit(250);

    if (error) {
      if (missingAbsenceSchema(error)) return [];
      throw publicDatabaseError(error, "Não foi possível carregar as faltas.");
    }
    if (!absences?.length) return [];

    const employmentIds = [...new Set(absences.map((row) => String(row.employment_id)))];
    const contractIds = [
      ...new Set(
        absences
          .map((row) => (row.contract_id ? String(row.contract_id) : null))
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    const { data: employments, error: employmentError } = await db
      .from("hr_employments")
      .select("id, person_id, employee_number")
      .eq("school_id", membership.schoolId)
      .in("id", employmentIds);
    if (employmentError) {
      throw publicDatabaseError(
        employmentError,
        "Não foi possível carregar os vínculos das faltas.",
      );
    }

    let contracts: Array<Record<string, unknown>> = [];
    let policies: Array<Record<string, unknown>> = [];
    if (contractIds.length) {
      const { data: contractRows, error: contractError } = await db
        .from("hr_contracts")
        .select("id, base_salary_kz")
        .eq("school_id", membership.schoolId)
        .in("id", contractIds);
      if (contractError) {
        throw publicDatabaseError(
          contractError,
          "Não foi possível carregar os contratos das faltas.",
        );
      }
      contracts = (contractRows ?? []) as Array<Record<string, unknown>>;

      const { data: policyRows, error: policyError } = await db
        .from("hr_contract_remuneration_policies")
        .select(
          "contract_id, remuneration_model, monthly_divisor_days, standard_workday_minutes, deduct_unjustified_absence, deduct_justified_unpaid_absence, deduct_justified_paid_absence",
        )
        .eq("school_id", membership.schoolId)
        .in("contract_id", contractIds)
        .eq("active", true);
      if (policyError && !missingAbsenceSchema(policyError)) {
        throw publicDatabaseError(
          policyError,
          "Não foi possível carregar as políticas remuneratórias.",
        );
      }
      policies = (policyRows ?? []) as Array<Record<string, unknown>>;
    }

    const personIds = [...new Set((employments ?? []).map((row) => String(row.person_id)))];
    let people: Array<Record<string, unknown>> = [];
    if (personIds.length) {
      const { data: personRows, error: peopleError } = await db
        .from("people")
        .select("id, full_name")
        .eq("school_id", membership.schoolId)
        .in("id", personIds);
      if (peopleError) {
        throw publicDatabaseError(
          peopleError,
          "Não foi possível carregar as pessoas associadas às faltas.",
        );
      }
      people = (personRows ?? []) as Array<Record<string, unknown>>;
    }

    const employmentMap = new Map((employments ?? []).map((row) => [String(row.id), row]));
    const peopleMap = new Map(people.map((row) => [String(row.id), String(row.full_name ?? "")]));
    const contractMap = new Map(contracts.map((row) => [String(row.id), row]));
    const policyMap = new Map(policies.map((row) => [String(row.contract_id), row]));

    return absences.map((row) => {
      const employment = employmentMap.get(String(row.employment_id));
      const contractId = row.contract_id ? String(row.contract_id) : null;
      const contract = contractId ? contractMap.get(contractId) : undefined;
      const policy = contractId ? policyMap.get(contractId) : undefined;
      let estimatedDeductionKz: number | null = null;

      if (contract && policy) {
        const type = String(row.absence_type);
        const shouldDeduct =
          (type === "unjustified" && Boolean(policy.deduct_unjustified_absence)) ||
          (type === "justified_unpaid" && Boolean(policy.deduct_justified_unpaid_absence)) ||
          (type === "justified_paid" && Boolean(policy.deduct_justified_paid_absence));
        const divisor = Number(policy.monthly_divisor_days ?? 0);
        const workday = Number(policy.standard_workday_minutes ?? 0);
        if (shouldDeduct && divisor > 0 && workday > 0) {
          estimatedDeductionKz =
            Math.round(
              ((Number(contract.base_salary_kz ?? 0) / divisor) *
                (Number(row.duration_minutes) / workday) *
                Number(row.deduction_multiplier ?? 1) +
                Number.EPSILON) *
                100,
            ) / 100;
        } else if (!shouldDeduct) {
          estimatedDeductionKz = 0;
        }
      }

      return {
        id: String(row.id),
        employmentId: String(row.employment_id),
        contractId,
        personName: employment
          ? peopleMap.get(String(employment.person_id)) || "Pessoa sem nome"
          : "Pessoa não encontrada",
        employeeNumber: employment?.employee_number ? String(employment.employee_number) : null,
        absenceDate: String(row.absence_date),
        absenceType: hrAbsenceTypeSchema.parse(String(row.absence_type)),
        durationMinutes: Number(row.duration_minutes),
        reason: row.reason ? String(row.reason) : null,
        evidenceRef: row.evidence_ref ? String(row.evidence_ref) : null,
        validationStatus: String(row.validation_status) as HrValidationStatus,
        estimatedDeductionKz,
        remunerationModel: policy?.remuneration_model
          ? (String(policy.remuneration_model) as HrRemunerationModel)
          : null,
      };
    });
  });

export const reviewHrAbsence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reviewHrAbsenceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireAbsenceAdmin(context.userId, "write");
    // A falta validada entra no desconto do salário: mesma exigência da folha.
    requireAal2(context.claims, "Rever uma falta com efeito no salário");
    const db = await loadSgaAdminClient();
    const now = new Date().toISOString();

    const { data: current, error: currentError } = await db
      .from("hr_absence_events")
      .select("id, validation_status")
      .eq("id", data.absenceId)
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .maybeSingle();
    if (currentError) throw publicDatabaseError(currentError, "Não foi possível validar a falta.");
    if (!current) throw new Error("Falta não encontrada.");
    if (current.validation_status !== "pending") {
      throw new Error("Esta falta já foi revista e não pode ser validada novamente.");
    }

    const { data: reviewed, error } = await db
      .from("hr_absence_events")
      .update({
        absence_type: data.absenceType,
        validation_status: data.decision === "validate" ? "validated" : "rejected",
        reason: data.reason,
        validated_at: now,
        validated_by: context.userId,
        updated_by: context.userId,
      })
      .eq("id", data.absenceId)
      .eq("school_id", membership.schoolId)
      .eq("validation_status", "pending")
      .select("id");
    if (error) throw publicDatabaseError(error, "Não foi possível guardar a decisão da falta.");
    if (!reviewed?.length) throw new Error("Esta falta já foi revista por outro utilizador.");

    return { saved: true };
  });
