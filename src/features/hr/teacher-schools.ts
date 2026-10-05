import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { listUserSchoolMemberships } from "@/integrations/supabase/sga";
import {
  resolveVerifiedAccountEmail,
  teacherClassGroupIds,
} from "@/features/students/student-scope";

/**
 * Professor que dá aulas em várias escolas do sistema (ex.: colégio + escola pública).
 *
 * Cada escola continua separada: os alunos, notas e chamadas de uma escola só se
 * abrem com ela activa (troca de escola, `setActiveSchoolId`), e só com o vínculo
 * aprovado nessa escola. Esta lista junta, num só sítio, as turmas do professor em
 * cada escola onde tem vínculo de Professor, para saber onde tem aulas e saltar
 * para lá. Não mostra alunos nem notas de outra escola.
 *
 * Vínculo por aprovar (convidado), suspenso ou revogado: a escola aparece com o
 * estado e sem turmas.
 */

export type TeacherSchoolClass = {
  id: string;
  name: string;
  students: number;
};

export type TeacherSchoolEntry = {
  schoolId: string;
  schoolName: string;
  membershipStatus: string;
  approved: boolean;
  classes: TeacherSchoolClass[];
};

export const MEMBERSHIP_STATUS_LABEL: Record<string, string> = {
  active: "Vínculo aprovado",
  invited: "Vínculo por aprovar",
  suspended: "Vínculo suspenso",
  revoked: "Vínculo revogado",
};

export const listMyTeachingSchools = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeacherSchoolEntry[]> => {
    const db = await loadSgaAdminClient();
    const memberships = (await listUserSchoolMemberships(db, context.userId)).filter((m) =>
      m.allAppRoles.includes("Professor"),
    );
    if (!memberships.length) return [];
    const { resolveUserLinkedEntities } = await import("@/features/auth/server");
    const verifiedEmail = await resolveVerifiedAccountEmail(db, context.userId);

    return Promise.all(
      memberships.map(async (membership): Promise<TeacherSchoolEntry> => {
        const entry: TeacherSchoolEntry = {
          schoolId: membership.schoolId,
          schoolName: membership.schoolName || "Escola",
          membershipStatus: membership.status,
          approved: membership.status === "active",
          classes: [],
        };
        // Só com o vínculo aprovado nessa escola.
        if (!entry.approved) return entry;
        const linked = await resolveUserLinkedEntities(
          db as never,
          membership.schoolId,
          context.userId,
          verifiedEmail,
        );
        if (!linked.teacher_id) return entry;
        const classIds = await teacherClassGroupIds(db, membership.schoolId, linked.teacher_id);
        if (!classIds.length) return entry;
        const [{ data: groups }, { data: enrollments }] = await Promise.all([
          db
            .from("class_groups")
            .select("id, name, code")
            .eq("school_id", membership.schoolId)
            .in("id", classIds)
            .eq("status", "active"),
          db
            .from("enrollments")
            .select("class_group_id")
            .eq("school_id", membership.schoolId)
            .in("class_group_id", classIds)
            .in("status", ["active", "pending"]),
        ]);
        const counts = new Map<string, number>();
        for (const row of enrollments ?? []) {
          const id = String((row as { class_group_id: string }).class_group_id);
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        entry.classes = (groups ?? [])
          .map((group: { id: string; name: string | null; code: string | null }) => ({
            id: String(group.id),
            name: String(group.name || group.code || "Turma"),
            students: counts.get(String(group.id)) ?? 0,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "pt"));
        return entry;
      }),
    );
  });
