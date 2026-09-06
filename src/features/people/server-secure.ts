import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  findPersonDuplicatesInputSchema,
  getPersonInputSchema,
  listTeachersInputSchema,
  searchPeopleInputSchema,
} from "./schemas";
import * as legacy from "./server";

export * from "./server";

async function resolveContextualPersonIds(params: {
  schoolId: string;
  userId: string;
  appRole: string;
}): Promise<Set<string> | null> {
  if (params.appRole === "Administrador" || params.appRole === "Secretaria") return null;

  const db = await loadSgaAdminClient();
  const { data: ownPeople, error: ownError } = await db
    .from("people")
    .select("id")
    .eq("school_id", params.schoolId)
    .eq("user_id", params.userId);
  if (ownError) {
    throw publicDatabaseError(ownError, "Não foi possível validar a identidade da conta.");
  }

  const allowed = new Set((ownPeople ?? []).map((row) => String(row.id)));

  if (params.appRole === "Aluno" || params.appRole === "Professor") return allowed;

  if (params.appRole === "Encarregado") {
    const guardianIds = [...allowed];
    if (!guardianIds.length) return allowed;

    const { data: links, error: linksError } = await db
      .from("student_guardians")
      .select("student_id")
      .eq("school_id", params.schoolId)
      .in("guardian_person_id", guardianIds);
    if (linksError) {
      throw publicDatabaseError(linksError, "Não foi possível validar os educandos vinculados.");
    }
    const studentIds = [...new Set((links ?? []).map((row) => String(row.student_id)))];
    if (!studentIds.length) return allowed;

    const { data: students, error: studentsError } = await db
      .from("students")
      .select("person_id")
      .eq("school_id", params.schoolId)
      .in("id", studentIds);
    if (studentsError) {
      throw publicDatabaseError(studentsError, "Não foi possível validar os educandos.");
    }
    for (const row of students ?? []) allowed.add(String(row.person_id));
    return allowed;
  }

  throw new Error("Este perfil não tem acesso ao directório pessoal de Pessoas.");
}

export const searchPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => searchPeopleInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");

    const allowedIds = await resolveContextualPersonIds({
      schoolId: membership.schoolId,
      userId: context.userId,
      appRole: membership.appRole,
    });
    if (allowedIds === null) return legacy.searchPeople({ data });
    if (!allowedIds.size) return [];

    const db = await loadSgaAdminClient();
    const { data: people, error } = await db
      .from("people")
      .select(
        "id, full_name, preferred_name, email, phone, national_id, status, date_of_birth, photo_url, updated_at",
      )
      .eq("school_id", membership.schoolId)
      .in("id", [...allowedIds])
      .order("full_name");
    if (error) throw publicDatabaseError(error, "Não foi possível pesquisar pessoas.");

    const query = data.query.trim().toLowerCase();
    return (people ?? [])
      .map((person) => ({
        id: String(person.id),
        full_name: String(person.full_name ?? "—"),
        email: (person.email as string | null) ?? null,
        phone_primary: (person.phone as string | null) ?? null,
        status: String(person.status ?? "active"),
        birth_date: (person.date_of_birth as string | null) ?? null,
        nif: (person.national_id as string | null) ?? null,
        photo_url: (person.photo_url as string | null) ?? null,
        updated_at: String(person.updated_at ?? ""),
        roles: [] as string[],
      }))
      .filter((person) => {
        if (!query) return true;
        return [person.full_name, person.email ?? "", person.phone_primary ?? "", person.nif ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .slice(0, data.limit);
  });

export const getPerson = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getPersonInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");

    const allowedIds = await resolveContextualPersonIds({
      schoolId: membership.schoolId,
      userId: context.userId,
      appRole: membership.appRole,
    });
    if (allowedIds !== null && !allowedIds.has(data.id)) {
      throw new Error("Não tem autorização para consultar esta Pessoa.");
    }
    return legacy.getPerson({ data });
  });

export const findPersonDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => findPersonDuplicatesInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    if (membership.appRole !== "Administrador" && membership.appRole !== "Secretaria") {
      throw new Error("Apenas Administração e Secretaria podem verificar duplicados de Pessoas.");
    }
    return legacy.findPersonDuplicates({ data });
  });

export const listTeachers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listTeachersInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");

    if (membership.appRole === "Administrador" || membership.appRole === "Secretaria") {
      return legacy.listTeachers({ data });
    }
    if (membership.appRole !== "Professor") {
      throw new Error("Este perfil não tem acesso ao directório de professores.");
    }

    const ownIds = await resolveContextualPersonIds({
      schoolId: membership.schoolId,
      userId: context.userId,
      appRole: membership.appRole,
    });
    const ownPersonIds = ownIds ?? new Set<string>();
    const rows = await legacy.listTeachers({ data });
    return rows.map((row) =>
      ownPersonIds.has(String(row.person_id))
        ? row
        : {
            ...row,
            email: null,
            phone: null,
          },
    );
  });

export const listStaffDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");

    if (membership.appRole === "Administrador" || membership.appRole === "Secretaria") {
      return legacy.listStaffDirectory();
    }
    if (membership.appRole !== "Professor") {
      throw new Error("Este perfil não tem acesso ao directório interno da equipa.");
    }

    const ownIds = await resolveContextualPersonIds({
      schoolId: membership.schoolId,
      userId: context.userId,
      appRole: membership.appRole,
    });
    const ownPersonIds = ownIds ?? new Set<string>();
    const rows = await legacy.listStaffDirectory();
    return rows.map((row) =>
      row && ownPersonIds.has(String(row.id))
        ? row
        : row
          ? { ...row, email: null, phone_primary: null }
          : row,
    );
  });
