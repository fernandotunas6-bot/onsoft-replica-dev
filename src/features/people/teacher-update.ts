/**
 * Editar professor: a ficha da pessoa (nome, contactos) e o estado do professor
 * vivem em duas tabelas. Sem RPC transaccional, a gravação é feita com
 * compare-and-swap em cada linha e, se a segunda escrita falhar, a primeira é
 * reposta — nunca fica meia edição gravada em silêncio.
 *
 * `expectedTeacherUpdatedAt` / `expectedPersonUpdatedAt` são os carimbos que o
 * ecrã leu: se outra pessoa gravou entretanto, a edição devolve conflito em vez
 * de sobrescrever.
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

export const TEACHER_EDIT_CONFLICT =
  "Este professor foi alterado por outra pessoa. Actualize os dados antes de guardar.";

export type TeacherUpdateInput = {
  schoolId: string;
  userId: string;
  teacherId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: "active" | "inactive";
  expectedTeacherUpdatedAt?: string;
  expectedPersonUpdatedAt?: string;
};

export type TeacherUpdateResult = {
  id: string;
  person_id: string;
  status: string;
  changedFields: string[];
};

/** O mesmo instante, ainda que o texto venha formatado de outra maneira. */
function sameInstant(a: string, b: string) {
  if (a === b) return true;
  const left = Date.parse(a);
  const right = Date.parse(b);
  return Number.isFinite(left) && left === right;
}

export async function commitTeacherUpdate(
  db: AdminDb,
  input: TeacherUpdateInput,
): Promise<TeacherUpdateResult> {
  const { data: teacher, error: teacherError } = await db
    .from("teachers")
    .select("id, person_id, status, updated_at")
    .eq("id", input.teacherId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (teacherError) throw publicDatabaseError(teacherError, "Não foi possível ler o professor.");
  if (!teacher) throw new Error("Professor não encontrado.");
  if (
    input.expectedTeacherUpdatedAt &&
    !sameInstant(String(teacher.updated_at), input.expectedTeacherUpdatedAt)
  ) {
    throw new Error(TEACHER_EDIT_CONFLICT);
  }

  const { data: person, error: personReadError } = await db
    .from("people")
    .select("id, full_name, email, phone, updated_at")
    .eq("id", teacher.person_id)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (personReadError)
    throw publicDatabaseError(personReadError, "Não foi possível ler a ficha do professor.");
  if (!person) throw new Error("Ficha do professor não encontrada.");
  if (
    input.expectedPersonUpdatedAt &&
    !sameInstant(String(person.updated_at), input.expectedPersonUpdatedAt)
  ) {
    throw new Error(TEACHER_EDIT_CONFLICT);
  }

  const before = {
    full_name: person.full_name as string,
    email: (person.email as string | null) ?? null,
    phone: (person.phone as string | null) ?? null,
  };
  const after = { full_name: input.fullName, email: input.email, phone: input.phone };
  const changedFields = (Object.keys(after) as Array<keyof typeof after>).filter(
    (key) => before[key] !== after[key],
  ) as string[];
  const statusChanged = teacher.status !== input.status;
  if (statusChanged) changedFields.push("status");
  const result = {
    id: String(teacher.id),
    person_id: String(teacher.person_id),
    status: input.status,
    changedFields,
  };
  // Guardar sem alterações não mexe em carimbos nem dispara conflitos de outros.
  if (!changedFields.length) return result;

  let personUpdatedAt: string | null = null;
  if (changedFields.some((field) => field !== "status")) {
    const { data: written, error } = await db
      .from("people")
      .update({ ...after, updated_by: input.userId })
      .eq("id", person.id)
      .eq("school_id", input.schoolId)
      .eq("updated_at", person.updated_at)
      .select("id, updated_at");
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a ficha.");
    if (!written?.length) throw new Error(TEACHER_EDIT_CONFLICT);
    personUpdatedAt = String(written[0]?.updated_at ?? "");
  }

  if (statusChanged) {
    const { data: written, error } = await db
      .from("teachers")
      .update({ status: input.status, updated_by: input.userId })
      .eq("id", teacher.id)
      .eq("school_id", input.schoolId)
      .eq("status", teacher.status)
      .select("id");
    if (error || !written?.length) {
      // Repor a ficha: a edição é tudo ou nada aos olhos de quem gravou.
      if (personUpdatedAt !== null) {
        await db
          .from("people")
          .update({ ...before, updated_by: input.userId })
          .eq("id", person.id)
          .eq("school_id", input.schoolId)
          .eq("updated_at", personUpdatedAt);
      }
      if (error) throw publicDatabaseError(error, "Não foi possível actualizar o professor.");
      throw new Error(TEACHER_EDIT_CONFLICT);
    }
  }
  return result;
}
