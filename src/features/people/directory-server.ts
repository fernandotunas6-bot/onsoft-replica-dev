import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadStudentScope } from "@/features/students/student-scope";
import { isMissingPeopleGeography } from "./person-fields";
import { scanDirectoryPage, type DirectoryPage } from "./directory-pagination";
import {
  applyTeacherContactVisibility,
  parseHiddenTeachers,
  seesAllTeacherContacts,
  TEACHER_CONTACT_DOMAIN,
} from "./teacher-contact-visibility";
import {
  listTeachersPageInputSchema,
  personInstitutionRoleOptions,
  personRoleOptions,
  searchPeoplePageInputSchema,
} from "./schemas";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;
type Scope = Awaited<ReturnType<typeof loadStudentScope>>;
type PeopleInput = ReturnType<typeof searchPeoplePageInputSchema.parse>;
type TeacherInput = ReturnType<typeof listTeachersPageInputSchema.parse>;

const PERSON_BASE =
  "id, full_name, preferred_name, email, phone, national_id, status, date_of_birth, photo_url, updated_at";
const PERSON_GEO = `${PERSON_BASE}, province, municipality, commune, address`;
const TEACHER_COLUMNS =
  "id, person_id, status, employee_number, hired_on, employment_type, updated_at";
const ROLE_DEPENDENT = new Set<string>(personInstitutionRoleOptions);

function includesTerm(value: unknown, term: string): boolean {
  return String(value ?? "")
    .toLocaleLowerCase("pt")
    .includes(term);
}

function personFieldsMatch(person: Row, term: string): boolean {
  return [
    "full_name",
    "email",
    "phone",
    "national_id",
    "province",
    "municipality",
    "commune",
    "address",
  ].some((field) => includesTerm(person[field], term));
}

function personRow(person: Row, roles: string[]) {
  return {
    id: String(person["id"]),
    full_name: String(person["full_name"] ?? ""),
    email: (person["email"] as string | null) ?? null,
    phone_primary: (person["phone"] as string | null) ?? null,
    status: String(person["status"] ?? ""),
    birth_date: (person["date_of_birth"] as string | null) ?? null,
    nif: (person["national_id"] as string | null) ?? null,
    photo_url: (person["photo_url"] as string | null) ?? null,
    province: (person["province"] as string | null) ?? null,
    municipality: (person["municipality"] as string | null) ?? null,
    commune: (person["commune"] as string | null) ?? null,
    address: (person["address"] as string | null) ?? null,
    updated_at: String(person["updated_at"] ?? ""),
    roles: personRoleOptions.filter((role) => roles.includes(role)),
  };
}

async function personRoleMap(db: AdminDb, schoolId: string, ids: string[], role?: string) {
  const roles = new Map<string, Set<string>>();
  if (!ids.length) return roles;
  const [students, teachers, guardians, declared] = await Promise.all([
    db.from("students").select("person_id").eq("school_id", schoolId).in("person_id", ids),
    db.from("teachers").select("person_id").eq("school_id", schoolId).in("person_id", ids),
    db
      .from("student_guardians")
      .select("guardian_person_id")
      .eq("school_id", schoolId)
      .in("guardian_person_id", ids),
    db
      .from("person_roles")
      .select("person_id, role")
      .eq("school_id", schoolId)
      .eq("active", true)
      .in("person_id", ids),
  ]);
  for (const result of [students, teachers, guardians]) {
    if (result.error)
      throw publicDatabaseError(result.error, "Não foi possível verificar vínculos.");
  }
  // Evita devolver um filtro institucional incompleto quando falta a tabela.
  if (declared.error && role && ROLE_DEPENDENT.has(role)) {
    throw publicDatabaseError(
      declared.error,
      "Não foi possível consultar os vínculos institucionais.",
    );
  }
  if (
    declared.error &&
    !/person_roles|42P01|42703|schema cache|PGRST/i.test(declared.error.message ?? "")
  ) {
    throw publicDatabaseError(
      declared.error,
      "Não foi possível consultar os vínculos institucionais.",
    );
  }
  function add(id: unknown, value: string) {
    const key = String(id ?? "");
    if (!key) return;
    const set = roles.get(key) ?? new Set<string>();
    set.add(value);
    roles.set(key, set);
  }
  for (const row of students.data ?? []) add(row.person_id, "aluno");
  for (const row of teachers.data ?? []) add(row.person_id, "professor");
  for (const row of guardians.data ?? []) add(row.guardian_person_id, "encarregado");
  for (const row of declared.data ?? []) add(row.person_id, String(row.role ?? ""));
  return roles;
}

async function readPeople(
  db: AdminDb,
  schoolId: string,
  scope: Scope,
  data: PeopleInput,
  offset: number,
  size: number,
  count: boolean,
) {
  async function query(columns: string) {
    let builder = db
      .from("people")
      .select(columns, count ? { count: "exact" } : undefined)
      .eq("school_id", schoolId)
      .order("full_name")
      .order("id");
    if (!scope.all) builder = builder.in("id", scope.personIds);
    if (data.province) builder = builder.eq("province", data.province);
    if (data.municipality) builder = builder.eq("municipality", data.municipality);
    if (data.commune) builder = builder.eq("commune", data.commune);
    if (data.status !== "todos") builder = builder.eq("status", data.status);
    return builder.range(offset, offset + size - 1);
  }
  let result = await query(PERSON_GEO);
  if (result.error && isMissingPeopleGeography(result.error)) {
    if (data.province || data.municipality || data.commune) {
      throw new Error("A pesquisa territorial requer a migração de localização de Pessoas.");
    }
    result = await query(PERSON_BASE);
  }
  if (result.error) throw publicDatabaseError(result.error, "Não foi possível pesquisar pessoas.");
  return { rows: (result.data ?? []) as unknown as Row[], count: result.count };
}

/**
 * Endpoint adicional: o searchPeople antigo mantém o seu contrato array para
 * outros consumidores. Aqui todas as páginas são calculadas no servidor.
 */
export const searchPeoplePage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => searchPeoplePageInputSchema.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<DirectoryPage<ReturnType<typeof personRow>>> => {
    if (!context) throw new Error("Sessão inválida.");
    const membership = await requireSgaWriterFor("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const scope = await loadStudentScope(db, membership, context.userId);
    if (!scope.all && !scope.personIds.length) {
      return { items: [], total: 0, page: data.page, pageSize: data.pageSize };
    }
    const term = data.query.trim().toLocaleLowerCase("pt");
    const searchedRole = Boolean(term) && personRoleOptions.some((role) => role.includes(term));
    const roleFilter = data.role;
    async function hydrate(rows: Row[]) {
      const candidates =
        term && !searchedRole ? rows.filter((person) => personFieldsMatch(person, term)) : rows;
      const roleMap = await personRoleMap(
        db,
        membership.schoolId,
        candidates.map((p) => String(p["id"])),
        roleFilter,
      );
      return candidates
        .map((record) => ({
          fieldsMatch: personFieldsMatch(record, term),
          person: personRow(record, [...(roleMap.get(String(record["id"])) ?? [])]),
        }))
        .filter(
          ({ person, fieldsMatch }) =>
            (!roleFilter || person.roles.includes(roleFilter)) &&
            (!term || fieldsMatch || person.roles.some((role) => role.includes(term))),
        )
        .map(({ person }) => person);
    }

    // Navegação normal: o Postgres faz o count e o range; não há scan completo.
    if (!term && !roleFilter) {
      const offset = (data.page - 1) * data.pageSize;
      const result = await readPeople(
        db,
        membership.schoolId,
        scope,
        data,
        offset,
        data.pageSize,
        true,
      );
      return {
        items: await hydrate(result.rows),
        total:
          result.count ??
          (() => {
            throw new Error("Contagem de pessoas indisponível.");
          })(),
        page: data.page,
        pageSize: data.pageSize,
      };
    }

    // Pesquisa por textos e vínculos: nunca limitar antes dos filtros. A leitura
    // por lotes possui um limite explícito, falhando sem devolver contagens parciais.
    return scanDirectoryPage({
      page: data.page,
      pageSize: data.pageSize,
      batchSize: 100,
      maxBatches: 500,
      read: async (offset, size) =>
        (await readPeople(db, membership.schoolId, scope, data, offset, size, false)).rows,
      prepare: hydrate,
    });
  });

async function teacherRows(
  db: AdminDb,
  schoolId: string,
  rows: Row[],
  hidden: Set<string>,
  canSeeContacts: boolean,
) {
  const ids = [...new Set(rows.map((row) => String(row["person_id"])).filter(Boolean))];
  const { data: people, error } = ids.length
    ? await db
        .from("people")
        .select("id, full_name, email, phone, photo_url")
        .eq("school_id", schoolId)
        .in("id", ids)
    : { data: [] as Row[], error: null };
  if (error)
    throw publicDatabaseError(error, "Não foi possível consultar os dados dos professores.");
  const names = new Map((people ?? []).map((person) => [String(person.id), person]));
  return applyTeacherContactVisibility(
    rows.map((teacher) => {
      const person = names.get(String(teacher["person_id"]));
      return {
        id: String(teacher["id"]),
        person_id: String(teacher["person_id"]),
        employee_number: String(teacher["employee_number"] ?? ""),
        hired_on: (teacher["hired_on"] as string | null) ?? null,
        employment_type: (teacher["employment_type"] as string | null) ?? null,
        status: String(teacher["status"] ?? ""),
        full_name: String(person?.full_name ?? "Professor"),
        email: (person?.email as string | null) ?? null,
        phone: (person?.phone as string | null) ?? null,
        photo_url: (person?.photo_url as string | null) ?? null,
        updated_at: String(teacher["updated_at"] ?? ""),
      };
    }),
    hidden,
    canSeeContacts,
  );
}

export const listTeachersPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listTeachersPageInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem vínculo activo com uma escola.");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    // A preferência de privacidade não pode assumir "visível" perante erro.
    const visibility = await db
      .from("school_settings")
      .select("value")
      .eq("school_id", membership.schoolId)
      .eq("domain", TEACHER_CONTACT_DOMAIN)
      .maybeSingle();
    if (visibility.error)
      throw publicDatabaseError(
        visibility.error,
        "Não foi possível verificar a privacidade dos professores.",
      );
    const hidden = parseHiddenTeachers(visibility.data?.value);
    const canSeeContacts = seesAllTeacherContacts(membership.allAppRoles ?? [membership.appRole]);
    async function read(offset: number, size: number, count: boolean) {
      let query = db
        .from("teachers")
        .select(TEACHER_COLUMNS, count ? { count: "exact" } : undefined)
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .order("id");
      if (data.status !== "all") query = query.eq("status", data.status);
      const result = await query.range(offset, offset + size - 1);
      if (result.error)
        throw publicDatabaseError(result.error, "Não foi possível carregar os professores.");
      return { rows: (result.data ?? []) as Row[], total: result.count };
    }
    const term = (data.query ?? "").trim().toLocaleLowerCase("pt");
    async function prepare(rows: Row[]) {
      const visible = await teacherRows(db, schoolId, rows, hidden, canSeeContacts);
      return term
        ? visible.filter(
            (teacher) =>
              includesTerm(teacher.full_name, term) ||
              includesTerm(teacher.employee_number, term) ||
              includesTerm(teacher.email, term),
          )
        : visible;
    }
    if (!term) {
      const found = await read((data.page - 1) * data.pageSize, data.pageSize, true);
      return {
        items: await prepare(found.rows),
        total:
          found.total ??
          (() => {
            throw new Error("Contagem de professores indisponível.");
          })(),
        page: data.page,
        pageSize: data.pageSize,
      };
    }
    return scanDirectoryPage({
      page: data.page,
      pageSize: data.pageSize,
      batchSize: 100,
      maxBatches: 500,
      read: async (offset, size) => (await read(offset, size, false)).rows,
      prepare,
    });
  });
