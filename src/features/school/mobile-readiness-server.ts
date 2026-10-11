/**
 * Lê na base o que `buildMobileReadiness` precisa, com as regras do servidor do
 * Mobile (`src/features/mobile-v4/academic-scope.server.ts`). Só o
 * Administrador. Só leitura: nada aqui escreve, e os e-mails não saem do
 * servidor (apenas se faltam ou se repetem).
 *
 * Lê com `context.supabase` (JWT, respeita RLS). Na produção (snapshot de
 * 2026-10-06) todas as tabelas lidas têm política SELECT que inclui o
 * Administrador da escola: academic_years, class_groups, enrollments,
 * class_subjects, academic_schedules, timetable_slots, teachers, students,
 * people, school_invitations (`rbac.memberships.read`), school_memberships e
 * member_roles. Uma leitura recusada falha a página, nunca dá «tudo pronto».
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSgaWriterFor } from "@/integrations/supabase/sga-admin";
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { mapSgaRoleCode } from "@/integrations/supabase/sga";
import {
  buildMobileReadiness,
  countEmails,
  emailState,
  normalizeEmail,
  type MobileReadiness,
  type MobileReadinessSnapshot,
} from "./mobile-readiness";

/** Cliente do utilizador (RLS) ou privilegiado: as consultas são as mesmas. */
type Db = Pick<Awaited<ReturnType<typeof loadSgaAdminClient>>, "from">;
type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

const PAGE = 1000;
const CHUNK = 150;

/** Todas as linhas, página a página: o PostgREST corta cada resposta em 1000. */
async function readAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) throw new Error("Não foi possível ler os dados da prontidão do Mobile.");
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** O mesmo, com a lista de IDs partida em pedaços (URL curto). */
async function readIn<T>(
  ids: string[],
  page: (chunk: string[], from: number, to: number) => Page<T>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    rows.push(...(await readAll((from, to) => page(chunk, from, to))));
  }
  return rows;
}

export async function loadMobileReadinessSnapshot(
  db: Db,
  schoolId: string,
): Promise<MobileReadinessSnapshot> {
  const years = await readAll<{ id: string; name: string }>((a, b) =>
    db
      .from("academic_years")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .order("id")
      .range(a, b),
  );
  const yearIds = years.map((y) => y.id);
  const groups = await readIn<{ id: string; name: string }>(yearIds, (ids, a, b) =>
    db
      .from("class_groups")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .in("academic_year_id", ids)
      .order("id")
      .range(a, b),
  );
  const groupIds = groups.map((g) => g.id);

  const [enrollments, classSubjects, schedules, teachers] = await Promise.all([
    readIn<{ student_id: string; class_group_id: string }>(groupIds, (ids, a, b) =>
      db
        .from("enrollments")
        .select("student_id, class_group_id")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .in("academic_year_id", yearIds)
        .in("class_group_id", ids)
        .order("id")
        .range(a, b),
    ),
    readIn<{ id: string; class_group_id: string; teacher_id: string | null }>(
      groupIds,
      (ids, a, b) =>
        db
          .from("class_subjects")
          .select("id, class_group_id, teacher_id")
          .eq("school_id", schoolId)
          .eq("status", "active")
          .in("class_group_id", ids)
          .order("id")
          .range(a, b),
    ),
    readIn<{ id: string }>(groupIds, (ids, a, b) =>
      db
        .from("academic_schedules")
        .select("id")
        .eq("school_id", schoolId)
        .eq("status", "published")
        .is("deleted_at", null)
        .in("class_group_id", ids)
        .order("id")
        .range(a, b),
    ),
    readAll<{ id: string; person_id: string; user_id: string | null }>((a, b) =>
      db
        .from("teachers")
        .select("id, person_id, user_id")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .order("id")
        .range(a, b),
    ),
  ]);

  const published = new Set(schedules.map((s) => s.id));
  const [slots, students] = await Promise.all([
    readIn<{ class_subject_id: string; schedule_id: string | null }>(
      classSubjects.map((cs) => cs.id),
      (ids, a, b) =>
        db
          .from("timetable_slots")
          .select("class_subject_id, schedule_id")
          .eq("school_id", schoolId)
          .eq("status", "active")
          .in("class_subject_id", ids)
          .order("id")
          .range(a, b),
    ),
    readIn<{ id: string; person_id: string }>(
      enrollments.map((e) => e.student_id),
      (ids, a, b) =>
        db
          .from("students")
          .select("id, person_id")
          .eq("school_id", schoolId)
          .is("deleted_at", null)
          .in("id", ids)
          .order("id")
          .range(a, b),
    ),
  ]);
  // Como o Mobile: um horário sem versão (legado) ou de uma publicação activa.
  const timetabled = new Set(
    slots
      .filter((s) => !s.schedule_id || published.has(s.schedule_id))
      .map((s) => s.class_subject_id),
  );

  const [people, unlinked, invitations] = await Promise.all([
    readIn<{ id: string; full_name: string; email: string | null; user_id: string | null }>(
      [...students, ...teachers].map((row) => row.person_id),
      (ids, a, b) =>
        db
          .from("people")
          .select("id, full_name, email, user_id")
          .eq("school_id", schoolId)
          .is("deleted_at", null)
          .in("id", ids)
          .order("id")
          .range(a, b),
    ),
    readAll<{ email: string }>((a, b) =>
      db
        .from("people")
        .select("email")
        .eq("school_id", schoolId)
        .is("user_id", null)
        .is("deleted_at", null)
        .not("email", "is", null)
        .order("id")
        .range(a, b),
    ),
    readAll<{ email: string; expires_at: string | null }>((a, b) =>
      db
        .from("school_invitations")
        .select("email, expires_at")
        .eq("school_id", schoolId)
        .eq("status", "pending")
        .order("id")
        .range(a, b),
    ),
  ]);
  const personMap = new Map(people.map((p) => [p.id, p]));

  // Contas ligadas: vínculo activo à escola e os seus papéis.
  const accountOf = (personId: string, direct?: string | null) =>
    direct ?? personMap.get(personId)?.user_id ?? null;
  const userIds = [
    ...students.map((s) => accountOf(s.person_id)),
    ...teachers.map((t) => accountOf(t.person_id, t.user_id)),
  ].filter((id): id is string => !!id);
  const memberships = await readIn<{ id: string; user_id: string }>(userIds, (ids, a, b) =>
    db
      .from("school_memberships")
      .select("id, user_id")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .in("user_id", ids)
      .order("id")
      .range(a, b),
  );
  const memberRoles = await readIn<{
    membership_id: string;
    roles: { code: string } | { code: string }[] | null;
  }>(
    memberships.map((m) => m.id),
    (ids, a, b) =>
      db
        .from("member_roles")
        .select("membership_id, roles!member_roles_role_id_fkey(code)")
        .eq("school_id", schoolId)
        .in("membership_id", ids)
        .order("membership_id")
        .order("role_id")
        .range(a, b),
  );
  const membershipUser = new Map(memberships.map((m) => [m.id, m.user_id]));
  const rolesByUser = new Map<string, Set<string>>();
  for (const row of memberRoles) {
    const user = membershipUser.get(row.membership_id);
    if (!user) continue;
    for (const role of Array.isArray(row.roles) ? row.roles : row.roles ? [row.roles] : []) {
      const set = rolesByUser.get(user) ?? new Set<string>();
      set.add(mapSgaRoleCode(role.code));
      rolesByUser.set(user, set);
    }
  }

  const now = Date.now();
  const invited = new Set(
    invitations
      .filter((i) => !i.expires_at || Date.parse(i.expires_at) > now)
      .map((i) => normalizeEmail(i.email))
      .filter(Boolean),
  );
  const emailCounts = countEmails(unlinked.map((p) => p.email));

  const person = (
    id: string,
    personId: string,
    appRole: "Aluno" | "Professor",
    direct?: string | null,
  ) => {
    const p = personMap.get(personId);
    const account = accountOf(personId, direct);
    const email = normalizeEmail(p?.email);
    return {
      id,
      name: p?.full_name?.trim() || "Ficha sem nome",
      hasAccount: !!account,
      hasRole: !!account && !!rolesByUser.get(account)?.has(appRole),
      email: emailState(p?.email, !!account, emailCounts),
      invitePending: !!email && invited.has(email),
    };
  };

  const studentGroups = new Map<string, string[]>();
  for (const e of enrollments)
    studentGroups.set(e.student_id, [...(studentGroups.get(e.student_id) ?? []), e.class_group_id]);
  const subjectsByTeacher = new Map<string, number>();
  for (const cs of classSubjects)
    if (cs.teacher_id)
      subjectsByTeacher.set(cs.teacher_id, (subjectsByTeacher.get(cs.teacher_id) ?? 0) + 1);

  return {
    activeYears: years.map((y) => y.name),
    students: students.map((s) => ({
      ...person(s.id, s.person_id, "Aluno"),
      classGroupIds: [...new Set(studentGroups.get(s.id) ?? [])],
    })),
    teachers: teachers.map((t) => ({
      ...person(t.id, t.person_id, "Professor", t.user_id),
      classSubjects: subjectsByTeacher.get(t.id) ?? 0,
    })),
    classGroups: groups.map((g) => {
      const subjects = classSubjects.filter((cs) => cs.class_group_id === g.id);
      return {
        id: g.id,
        name: g.name,
        students: new Set(
          enrollments.filter((e) => e.class_group_id === g.id).map((e) => e.student_id),
        ).size,
        subjects: subjects.length,
        subjectsWithoutTeacher: subjects.filter((cs) => !cs.teacher_id).length,
        subjectsWithoutTimetable: subjects.filter((cs) => !timetabled.has(cs.id)).length,
      };
    }),
  };
}

export const getMobileReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MobileReadiness> => {
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    return buildMobileReadiness(
      await loadMobileReadinessSnapshot(context.supabase as unknown as Db, membership.schoolId),
    );
  });
