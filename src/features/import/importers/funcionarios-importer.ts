import { normalizeDate, normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { loadExistingPeople, resolveOrCreatePerson, type PersonCandidate } from "./people-core";

type PositionRef = { id: string; name: string; category: string };
type EmploymentRef = {
  id: string;
  person_id: string;
  employee_number: string | null;
  status: string;
};

type FuncionariosCache = ImportRefCache & {
  positions: PositionRef[];
  employments: EmploymentRef[];
  departments: Array<{ id: string; name: string }>;
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

function employmentType(
  value: unknown,
): "permanent" | "fixed_term" | "service_provider" | "intern" | "temporary" | "other" {
  const text = normalizeText(value).toLowerCase();
  if (text.includes("efectivo") || text.includes("efetivo") || text.includes("permanent"))
    return "permanent";
  if (text.includes("termo") || text.includes("fixed")) return "fixed_term";
  if (text.includes("estag") || text.includes("intern")) return "intern";
  if (text.includes("prest") || text.includes("servic") || text.includes("service"))
    return "service_provider";
  if (text.includes("tempor")) return "temporary";
  return "other";
}

function positionCategory(
  value: unknown,
): "teacher" | "staff" | "director" | "management" | "support" | "other" {
  const text = normalizeText(value).toLowerCase();
  if (text.includes("director") || text.includes("direc")) return "director";
  if (text.includes("gestor") || text.includes("gerent") || text.includes("coorden"))
    return "management";
  if (text.includes("professor") || text.includes("docent")) return "teacher";
  if (
    text.includes("porteir") ||
    text.includes("motor") ||
    text.includes("limpeza") ||
    text.includes("seguran")
  )
    return "support";
  return "staff";
}

export const funcionariosImporter: RowImporter = {
  module: "funcionarios",

  async loadRefCache(ctx) {
    const [existingPeople, positionRows, employmentRows, departmentRows] = await Promise.all([
      loadExistingPeople(ctx.db, ctx.schoolId),
      ctx.db
        .from("hr_positions")
        .select("id, name, category")
        .eq("school_id", ctx.schoolId)
        .is("deleted_at", null),
      ctx.db
        .from("hr_employments")
        .select("id, person_id, employee_number, status")
        .eq("school_id", ctx.schoolId)
        .is("deleted_at", null),
      ctx.db
        .from("hr_departments")
        .select("id, name")
        .eq("school_id", ctx.schoolId)
        .is("deleted_at", null),
    ]);

    if (positionRows.error)
      throw new Error(`Não foi possível carregar cargos de RH: ${positionRows.error.message}`);
    if (employmentRows.error)
      throw new Error(`Não foi possível carregar vínculos de RH: ${employmentRows.error.message}`);
    if (departmentRows.error)
      throw new Error(
        `Não foi possível carregar departamentos de RH: ${departmentRows.error.message}`,
      );

    return {
      existingPeople,
      classGroups: [],
      studentByPersonId: new Map(),
      positions: (positionRows.data ?? []).map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ""),
        category: String(r.category ?? "staff"),
      })),
      employments: (employmentRows.data ?? []).map((r) => ({
        id: String(r.id),
        person_id: String(r.person_id),
        employee_number: r.employee_number ? String(r.employee_number) : null,
        status: String(r.status ?? "active"),
      })),
      departments: (departmentRows.data ?? []).map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ""),
      })),
    } as FuncionariosCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as FuncionariosCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const fullName = normalizeText(valueOf(normalized, "full_name", "nome", "funcionario"));
    const idNumber = normalizeText(valueOf(normalized, "id_number", "bi", "documento"));
    const phone = normalizeText(valueOf(normalized, "phone", "telefone", "contacto"));
    const roleTitle = normalizeText(valueOf(normalized, "role_title", "cargo", "funcao"));
    const hireDate = normalizeDate(valueOf(normalized, "hire_date", "data_admissao", "admissao"));

    if (!fullName) errors.push("Nome completo do funcionário é obrigatório.");
    if (!idNumber) errors.push("Nº do Bilhete de Identidade é obrigatório.");
    if (!phone) errors.push("Telefone de contacto é obrigatório.");
    if (!roleTitle) errors.push("Cargo ou função do funcionário é obrigatório.");
    if (!hireDate) errors.push("Data de admissão é obrigatória e deve ser válida.");

    const employeeNumber = normalizeText(
      valueOf(normalized, "employee_number", "numero_funcionario", "n_agente", "agente"),
    );

    if (errors.length) return { status: "error", warnings, errors };

    if (
      employeeNumber &&
      cache.employments.some(
        (e) => e.employee_number?.toLowerCase() === employeeNumber.toLowerCase(),
      )
    ) {
      return {
        status: "duplicate",
        warnings: [
          `Nº de funcionário "${employeeNumber}" já está associado a um vínculo activo/existente.`,
        ],
        errors: [],
        duplicate_of: employeeNumber,
      };
    }

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as FuncionariosCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }
    if (analysis.status === "duplicate") {
      return {
        status: "duplicate",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        target_record_id: analysis.duplicate_of,
      };
    }

    const fullName = normalizeText(valueOf(normalized, "full_name", "nome", "funcionario"))!;
    const idNumber = normalizeText(valueOf(normalized, "id_number", "bi", "documento"))!;
    const phone = normalizeText(valueOf(normalized, "phone", "telefone", "contacto"))!;
    const email = normalizeText(valueOf(normalized, "email", "correio"));
    const roleTitle = normalizeText(valueOf(normalized, "role_title", "cargo", "funcao"))!;
    const hireDate = normalizeDate(valueOf(normalized, "hire_date", "data_admissao", "admissao"))!;
    const employeeNumber = normalizeText(
      valueOf(normalized, "employee_number", "numero_funcionario", "n_agente", "agente"),
    );
    const departmentName = normalizeText(
      valueOf(normalized, "department", "departamento", "sector", "seccao"),
    );
    const contract = valueOf(normalized, "contract_type", "tipo_contrato", "contrato", "vinculo");

    const candidate: PersonCandidate = {
      full_name: fullName,
      national_id: idNumber,
      phone,
      email: email || null,
      birth_date: null,
      gender: null,
    };
    const person = await resolveOrCreatePerson(candidate, cache.existingPeople, ctx);

    const existingPersonEmployment = cache.employments.find(
      (e) => e.person_id === person.personId && e.status !== "terminated" && e.status !== "expired",
    );
    if (existingPersonEmployment) {
      return {
        status: "duplicate",
        warnings: [
          `A pessoa já possui um vínculo laboral activo (ID ${existingPersonEmployment.id}).`,
        ],
        errors: [],
        audits: person.audits,
        target_record_id: existingPersonEmployment.id,
      };
    }

    const category = positionCategory(roleTitle);
    let position = cache.positions.find((p) => p.name.toLowerCase() === roleTitle.toLowerCase());

    if (ctx.dryRun) {
      return {
        status: "will_insert",
        warnings: analysis.warnings.concat(
          position ? [] : [`Será criado o cargo de RH "${roleTitle}".`],
          departmentName &&
            !cache.departments.some((d) => d.name.toLowerCase() === departmentName.toLowerCase())
            ? [`Será criado o departamento de RH "${departmentName}".`]
            : [],
        ),
        errors: [],
        audits: person.audits,
        target_record_id: null,
      };
    }

    const audits = [...person.audits];
    let departmentId: string | null = null;
    if (departmentName) {
      const department = cache.departments.find(
        (d) => d.name.toLowerCase() === departmentName.toLowerCase(),
      );
      if (department) {
        departmentId = department.id;
      } else {
        const { data, error } = await ctx.db
          .from("hr_departments")
          .insert({
            school_id: ctx.schoolId,
            name: departmentName,
            active: true,
            created_by: ctx.userId,
            updated_by: ctx.userId,
          })
          .select("id")
          .single();
        if (error) {
          return {
            status: "error",
            warnings: analysis.warnings,
            errors: [`Erro ao criar departamento de RH: ${error.message}`],
            audits: person.audits,
          };
        }
        departmentId = String(data.id);
        cache.departments.push({ id: departmentId, name: departmentName });
        audits.push({
          table_name: "hr_departments",
          target_id: departmentId,
          action_type: "inserted",
          after_data: { school_id: ctx.schoolId, name: departmentName, active: true },
        });
      }
    }

    if (!position) {
      const { data, error } = await ctx.db
        .from("hr_positions")
        .insert({
          school_id: ctx.schoolId,
          department_id: departmentId,
          name: roleTitle,
          category,
          active: true,
          created_by: ctx.userId,
          updated_by: ctx.userId,
        })
        .select("id")
        .single();
      if (error) {
        return {
          status: "error",
          warnings: analysis.warnings,
          errors: [`Erro ao criar cargo de RH: ${error.message}`],
          audits,
        };
      }
      position = { id: String(data.id), name: roleTitle, category };
      cache.positions.push(position);
      audits.push({
        table_name: "hr_positions",
        target_id: position.id,
        action_type: "inserted",
        after_data: {
          school_id: ctx.schoolId,
          department_id: departmentId,
          name: roleTitle,
          category,
          active: true,
        },
      });
    }

    const { data: employment, error: employmentError } = await ctx.db
      .from("hr_employments")
      .insert({
        school_id: ctx.schoolId,
        person_id: person.personId,
        position_id: position.id,
        department_id: departmentId,
        employee_number: employeeNumber,
        employment_type: employmentType(contract),
        status: "active",
        hire_date: hireDate,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();

    if (employmentError) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao criar vínculo laboral: ${employmentError.message}`],
        audits,
      };
    }

    const employmentId = String(employment.id);
    cache.employments.push({
      id: employmentId,
      person_id: person.personId,
      employee_number: employeeNumber,
      status: "active",
    });
    audits.push({
      table_name: "hr_employments",
      target_id: employmentId,
      action_type: "inserted",
      after_data: {
        school_id: ctx.schoolId,
        person_id: person.personId,
        position_id: position.id,
        department_id: departmentId,
        employee_number: employeeNumber,
        employment_type: employmentType(contract),
        status: "active",
        hire_date: hireDate,
      },
    });

    return {
      status: "imported",
      warnings: analysis.warnings,
      errors: [],
      audits,
      target_record_id: employmentId,
    };
  },
};
