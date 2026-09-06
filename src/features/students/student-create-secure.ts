import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter } from "@/integrations/supabase/sga-admin";
import { createStudentInputSchema, enrollNewStudentInputSchema } from "./schemas";
import * as legacy from "./server";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

async function requireAcademicWriter(userId: string) {
  const db = await loadSgaAdminClient();
  const membership = await requireSgaWriter(db, userId, ["Administrador", "Secretaria"]);
  return { db, membership };
}

async function assertPersonInSchool(db: Db, schoolId: string, personId: string) {
  const { data, error } = await db
    .from("people")
    .select("id")
    .eq("id", personId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar a Pessoa.");
  if (!data?.id) throw new Error("Pessoa não encontrada nesta escola.");
}

async function assertGuardiansInSchool(db: Db, schoolId: string, personIds: string[]) {
  const ids = [...new Set(personIds)];
  if (!ids.length) return;
  const { data, error } = await db
    .from("people")
    .select("id")
    .eq("school_id", schoolId)
    .in("id", ids);
  if (error) throw publicDatabaseError(error, "Não foi possível validar os encarregados.");
  if ((data ?? []).length !== ids.length) {
    throw new Error("Um ou mais encarregados não pertencem a esta escola.");
  }
}

async function assertAcademicPlacement(params: {
  db: Db;
  schoolId: string;
  classGroupId?: string;
  academicYearId?: string;
}) {
  const { classGroupId, academicYearId } = params;
  if (!classGroupId && !academicYearId) return;
  if (!classGroupId || !academicYearId) {
    throw new Error("Turma e ano lectivo devem ser informados em conjunto.");
  }

  const [{ data: group, error: groupError }, { data: year, error: yearError }] = await Promise.all([
    params.db
      .from("class_groups")
      .select("id, academic_year_id")
      .eq("id", classGroupId)
      .eq("school_id", params.schoolId)
      .maybeSingle(),
    params.db
      .from("academic_years")
      .select("id")
      .eq("id", academicYearId)
      .eq("school_id", params.schoolId)
      .maybeSingle(),
  ]);

  if (groupError) throw publicDatabaseError(groupError, "Não foi possível validar a turma.");
  if (yearError) throw publicDatabaseError(yearError, "Não foi possível validar o ano lectivo.");
  if (!group?.id) throw new Error("Turma não encontrada nesta escola.");
  if (!year?.id) throw new Error("Ano lectivo não encontrado nesta escola.");
  if (group.academic_year_id && String(group.academic_year_id) !== academicYearId) {
    throw new Error("A turma seleccionada não pertence ao ano lectivo informado.");
  }
}

export const createStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createStudentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requireAcademicWriter(context.userId);

    await Promise.all([
      assertPersonInSchool(db, membership.schoolId, data.personId),
      assertGuardiansInSchool(
        db,
        membership.schoolId,
        data.guardians.map((guardian) => guardian.guardian_person_id),
      ),
      assertAcademicPlacement({
        db,
        schoolId: membership.schoolId,
        classGroupId: data.classGroupId,
        academicYearId: data.academicYearId,
      }),
    ]);

    return legacy.createStudent({ data });
  });

export const enrollNewStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => enrollNewStudentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requireAcademicWriter(context.userId);

    await Promise.all([
      assertGuardiansInSchool(
        db,
        membership.schoolId,
        data.guardians.map((guardian) => guardian.guardian_person_id),
      ),
      assertAcademicPlacement({
        db,
        schoolId: membership.schoolId,
        classGroupId: data.classGroupId,
        academicYearId: data.academicYearId,
      }),
    ]);

    return legacy.enrollNewStudent({ data });
  });
