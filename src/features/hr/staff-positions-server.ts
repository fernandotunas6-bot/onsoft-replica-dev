import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { schoolTodayIso } from "@/lib/school-date";
import { isMissingHrTable } from "./missing-table";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/** Falha antes de criar uma pessoa se a instalação ainda não suporta Funcionários/RH. */
export async function assertHrEmploymentStoreReady(db: Db, schoolId: string): Promise<void> {
  const { error } = await db.from("hr_employments")
    .select("id").eq("school_id", schoolId).limit(1);
  if (error) {
    throw publicDatabaseError(error,
      "O módulo Funcionários/RH deve estar pronto antes de atribuir vínculos laborais.");
  }
}

/**
 * O cargo profissional (hr_positions) não é uma permissão de login.
 * Garante um vínculo RH em rascunho, sem contrato nem salário, se a pessoa
 * recebeu um vínculo institucional de pessoal. Não cria duplicados se já
 * existir vínculo activo/em preparação na escola.
 */
export async function ensureStaffEmploymentDraft(
  db: Db,
  schoolId: string,
  personId: string,
  actorId: string,
): Promise<{ id: string; created: boolean }> {
  const { data: existing, error } = await db
    .from("hr_employments")
    .select("id, status")
    .eq("school_id", schoolId)
    .eq("person_id", personId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingHrTable(error)) {
      throw new Error("O módulo RH ainda não está instalado nesta escola.");
    }
    throw publicDatabaseError(error, "Não foi possível verificar o vínculo laboral.");
  }
  const current = (existing ?? []).find((item) =>
    ["active", "draft", "suspended"].includes(item.status),
  );
  if (current) return { id: String(current.id), created: false };
  const { data: employment, error: createError } = await db
    .from("hr_employments")
    .insert({
      school_id: schoolId,
      person_id: personId,
      employment_type: "other",
      status: "draft",
      hire_date: schoolTodayIso(),
      notes: "Ficha RH criada em preparação; confirmação da contratação pendente.",
      created_by: actorId,
      updated_by: actorId,
    })
    .select("id")
    .single();
  if (createError) throw publicDatabaseError(createError, "Não foi possível criar a ficha RH.");
  return { id: String(employment.id), created: true };
}

const assignInput = z
  .object({
    personId: z.string().uuid(),
    positionId: z.string().uuid().optional(),
    newPositionName: z.string().trim().min(2).max(120).optional(),
    newPositionCategory: z
      .enum(["teacher", "staff", "director", "management", "support", "other"])
      .optional(),
    departmentId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.positionId || value.newPositionName), {
    message: "Escolha ou crie um cargo.",
  });

export const listStaffPositions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("financeiro", context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    const [positions, departments] = await Promise.all([
      db
        .from("hr_positions")
        .select("id, name, category, department_id")
        .eq("school_id", membership.schoolId)
        .eq("active", true)
        .is("deleted_at", null)
        .order("name"),
      db
        .from("hr_departments")
        .select("id, name")
        .eq("school_id", membership.schoolId)
        .eq("active", true)
        .is("deleted_at", null)
        .order("name"),
    ]);
    if (positions.error || departments.error) {
      throw publicDatabaseError(
        positions.error || departments.error!,
        "Não foi possível carregar cargos e departamentos.",
      );
    }
    return { positions: positions.data ?? [], departments: departments.data ?? [] };
  });

export const assignStaffPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => assignInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "financeiro",
      context.supabase,
      context.userId,
      ["Administrador"],
    );
    const db = await loadSgaAdminClient();
    const { data: person, error: personError } = await db
      .from("people")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("id", data.personId)
      .is("deleted_at", null)
      .maybeSingle();
    if (personError) throw publicDatabaseError(personError, "Não foi possível validar a pessoa.");
    if (!person) throw new Error("Esta pessoa não existe na escola activa.");

    let departmentId = data.departmentId ?? null;
    if (departmentId) {
      const { data: department } = await db
        .from("hr_departments")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("id", departmentId)
        .eq("active", true)
        .is("deleted_at", null)
        .maybeSingle();
      if (!department) throw new Error("Departamento inválido nesta escola.");
    }

    let positionId = data.positionId;
    if (positionId) {
      const { data: position, error: positionError } = await db
        .from("hr_positions")
        .select("id, department_id")
        .eq("id", positionId)
        .eq("school_id", membership.schoolId)
        .eq("active", true)
        .is("deleted_at", null)
        .maybeSingle();
      if (positionError)
        throw publicDatabaseError(positionError, "Não foi possível verificar o cargo.");
      if (!position) throw new Error("Cargo inválido nesta escola.");
      departmentId ??= position.department_id;
    } else if (data.newPositionName) {
      const name = data.newPositionName.trim();
      const { data: matches } = await db
        .from("hr_positions")
        .select("id, name, department_id")
        .eq("school_id", membership.schoolId)
        .is("deleted_at", null)
        .eq("active", true);
      const existing = (matches ?? []).find(
        (entry) => entry.name.toLocaleLowerCase("pt") === name.toLocaleLowerCase("pt"),
      );
      if (existing) {
        positionId = String(existing.id);
        departmentId ??= existing.department_id;
      } else {
        const { data: created, error: createError } = await db
          .from("hr_positions")
          .insert({
            school_id: membership.schoolId,
            name,
            category: data.newPositionCategory ?? "staff",
            department_id: departmentId,
            active: true,
            created_by: context.userId,
            updated_by: context.userId,
          })
          .select("id")
          .single();
        if (createError)
          throw publicDatabaseError(createError, "Não foi possível registar o cargo.");
        positionId = String(created.id);
      }
    }
    if (!positionId) throw new Error("Cargo não encontrado.");

    const employment = await ensureStaffEmploymentDraft(
      db,
      membership.schoolId,
      data.personId,
      context.userId,
    );
    const { data: updated, error: updateError } = await db
      .from("hr_employments")
      .update({
        position_id: positionId,
        department_id: departmentId,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", employment.id)
      .eq("school_id", membership.schoolId)
      .eq("person_id", data.personId)
      .is("deleted_at", null)
      .select("id, status")
      .maybeSingle();
    if (updateError)
      throw publicDatabaseError(updateError, "Não foi possível associar o cargo ao funcionário.");
    if (!updated) throw new Error("Não foi possível encontrar a ficha RH desta pessoa.");
    // Vínculo institucional, sem atribuir nenhuma permissão de login.
    const { data: personRole, error: roleError } = await db
      .from("person_roles")
      .select("id, active")
      .eq("school_id", membership.schoolId)
      .eq("person_id", data.personId)
      .eq("role", "funcionario")
      .maybeSingle();
    if (roleError)
      throw publicDatabaseError(
        roleError,
        "Cargo atribuído, mas não foi possível verificar o vínculo em Pessoas.",
      );
    if (personRole && !personRole.active) {
      const { error: reactivateError } = await db
        .from("person_roles")
        .update({
          active: true,
          deleted_at: null,
          updated_at: new Date().toISOString(),
          updated_by: context.userId,
        })
        .eq("id", personRole.id)
        .eq("school_id", membership.schoolId);
      if (reactivateError)
        throw publicDatabaseError(
          reactivateError,
          "Cargo atribuído, mas não foi possível reactivar o vínculo.",
        );
    } else if (!personRole) {
      const { error: insertRoleError } = await db.from("person_roles").insert({
        school_id: membership.schoolId,
        person_id: data.personId,
        role: "funcionario",
        active: true,
        created_by: context.userId,
        updated_by: context.userId,
      });
      if (insertRoleError)
        throw publicDatabaseError(
          insertRoleError,
          "Cargo atribuído, mas não foi possível adicionar o vínculo em Pessoas.",
        );
    }
    return { employmentId: String(updated.id), status: String(updated.status), positionId };
  });
