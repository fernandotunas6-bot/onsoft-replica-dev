import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter } from "@/integrations/supabase/sga-admin";
import {
  addPersonDocumentInputSchema,
  createPersonInputSchema,
  deleteTeacherInputSchema,
  mergePeopleInputSchema,
  setPersonPhotoUrlInputSchema,
  updatePersonInputSchema,
  updatePersonStatusInputSchema,
  updateTeacherInputSchema,
} from "./schemas";
import * as legacy from "./server";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

async function requirePeopleWriter(userId: string) {
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

async function assertPeopleInSchool(db: Db, schoolId: string, personIds: string[]) {
  const ids = [...new Set(personIds)];
  if (!ids.length) return;
  const { data, error } = await db
    .from("people")
    .select("id")
    .eq("school_id", schoolId)
    .in("id", ids);
  if (error) throw publicDatabaseError(error, "Não foi possível validar as Pessoas relacionadas.");
  if ((data ?? []).length !== ids.length) {
    throw new Error("Uma ou mais Pessoas relacionadas não pertencem a esta escola.");
  }
}

async function assertTeacherInSchool(db: Db, schoolId: string, teacherId: string) {
  const { data, error } = await db
    .from("teachers")
    .select("id, person_id")
    .eq("id", teacherId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar o professor.");
  if (!data?.id) throw new Error("Professor não encontrado nesta escola.");
  return data;
}

export const createPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createPersonInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requirePeopleWriter(context.userId);
    await assertPeopleInSchool(
      db,
      membership.schoolId,
      data.relationships.map((relationship) => relationship.related_person_id),
    );
    return legacy.createPerson({ data });
  });

export const updatePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updatePersonInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requirePeopleWriter(context.userId);
    await assertPersonInSchool(db, membership.schoolId, data.personId);
    return legacy.updatePerson({ data });
  });

export const updatePersonStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updatePersonStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requirePeopleWriter(context.userId);
    await assertPersonInSchool(db, membership.schoolId, data.personId);
    return legacy.updatePersonStatus({ data });
  });

export const setPersonPhotoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setPersonPhotoUrlInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requirePeopleWriter(context.userId);
    await assertPersonInSchool(db, membership.schoolId, data.personId);
    return legacy.setPersonPhotoUrl({ data });
  });

export const addPersonDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => addPersonDocumentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requirePeopleWriter(context.userId);
    await assertPersonInSchool(db, membership.schoolId, data.personId);
    return legacy.addPersonDocument({ data });
  });

export const mergePeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => mergePeopleInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    if (data.survivorId === data.duplicateId) {
      throw new Error("A Pessoa sobrevivente e a duplicada devem ser diferentes.");
    }
    const { db, membership } = await requirePeopleWriter(context.userId);
    await assertPeopleInSchool(db, membership.schoolId, [data.survivorId, data.duplicateId]);
    return legacy.mergePeople({ data });
  });

export const updateTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateTeacherInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requirePeopleWriter(context.userId);
    await assertTeacherInSchool(db, membership.schoolId, data.teacherId);
    return legacy.updateTeacher({ data });
  });

export const deleteTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteTeacherInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const { db, membership } = await requirePeopleWriter(context.userId);
    await assertTeacherInSchool(db, membership.schoolId, data.teacherId);
    return legacy.deleteTeacher({ data });
  });
