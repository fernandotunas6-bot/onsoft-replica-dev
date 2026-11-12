import { isMissingHrTable } from "@/features/hr/missing-table";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  assertModuleNotBlocked,
  loadSgaAdminClient,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  mapAbsences,
  mapContracts,
  mapPayslips,
  type HrEmployeeDetail,
  type HrEmployeeListRow,
} from "./employee-detail";

const HR_READ_ROLES = new Set(["Administrador", "Tesouraria"]);

/** Leitura do RH: Administração e Tesouraria, salvo «Nenhum» no Financeiro. */
export async function requireHrReader(userId: string, mode: "read" | "write" = "read") {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  if (!HR_READ_ROLES.has(membership.appRole)) {
    throw new Error("Sem permissão para consultar dados de RH e folha salarial.");
  }
  // Permissões por módulo (Nenhum/Leitura) também valem no RH.
  await assertModuleNotBlocked(membership.schoolId, userId, "financeiro", mode);
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
      if (isMissingHrTable(schemaProbe.error)) {
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
      if (isMissingHrTable(error)) return [];
      throw publicDatabaseError(error, "Não foi possível carregar as folhas salariais.");
    }
    return data ?? [];
  });

/**
 * Funcionários (SIGA Context Engine, contexto RH): a lista dos vínculos laborais
 * e a ficha de cada um. Só leitura, com o guarda de leitura do RH (Administração e
 * Tesouraria, salvo «Nenhum» no Financeiro); cada tabela é lida com a escola activa.
 * Rever faltas, processar a folha e alterar salários continuam nas suas páginas.
 */

type Row = Record<string, unknown>;
type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

const EMPLOYMENT_COLUMNS =
  "id, person_id, employee_number, employment_type, status, hire_date, termination_date, weekly_hours, work_location, position_id, department_id";

const ids = (rows: Row[], key: string) => [
  ...new Set(
    rows.map((row) => (row[key] ? String(row[key]) : "")).filter((value) => value.length > 0),
  ),
];

/** Nome por id de `people`, `hr_positions` ou `hr_departments`, na escola activa. */
async function namesById(
  db: Db,
  table: "people" | "hr_positions" | "hr_departments",
  schoolId: string,
  keys: string[],
): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const column = table === "people" ? "full_name" : "name";
  const { data, error } = await db
    .from(table)
    .select(`id, ${column}`)
    .eq("school_id", schoolId)
    .in("id", keys);
  if (error) {
    if (isMissingHrTable(error)) return new Map();
    throw publicDatabaseError(error, "Não foi possível ler os nomes dos funcionários.");
  }
  return new Map(
    ((data ?? []) as unknown as Row[]).map((row) => [String(row.id), String(row[column] ?? "")]),
  );
}

export const listHrEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HrEmployeeListRow[]> => {
    const membership = await requireHrReader(context.userId);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("hr_employments")
      .select(EMPLOYMENT_COLUMNS)
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .limit(1000);
    if (error) {
      if (isMissingHrTable(error)) return [];
      throw publicDatabaseError(error, "Não foi possível carregar os funcionários.");
    }
    const rows = (data ?? []) as unknown as Row[];
    const [people, positions, departments] = await Promise.all([
      namesById(db, "people", membership.schoolId, ids(rows, "person_id")),
      namesById(db, "hr_positions", membership.schoolId, ids(rows, "position_id")),
      namesById(db, "hr_departments", membership.schoolId, ids(rows, "department_id")),
    ]);
    return rows
      .map((row) => ({
        id: String(row.id),
        personName: people.get(String(row.person_id)) || "Pessoa sem nome",
        employeeNumber: row.employee_number ? String(row.employee_number) : null,
        position: positions.get(String(row.position_id)) || null,
        department: departments.get(String(row.department_id)) || null,
        employmentType: String(row.employment_type ?? ""),
        status: String(row.status ?? ""),
        hireDate: row.hire_date ? String(row.hire_date) : null,
      }))
      .sort((a, b) => a.personName.localeCompare(b.personName, "pt"));
  });

const employeeInput = z.object({ employmentId: z.string().guid() });

export const getHrEmployeeDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => employeeInput.parse(input))
  .handler(async ({ data, context }): Promise<HrEmployeeDetail | null> => {
    const membership = await requireHrReader(context.userId);
    const schoolId = membership.schoolId;
    const db = await loadSgaAdminClient();

    const { data: employment, error } = await db
      .from("hr_employments")
      .select(EMPLOYMENT_COLUMNS)
      .eq("school_id", schoolId)
      .eq("id", data.employmentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      if (isMissingHrTable(error)) return null;
      throw publicDatabaseError(error, "Não foi possível abrir a ficha do funcionário.");
    }
    if (!employment) return null;
    const row = employment as unknown as Row;
    const personId = String(row.person_id);

    const [people, positions, departments, contracts, absences, items, teacher] = await Promise.all(
      [
        namesById(db, "people", schoolId, [personId]),
        namesById(db, "hr_positions", schoolId, ids([row], "position_id")),
        namesById(db, "hr_departments", schoolId, ids([row], "department_id")),
        db
          .from("hr_contracts")
          .select(
            "id, contract_number, contract_type, salary_type, base_salary_kz, hourly_rate_kz, lesson_hour_rate_kz, starts_on, ends_on, status",
          )
          .eq("school_id", schoolId)
          .eq("employment_id", data.employmentId)
          .is("deleted_at", null),
        db
          .from("hr_absence_events")
          .select("id, absence_date, absence_type, duration_minutes, reason, validation_status")
          .eq("school_id", schoolId)
          .eq("employment_id", data.employmentId)
          .is("deleted_at", null)
          .order("absence_date", { ascending: false })
          .limit(50),
        db
          .from("hr_payroll_items")
          .select("id, payroll_run_id, gross_amount_kz, deductions_kz, net_amount_kz")
          .eq("school_id", schoolId)
          .eq("employment_id", data.employmentId)
          .order("created_at", { ascending: false })
          .limit(24),
        db
          .from("teachers")
          .select("id")
          .eq("school_id", schoolId)
          .eq("person_id", personId)
          .limit(1),
      ],
    );

    for (const result of [contracts, absences, items]) {
      if (result.error && !isMissingHrTable(result.error)) {
        throw publicDatabaseError(result.error, "Não foi possível abrir a ficha do funcionário.");
      }
    }
    const itemRows = (items.error ? [] : (items.data ?? [])) as unknown as Row[];
    const runIds = ids(itemRows, "payroll_run_id");
    let runs: Row[] = [];
    if (runIds.length) {
      const { data: runRows, error: runError } = await db
        .from("hr_payroll_runs")
        .select("id, competence_year, competence_month, status")
        .eq("school_id", schoolId)
        .in("id", runIds);
      if (runError && !isMissingHrTable(runError)) {
        throw publicDatabaseError(runError, "Não foi possível ler as folhas salariais.");
      }
      runs = (runRows ?? []) as unknown as Row[];
    }
    // Um recibo só conta se a folha dele for desta escola.
    const runIdsHere = new Set(runs.map((run) => String(run.id)));
    const teacherRow = ((teacher.data ?? []) as unknown as Row[])[0];

    return {
      id: String(row.id),
      schoolId,
      personName: people.get(personId) || "Pessoa sem nome",
      employeeNumber: row.employee_number ? String(row.employee_number) : null,
      position: positions.get(String(row.position_id)) || null,
      department: departments.get(String(row.department_id)) || null,
      employmentType: String(row.employment_type ?? ""),
      status: String(row.status ?? ""),
      hireDate: row.hire_date ? String(row.hire_date) : null,
      terminationDate: row.termination_date ? String(row.termination_date) : null,
      weeklyHours: row.weekly_hours == null ? null : Number(row.weekly_hours),
      workLocation: row.work_location ? String(row.work_location) : null,
      teacherId: teacher.error || !teacherRow ? null : String(teacherRow.id),
      contracts: mapContracts((contracts.error ? [] : (contracts.data ?? [])) as unknown as Row[]),
      absences: mapAbsences((absences.error ? [] : (absences.data ?? [])) as unknown as Row[]),
      payslips: mapPayslips(
        itemRows.filter((item) => runIdsHere.has(String(item.payroll_run_id))),
        runs,
      ),
    };
  });

const teacherInput = z.object({ teacherId: z.string().guid() });

/**
 * O vínculo laboral de um professor (a mesma pessoa, na escola activa), para o
 * perfil do professor levar à ficha de RH. Quem não lê o RH recebe null sem erro:
 * o perfil pede-o só a quem abre `/financeiro/rh`, e o servidor confirma.
 */
export const getTeacherHrEmployment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => teacherInput.parse(input))
  .handler(async ({ data, context }): Promise<{ employmentId: string } | null> => {
    // Quem não lê o RH recebe null: o perfil do professor fica sem «Ficha de RH».
    const membership = await requireHrReader(context.userId).catch(() => null);
    if (!membership) return null;
    const db = await loadSgaAdminClient();
    const { data: teacher } = await db
      .from("teachers")
      .select("person_id")
      .eq("school_id", membership.schoolId)
      .eq("id", data.teacherId)
      .maybeSingle();
    if (!teacher?.person_id) return null;
    const { data: employments, error } = await db
      .from("hr_employments")
      .select("id, status, hire_date")
      .eq("school_id", membership.schoolId)
      .eq("person_id", String(teacher.person_id))
      .is("deleted_at", null);
    if (error) {
      if (isMissingHrTable(error)) return null;
      throw publicDatabaseError(error, "Não foi possível ler o vínculo laboral do professor.");
    }
    const rows = (employments ?? []) as unknown as Row[];
    // O vínculo activo; sem ele, o mais recente.
    const chosen =
      rows.find((row) => row.status === "active") ??
      [...rows].sort((a, b) =>
        String(b.hire_date ?? "").localeCompare(String(a.hire_date ?? "")),
      )[0];
    return chosen ? { employmentId: String(chosen.id) } : null;
  });
