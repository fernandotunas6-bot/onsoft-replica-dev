/**
 * Contacto do professor visível para alunos e encarregados — decisão do próprio
 * professor.
 *
 * Por omissão o contacto (e-mail e telefone) é visível. O professor pode
 * ocultá-lo no seu perfil. O pessoal da escola (Administrador, Secretaria,
 * Tesouraria, Professor) vê sempre.
 *
 * Guarda-se em `school_settings`, domínio `teacher_contact_visibility`, como a
 * lista de professores que ocultaram: `{ hidden: ["<teacher_id>", …] }`. Sem
 * migração nova. Cada professor só altera a sua própria entrada, pelo servidor.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";

export const TEACHER_CONTACT_DOMAIN = "teacher_contact_visibility";

/** Quem vê sempre os contactos dos professores. */
export const CONTACT_STAFF_ROLES = ["Administrador", "Secretaria", "Tesouraria", "Professor"];

export function seesAllTeacherContacts(roles: readonly string[]): boolean {
  return CONTACT_STAFF_ROLES.some((role) => roles.includes(role));
}

export function parseHiddenTeachers(value: unknown): Set<string> {
  const hidden = (value as { hidden?: unknown } | null)?.hidden;
  return new Set(Array.isArray(hidden) ? hidden.filter((id) => typeof id === "string") : []);
}

/** Aplica a escolha de cada professor a uma linha com e-mail e telefone. */
export function applyTeacherContactVisibility<
  T extends { id: string; email?: string | null; phone?: string | null },
>(rows: T[], hidden: Set<string>, viewerSeesAll: boolean): T[] {
  if (viewerSeesAll || hidden.size === 0) return rows;
  return rows.map((row) => (hidden.has(row.id) ? { ...row, email: null, phone: null } : row));
}

export async function loadHiddenTeachers(db: SupabaseClient, schoolId: string) {
  const { data } = await db
    .from("school_settings")
    .select("value")
    .eq("school_id", schoolId)
    .eq("domain", TEACHER_CONTACT_DOMAIN)
    .maybeSingle();
  return parseHiddenTeachers(data?.value);
}

async function resolveOwnTeacher(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  const db = await loadSgaAdminClient();
  const { data: teacher } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", membership.schoolId)
    .eq("user_id", userId)
    .maybeSingle();
  return { membership, db, teacherId: teacher?.id ? String(teacher.id) : null };
}

export const getMyTeacherContactVisibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { membership, db, teacherId } = await resolveOwnTeacher(context.userId);
    if (!teacherId) return { isTeacher: false as const, visible: true };
    const hidden = await loadHiddenTeachers(db, membership.schoolId);
    return { isTeacher: true as const, visible: !hidden.has(teacherId) };
  });

export const setMyTeacherContactVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ visible: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { membership, db, teacherId } = await resolveOwnTeacher(context.userId);
    if (!teacherId) throw new Error("A sua conta não está ligada a uma ficha de professor.");

    // Controlo de versão: outro professor pode gravar ao mesmo tempo; sem isto,
    // a última gravação apagava a escolha da outra.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: row, error } = await db
        .from("school_settings")
        .select("id, version, value")
        .eq("school_id", membership.schoolId)
        .eq("domain", TEACHER_CONTACT_DOMAIN)
        .maybeSingle();
      if (error) throw publicDatabaseError(error, "Não foi possível ler a preferência.");

      const hidden = parseHiddenTeachers(row?.value);
      if (data.visible) hidden.delete(teacherId);
      else hidden.add(teacherId);
      const value = { hidden: [...hidden].sort() };

      if (!row) {
        const { error: insertError } = await db.from("school_settings").insert({
          school_id: membership.schoolId,
          domain: TEACHER_CONTACT_DOMAIN,
          version: 1,
          value,
          changed_by: context.userId,
        });
        if (!insertError) return { visible: data.visible };
        if (!/duplicate|unique|23505/i.test(insertError.message)) {
          throw publicDatabaseError(insertError, "Não foi possível guardar a preferência.");
        }
        continue;
      }

      const { data: updated, error: updateError } = await db
        .from("school_settings")
        .update({ value, version: Number(row.version ?? 1) + 1, changed_by: context.userId })
        .eq("id", row.id)
        .eq("version", row.version)
        .select("id");
      if (updateError) {
        throw publicDatabaseError(updateError, "Não foi possível guardar a preferência.");
      }
      if (updated?.length) return { visible: data.visible };
    }
    throw new Error("Não foi possível guardar a preferência. Tente outra vez.");
  });
