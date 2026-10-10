import { requireAal2 } from "@/features/hr/require-aal2";
import type { Database, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { canSeePerson, loadStudentScope } from "@/features/students/student-scope";
import {
  applyTeacherContactVisibility,
  loadHiddenTeachers,
  seesAllTeacherContacts,
} from "./teacher-contact-visibility";
import { rpcArgs, sgaClient } from "@/integrations/supabase/sga";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isMissingFunction,
  isRpcAuthDenied,
  publicDatabaseError,
} from "@/integrations/supabase/server-error";
import { reportSigaError } from "@/lib/ops-report";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { resolvePersonContext } from "./person-context";
import { mapSgaGuardianRelationship } from "@/features/students/schemas";
import {
  addPersonDocumentInputSchema,
  createPersonInputSchema,
  createTeacherInputSchema,
  deleteTeacherInputSchema,
  findPersonDuplicatesInputSchema,
  getPersonInputSchema,
  listTeachersInputSchema,
  mergePeopleInputSchema,
  searchPeopleInputSchema,
  setPersonInstitutionRolesInputSchema,
  setPersonPhotoUrlInputSchema,
  updatePersonInputSchema,
  updatePersonStatusInputSchema,
  updateTeacherInputSchema,
  normalizePersonPhone,
  personInstitutionRoleOptions,
  personRoleOptions,
} from "./schemas";
import { isAngolaBiNif, normalizePersonNif } from "@/lib/angola-identity";
import { buildPersonInsert, isMissingPeopleGeography } from "./person-fields";
import { syncBiDocumentFromNif } from "./bi-document";
import { insertTeacherWithNextNumber, isTeacherNumberTaken } from "./teacher-number";
import { schoolTodayIso } from "@/lib/school-date";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

type PersonDocumentSummary = {
  id: string;
  document_type: string;
  document_number: string;
  issued_at: string | null;
  expires_at: string | null;
  file_id: string | null;
  file_name: string | null;
};

function toPersonDocumentSummary(row: Record<string, unknown>): PersonDocumentSummary {
  return {
    id: String(row["id"] ?? ""),
    document_type: String(row["document_type"] ?? ""),
    document_number: String(row["document_number"] ?? ""),
    issued_at: (row["issued_at"] as string | null) ?? null,
    expires_at: (row["expires_at"] as string | null) ?? null,
    file_id: (row["file_id"] as string | null) ?? null,
    file_name: (row["file_name"] as string | null) ?? null,
  };
}

async function insertPersonDocuments(
  db: AdminDb,
  schoolId: string,
  personId: string,
  userId: string,
  documents: Array<{
    document_type: string;
    document_number: string;
    issued_at?: string | undefined;
    expires_at?: string | undefined;
  }>,
) {
  if (!documents.length) return;
  const payload = documents.map((document) => ({
    school_id: schoolId,
    person_id: personId,
    document_type: document.document_type,
    document_number: document.document_number,
    issued_at: document.issued_at || null,
    expires_at: document.expires_at || null,
    created_by: userId,
    updated_by: userId,
  }));
  const { error } = await db.from("person_documents").insert(payload);
  if (error) {
    throw publicDatabaseError(error, "Não foi possível guardar o documento da pessoa.");
  }
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function isMissingPersonRoles(error: { message?: string; code?: string } | null | undefined) {
  return Boolean(
    error &&
    (/person_roles|42P01|42703|schema cache|PGRST/i.test(error.message ?? "") ||
      error.code === "42P01"),
  );
}

const institutionRoleSet = new Set<string>(personInstitutionRoleOptions);

async function assertPersonRoleStoreAvailable(db: AdminDb) {
  const probe = await db.from("person_roles").select("id").limit(1);
  if (probe.error && isMissingPersonRoles(probe.error)) {
    throw new Error(
      "Os vínculos institucionais ainda não estão activos nesta base. Aplique a migration person_institution_roles.",
    );
  }
  if (probe.error) {
    throw publicDatabaseError(probe.error, "Não foi possível validar os vínculos da pessoa.");
  }
}

async function syncPersonInstitutionRoles(
  db: AdminDb,
  input: {
    schoolId: string;
    personId: string;
    roles: string[];
    userId: string;
  },
) {
  const selected = new Set(input.roles.filter((role) => institutionRoleSet.has(role)));
  const { data: existing, error } = await db
    .from("person_roles")
    .select("id, role, active")
    .eq("school_id", input.schoolId)
    .eq("person_id", input.personId);

  if (error && isMissingPersonRoles(error)) {
    throw new Error(
      "Os vínculos institucionais ainda não estão activos nesta base. Aplique a migration person_institution_roles.",
    );
  }
  if (error) throw publicDatabaseError(error, "Não foi possível carregar os vínculos da pessoa.");

  const rows = (existing ?? []) as Array<{ id: string; role: string; active: boolean }>;
  const byRole = new Map(rows.map((row) => [row.role, row] as const));
  const now = new Date().toISOString();

  const toActivate = rows
    .filter((row) => institutionRoleSet.has(row.role) && selected.has(row.role) && !row.active)
    .map((row) => row.id);
  const toDeactivate = rows
    .filter((row) => institutionRoleSet.has(row.role) && !selected.has(row.role) && row.active)
    .map((row) => row.id);
  const toInsert = [...selected].filter((role) => !byRole.has(role));

  if (toActivate.length) {
    const { error: activateError } = await db
      .from("person_roles")
      .update({
        active: true,
        deleted_at: null,
        updated_at: now,
        updated_by: input.userId,
      })
      .in("id", toActivate);
    if (activateError) {
      throw publicDatabaseError(activateError, "Não foi possível activar os vínculos da pessoa.");
    }
  }

  if (toDeactivate.length) {
    const { error: deactivateError } = await db
      .from("person_roles")
      .update({
        active: false,
        updated_at: now,
        updated_by: input.userId,
      })
      .in("id", toDeactivate);
    if (deactivateError) {
      throw publicDatabaseError(
        deactivateError,
        "Não foi possível desactivar os vínculos da pessoa.",
      );
    }
  }

  if (toInsert.length) {
    const { error: insertError } = await db.from("person_roles").insert(
      toInsert.map((role) => ({
        school_id: input.schoolId,
        person_id: input.personId,
        role,
        active: true,
        created_by: input.userId,
        updated_by: input.userId,
      })),
    );
    if (insertError) {
      throw publicDatabaseError(insertError, "Não foi possível criar os vínculos da pessoa.");
    }
  }

  return [...selected];
}

export const searchPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => searchPeopleInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    // Lista toda a gente da escola com contactos, BI, data de nascimento e
    // morada: é da Secretaria (como `findPersonDuplicates` e a ficha de pessoa).
    // Antes bastava ser membro, e um aluno ou encarregado lia os dados de todos.
    const membership = await requireSgaWriterFor("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    // Alunos e encarregados também são membros: sem este âmbito recebiam a
    // lista da escola inteira, com contactos, BI e moradas. Como em getPerson,
    // só vêem a própria ficha (e a dos educandos).
    const scope = await loadStudentScope(db, membership, context.userId);
    if (!scope.all && scope.personIds.length === 0) return [];

    const baseColumns =
      "id, full_name, preferred_name, email, phone, national_id, status, date_of_birth, photo_url, updated_at";
    const geographyColumns = `${baseColumns}, province, municipality, commune, address`;

    let peopleQuery = db
      .from("people")
      .select(geographyColumns)
      .eq("school_id", membership.schoolId)
      .order("full_name")
      .limit(Math.max(data.limit * 3, 50));
    if (!scope.all) peopleQuery = peopleQuery.in("id", scope.personIds);
    if (data.province) peopleQuery = peopleQuery.eq("province", data.province);
    if (data.municipality) peopleQuery = peopleQuery.eq("municipality", data.municipality);
    if (data.commune) peopleQuery = peopleQuery.eq("commune", data.commune);

    let { data: people, error } = await peopleQuery;
    if (error && isMissingPeopleGeography(error)) {
      if (data.province || data.municipality || data.commune) {
        throw new Error(
          "Os filtros territoriais ainda não estão activos nesta base. Aplique a migration de localização de Pessoas.",
        );
      }
      let fallbackQuery = db
        .from("people")
        .select(baseColumns)
        .eq("school_id", membership.schoolId)
        .order("full_name")
        .limit(Math.max(data.limit * 3, 50));
      if (!scope.all) fallbackQuery = fallbackQuery.in("id", scope.personIds);
      const fallback = await fallbackQuery;
      people = (fallback.data as typeof people) ?? null;
      error = fallback.error;
    }
    if (error) throw publicDatabaseError(error, "Não foi possível pesquisar pessoas.");

    const query = (data.query ?? "").trim().toLowerCase();
    const mapped = (people ?? []).map((person: Record<string, unknown>) => ({
      id: person["id"] as string,
      full_name: person["full_name"] as string,
      email: (person["email"] as string | null) ?? null,
      phone_primary: (person["phone"] as string | null) ?? null,
      status: person["status"] as string,
      birth_date: (person["date_of_birth"] as string | null) ?? null,
      nif: (person["national_id"] as string | null) ?? null,
      photo_url: (person["photo_url"] as string | null) ?? null,
      province: (person["province"] as string | null) ?? null,
      municipality: (person["municipality"] as string | null) ?? null,
      commune: (person["commune"] as string | null) ?? null,
      address: (person["address"] as string | null) ?? null,
      updated_at: person["updated_at"] as string,
      roles: [] as string[],
    }));

    const personIds = mapped.map((person) => person.id);
    if (!personIds.length) return [];

    const [studentRoles, teacherRoles, guardianRoles, declaredRoles] = await Promise.all([
      db
        .from("students")
        .select("person_id")
        .eq("school_id", membership.schoolId)
        .in("person_id", personIds),
      db
        .from("teachers")
        .select("person_id")
        .eq("school_id", membership.schoolId)
        .in("person_id", personIds),
      db
        .from("student_guardians")
        .select("guardian_person_id")
        .eq("school_id", membership.schoolId)
        .in("guardian_person_id", personIds),
      db
        .from("person_roles")
        .select("person_id, role")
        .eq("school_id", membership.schoolId)
        .eq("active", true)
        .in("person_id", personIds),
    ]);

    if (
      data.role &&
      institutionRoleSet.has(data.role) &&
      declaredRoles.error &&
      isMissingPersonRoles(declaredRoles.error)
    ) {
      throw new Error(
        "O filtro por vínculo institucional requer a migration person_institution_roles.",
      );
    }

    const rolesByPerson = new Map<string, Set<string>>();
    const addRole = (personId: unknown, role: string) => {
      const id = String(personId ?? "");
      if (!id) return;
      const current = rolesByPerson.get(id) ?? new Set<string>();
      current.add(role);
      rolesByPerson.set(id, current);
    };
    for (const row of studentRoles.data ?? []) addRole(row.person_id, "aluno");
    for (const row of teacherRoles.data ?? []) addRole(row.person_id, "professor");
    for (const row of guardianRoles.data ?? []) addRole(row.guardian_person_id, "encarregado");
    for (const row of declaredRoles.data ?? []) addRole(row.person_id, String(row.role ?? ""));

    let filtered = mapped.map((person) => {
      const personRoles = rolesByPerson.get(person.id) ?? new Set<string>();
      return {
        ...person,
        roles: personRoleOptions.filter((role) => personRoles.has(role)),
      };
    });

    if (query) {
      filtered = filtered.filter((person) => {
        const haystack = [
          person.full_name,
          person.email ?? "",
          person.phone_primary ?? "",
          person.nif ?? "",
          person.province ?? "",
          person.municipality ?? "",
          person.commune ?? "",
          person.address ?? "",
          person.roles.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }
    if (data.role) {
      filtered = filtered.filter((person) => person.roles.includes(data.role!));
    }
    return filtered.slice(0, data.limit);
  });

export const findPersonDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => findPersonDuplicatesInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterFor("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const name = data.fullName.trim().toLowerCase();
    const email = (data.email ?? "").trim().toLowerCase();
    const phone = normalizePhone(data.phone);
    const nif = (data.nif ?? data.documentNumber ?? "").trim().toLowerCase();
    const birth = data.birthDate ?? "";

    // Procura dirigida por cada critério, em vez das primeiras 250 fichas da
    // escola: numa escola grande o duplicado estava quase sempre fora da amostra.
    const likeSafe = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
    const columns = "id, full_name, email, phone, national_id, date_of_birth, status";
    const base = () => db.from("people").select(columns).eq("school_id", membership.schoolId);
    const lookups = [
      name
        ? base()
            .ilike("full_name", `%${likeSafe(name)}%`)
            .limit(50)
        : null,
      email ? base().ilike("email", likeSafe(email)).limit(10) : null,
      phone.length >= 9
        ? base()
            .ilike("phone", `%${phone.slice(-9)}%`)
            .limit(10)
        : null,
      nif ? base().ilike("national_id", likeSafe(nif)).limit(10) : null,
    ].filter((query) => query !== null);
    const results = await Promise.all(lookups);
    const lookupError = results.find((result) => result.error)?.error;
    if (lookupError)
      throw publicDatabaseError(lookupError, "Não foi possível verificar duplicados.");
    const people = [
      ...new Map(
        results.flatMap((result) => result.data ?? []).map((row) => [String(row.id), row]),
      ).values(),
    ];

    return people
      .map((person: Record<string, unknown>) => {
        let score = 0;
        const reasons: string[] = [];
        const personName = String(person["full_name"] ?? "").toLowerCase();
        if (name && personName === name) {
          score += 0.7;
          reasons.push("nome exacto");
        } else if (name && personName.includes(name)) {
          score += 0.45;
          reasons.push("nome semelhante");
        }
        if (email && String(person["email"] ?? "").toLowerCase() === email) {
          score += 0.35;
          reasons.push("email");
        }
        if (phone && normalizePhone(String(person["phone"] ?? "")) === phone) {
          score += 0.3;
          reasons.push("telefone");
        }
        if (nif && String(person["national_id"] ?? "").toLowerCase() === nif) {
          score += 0.4;
          reasons.push("documento/NIF");
        }
        if (birth && person["date_of_birth"] === birth) {
          score += 0.2;
          reasons.push("data de nascimento");
        }
        return {
          id: person["id"] as string,
          full_name: person["full_name"] as string,
          score: Math.min(score, 1),
          match_reason: reasons.join(", ") || "semelhança parcial",
          status: person["status"] as string,
        };
      })
      .filter((row) => row.score >= 0.45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  });

export const getPerson = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getPersonInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    const { data: person, error } = await db
      .from("people")
      .select("*")
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível carregar a pessoa.");
    if (!person) throw new Error("Pessoa não encontrada.");
    const scope = await loadStudentScope(db, membership, context.userId);
    if (!canSeePerson(scope, String(person.id))) throw new Error("Pessoa não encontrada.");
    const { data: documents, error: documentsError } = await db
      .from("person_documents")
      .select("id, document_type, document_number, issued_at, expires_at, file_id, file_name")
      .eq("school_id", membership.schoolId)
      .eq("person_id", person.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    let resolvedDocuments: Array<{
      id: string;
      document_type: string;
      document_number: string;
      issued_at: string | null;
      expires_at: string | null;
      file_id?: string | null;
      file_name?: string | null;
    }> = documents ?? [];
    if (documentsError && /file_id|file_name|42703|schema cache/i.test(documentsError.message)) {
      const fallback = await db
        .from("person_documents")
        .select("id, document_type, document_number, issued_at, expires_at")
        .eq("school_id", membership.schoolId)
        .eq("person_id", person.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      resolvedDocuments = fallback.data ?? [];
    } else if (
      documentsError &&
      !/schema cache|does not exist|42P01|PGRST/i.test(documentsError.message)
    ) {
      throw publicDatabaseError(documentsError, "Não foi possível carregar os documentos.");
    }

    const personContext = await resolvePersonContext(
      db,
      membership.schoolId,
      person.id,
      Boolean(person.email),
    );

    return {
      ...person,
      phone_primary: person.phone,
      birth_date: person.date_of_birth,
      nif: person.national_id,
      documents: resolvedDocuments,
      roles: personContext.roles,
      academic_summary: personContext.academic_summary,
      financial_summary: personContext.financial_summary,
      has_contact_email: personContext.has_contact_email,
    };
  });

export const createPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createPersonInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims, "Cadastrar a pessoa");
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const personInput = data.person;
    const roles = data.roles ?? [];

    const { payload: personPayload } = buildPersonInsert(personInput, {
      schoolId: membership.schoolId,
      userId: context.userId,
    });

    const firstRelationship = data.relationships[0];
    const { data: result, error } = await context.supabase.rpc("siga_create_person_bundle", {
      p_school_id: membership.schoolId,
      p_person: personPayload,
      p_documents: data.documents.map((doc) => ({
        ...doc,
        document_number:
          doc.document_type === "bi"
            ? (normalizePersonNif(doc.document_number) ?? doc.document_number)
            : doc.document_number,
      })),
      p_roles: roles,
      p_guardian: firstRelationship
        ? {
            person_id: firstRelationship.related_person_id,
            relationship: mapSgaGuardianRelationship(firstRelationship.relationship_type),
            primary: true,
            financial: firstRelationship.relationship_type === "responsavel_financeiro",
          }
        : {},
    });
    if (error)
      throw publicDatabaseError(
        error,
        "Não foi possível concluir o cadastro. Nenhum registo foi criado.",
      );
    const person = result as unknown as Database["public"]["Tables"]["people"]["Row"];

    return {
      ...person,
      phone_primary: person.phone,
      birth_date: person.date_of_birth,
      nif: person.national_id,
      roles,
    };
  });

export const mergePeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => mergePeopleInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    if (data.survivorId === data.duplicateId) {
      throw new Error("Seleccione duas pessoas diferentes.");
    }
    requireAal2(context.claims, "Fundir fichas de pessoas");
    const db = await loadSgaAdminClient();

    // Numa só transacção (private.merge_people, migração 20261010110000): tudo ou
    // nada. Antes de a migração ser aplicada, segue o caminho em passos, abaixo.
    const { error: rpcError } = await db.rpc(
      "siga_merge_people" as never,
      {
        p_school_id: membership.schoolId,
        p_survivor_id: data.survivorId,
        p_duplicate_id: data.duplicateId,
        p_reason: data.reason,
        p_actor: context.userId,
      } as never,
    );
    if (rpcError && !isMissingFunction(rpcError)) {
      throw publicDatabaseError(rpcError, "Não foi possível fundir as fichas.");
    }
    if (rpcError) {
      await mergePeopleInSteps(db, {
        schoolId: membership.schoolId,
        survivorId: data.survivorId,
        duplicateId: data.duplicateId,
        reason: data.reason,
        userId: context.userId,
      });
    }

    return {
      survivorId: data.survivorId,
      duplicateId: data.duplicateId,
      reason: data.reason,
    };
  });

/**
 * A fusão em passos soltos, para a base sem `private.merge_people` (migração
 * 20261010110000 por aplicar). Uma falha a meio deixa a fusão parcial; sai quando a
 * migração estiver aplicada.
 */
async function mergePeopleInSteps(
  db: AdminDb,
  input: {
    schoolId: string;
    survivorId: string;
    duplicateId: string;
    reason: string;
    userId: string;
  },
) {
  const { data: people, error } = await db
    .from("people")
    .select("id, full_name, email, phone, national_id, date_of_birth, status, user_id")
    .eq("school_id", input.schoolId)
    .in("id", [input.survivorId, input.duplicateId]);
  if (error) throw publicDatabaseError(error, "Não foi possível carregar as pessoas.");
  const survivor = (people ?? []).find((row) => row.id === input.survivorId);
  const duplicate = (people ?? []).find((row) => row.id === input.duplicateId);
  if (!survivor || !duplicate) throw new Error("Uma das pessoas não existe nesta escola.");
  if (survivor.user_id && duplicate.user_id && survivor.user_id !== duplicate.user_id) {
    throw new Error(
      "As duas fichas têm contas de acesso diferentes. Não é seguro fundi-las — desactive o duplicado.",
    );
  }

  const [{ data: students }, { data: teachers }] = await Promise.all([
    db
      .from("students")
      .select("id, person_id")
      .eq("school_id", input.schoolId)
      .in("person_id", [input.survivorId, input.duplicateId]),
    db
      .from("teachers")
      .select("id, person_id")
      .eq("school_id", input.schoolId)
      .in("person_id", [input.survivorId, input.duplicateId]),
  ]);

  const survivorStudents = (students ?? []).filter((row) => row.person_id === input.survivorId);
  const duplicateStudents = (students ?? []).filter((row) => row.person_id === input.duplicateId);
  if (survivorStudents.length && duplicateStudents.length) {
    throw new Error(
      "As duas fichas têm matrícula de aluno. Não é seguro fundi-las — desactive o duplicado.",
    );
  }
  const { data: employments, error: employmentsError } = await db
    .from("hr_employments")
    .select("id, person_id")
    .eq("school_id", input.schoolId)
    .in("person_id", [input.survivorId, input.duplicateId])
    .is("deleted_at", null);
  if (employmentsError) {
    throw publicDatabaseError(employmentsError, "Não foi possível verificar os vínculos laborais.");
  }
  const employmentOwners = new Set((employments ?? []).map((row) => String(row.person_id)));
  if (employmentOwners.size > 1) {
    throw new Error(
      "As duas fichas têm vínculo laboral (RH). Não é seguro fundi-las — desactive o duplicado.",
    );
  }
  const survivorTeachers = (teachers ?? []).filter((row) => row.person_id === input.survivorId);
  const duplicateTeachers = (teachers ?? []).filter((row) => row.person_id === input.duplicateId);
  if (survivorTeachers.length && duplicateTeachers.length) {
    throw new Error(
      "As duas fichas têm registo de professor. Não é seguro fundi-las — desactive o duplicado.",
    );
  }

  if (duplicateStudents.length) {
    const { error: studentError } = await db
      .from("students")
      .update({ person_id: input.survivorId, updated_by: input.userId })
      .in(
        "id",
        duplicateStudents.map((row) => row.id),
      );
    if (studentError) {
      throw publicDatabaseError(studentError, "Não foi possível transferir a matrícula de aluno.");
    }
  }
  if (duplicateTeachers.length) {
    const { error: teacherError } = await db
      .from("teachers")
      .update({ person_id: input.survivorId, updated_by: input.userId })
      .in(
        "id",
        duplicateTeachers.map((row) => row.id),
      );
    if (teacherError) {
      throw publicDatabaseError(
        teacherError,
        "Não foi possível transferir o registo de professor.",
      );
    }
  }

  // Tudo o que aponta para o duplicado passa para a ficha que fica: sem isto,
  // o encarregado fundido perdia os educandos no portal, e documentos, cartões
  // de acesso e vínculos de RH ficavam presos a uma ficha desactivada.
  const moves = await Promise.all([
    db
      .from("person_documents")
      .update({ person_id: input.survivorId, updated_by: input.userId })
      .eq("school_id", input.schoolId)
      .eq("person_id", input.duplicateId),
    db
      .from("siga_access_cards")
      .update({ person_id: input.survivorId })
      .eq("school_id", input.schoolId)
      .eq("person_id", input.duplicateId),
    db
      .from("hr_employments")
      .update({ person_id: input.survivorId, updated_by: input.userId })
      .eq("school_id", input.schoolId)
      .eq("person_id", input.duplicateId),
  ]);
  const moveError = moves.find((result) => result.error)?.error;
  if (moveError) {
    throw publicDatabaseError(
      moveError,
      "Não foi possível transferir documentos, cartões ou vínculo laboral.",
    );
  }

  const { data: guardianLinks, error: guardianError } = await db
    .from("student_guardians")
    .select("id, student_id, guardian_person_id")
    .eq("school_id", input.schoolId)
    .in("guardian_person_id", [input.survivorId, input.duplicateId]);
  if (guardianError) {
    throw publicDatabaseError(guardianError, "Não foi possível carregar os educandos.");
  }
  const survivorWards = new Set(
    (guardianLinks ?? [])
      .filter((row) => row.guardian_person_id === input.survivorId)
      .map((row) => String(row.student_id)),
  );
  const duplicateLinks = (guardianLinks ?? []).filter(
    (row) => row.guardian_person_id === input.duplicateId,
  );
  const linksToMove = duplicateLinks
    .filter((row) => !survivorWards.has(String(row.student_id)))
    .map((row) => String(row.id));
  // Mesmo educando já ligado à ficha que fica: a ligação do duplicado é repetida.
  const redundantLinks = duplicateLinks
    .filter((row) => survivorWards.has(String(row.student_id)))
    .map((row) => String(row.id));
  if (linksToMove.length) {
    const { error } = await db
      .from("student_guardians")
      .update({ guardian_person_id: input.survivorId })
      .eq("school_id", input.schoolId)
      .in("id", linksToMove);
    if (error) throw publicDatabaseError(error, "Não foi possível transferir os educandos.");
  }
  if (redundantLinks.length) {
    const { error } = await db
      .from("student_guardians")
      .delete()
      .eq("school_id", input.schoolId)
      .in("id", redundantLinks);
    if (error) throw publicDatabaseError(error, "Não foi possível transferir os educandos.");
  }

  const { data: roleRows, error: rolesError } = await db
    .from("person_roles")
    .select("id, person_id, role")
    .eq("school_id", input.schoolId)
    .in("person_id", [input.survivorId, input.duplicateId])
    .is("deleted_at", null);
  if (rolesError) throw publicDatabaseError(rolesError, "Não foi possível carregar os papéis.");
  const survivorRoles = new Set(
    (roleRows ?? [])
      .filter((row) => row.person_id === input.survivorId)
      .map((row) => String(row.role)),
  );
  const rolesToMove = (roleRows ?? [])
    .filter((row) => row.person_id === input.duplicateId && !survivorRoles.has(String(row.role)))
    .map((row) => String(row.id));
  if (rolesToMove.length) {
    const { error } = await db
      .from("person_roles")
      .update({ person_id: input.survivorId, updated_by: input.userId })
      .eq("school_id", input.schoolId)
      .in("id", rolesToMove);
    if (error) throw publicDatabaseError(error, "Não foi possível transferir os papéis.");
  }

  const survivorPatch: TablesUpdate<"people"> = { updated_by: input.userId };
  // A conta de acesso do duplicado passa para a ficha que fica.
  const moveLogin = Boolean(duplicate.user_id && !survivor.user_id);
  if (moveLogin) survivorPatch["user_id"] = duplicate.user_id;
  if (!survivor["email"] && duplicate["email"]) survivorPatch["email"] = duplicate["email"];
  if (!survivor["phone"] && duplicate["phone"]) survivorPatch["phone"] = duplicate["phone"];
  if (!survivor["national_id"] && duplicate["national_id"]) {
    survivorPatch["national_id"] = duplicate["national_id"];
  }
  if (!survivor["date_of_birth"] && duplicate["date_of_birth"]) {
    survivorPatch["date_of_birth"] = duplicate["date_of_birth"];
  }

  // Clear unique contact fields on the duplicate first so the survivor update
  // does not collide with school-level unique indexes (email / NIF / phone).
  const duplicateClear: TablesUpdate<"people"> = {
    updated_by: input.userId,
    status: "inactive",
  };
  if (survivorPatch["email"]) duplicateClear["email"] = null;
  if (survivorPatch["phone"]) duplicateClear["phone"] = null;
  if (survivorPatch["national_id"]) duplicateClear["national_id"] = null;
  if (moveLogin) duplicateClear["user_id"] = null;

  let duplicateError = (
    await db
      .from("people")
      .update(duplicateClear)
      .eq("id", input.duplicateId)
      .eq("school_id", input.schoolId)
  ).error;
  if (duplicateError) {
    duplicateError = (
      await db
        .from("people")
        .update({ ...duplicateClear, status: "archived" })
        .eq("id", input.duplicateId)
        .eq("school_id", input.schoolId)
    ).error;
  }
  if (duplicateError) {
    throw publicDatabaseError(duplicateError, "Não foi possível desactivar o duplicado.");
  }

  const { error: survivorError } = await db
    .from("people")
    .update(survivorPatch)
    .eq("id", input.survivorId)
    .eq("school_id", input.schoolId);
  if (survivorError) {
    throw publicDatabaseError(survivorError, "Não foi possível actualizar a ficha sobrevivente.");
  }
  // A conta passa também para o registo de professor da ficha que fica: os ecrãs
  // procuram o professor por `teachers.user_id` e a base (current_teacher_id) pela pessoa.
  if (moveLogin) {
    const { error: teacherLoginError } = await db
      .from("teachers")
      .update({ user_id: duplicate.user_id, updated_by: input.userId })
      .eq("school_id", input.schoolId)
      .eq("person_id", input.survivorId)
      .is("user_id", null);
    if (teacherLoginError) {
      throw publicDatabaseError(
        teacherLoginError,
        "Fichas fundidas, mas a conta não ficou ligada ao professor.",
      );
    }
  }

  const { error: auditError } = await db.from("audit_logs").insert({
    school_id: input.schoolId,
    actor_user_id: input.userId,
    action: "people.merged",
    entity_type: "person",
    entity_id: input.survivorId,
    metadata: {
      duplicate_id: input.duplicateId,
      reason: input.reason,
      moved_guardian_links: linksToMove.length,
      removed_redundant_guardian_links: redundantLinks.length,
      moved_login: moveLogin,
    },
  });
  if (auditError)
    reportSigaError("people.merge.audit_failed", auditError, {
      school_id: input.schoolId,
      survivor_id: input.survivorId,
    });
}

export const listStaffDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterFor("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: teachers, error } = await db
      .from("teachers")
      .select("id, person_id, status, employee_number, updated_at")
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false });
    if (error) throw publicDatabaseError(error, "Não foi possível carregar a equipa escolar.");

    const personIds = [
      ...new Set((teachers ?? []).map((row: { person_id: string }) => row.person_id)),
    ];
    const { data: people } = personIds.length
      ? await db
          .from("people")
          .select("id, full_name, email, phone, status, updated_at")
          .eq("school_id", membership.schoolId)
          .in("id", personIds)
      : { data: [] as Array<Record<string, unknown>> };
    const peopleRows = (people ?? []) as Array<Record<string, unknown>>;
    const peopleById = new Map(peopleRows.map((row) => [String(row["id"] ?? ""), row] as const));

    return (teachers ?? [])
      .map(
        (teacher: {
          id: string;
          person_id: string;
          status: string;
          employee_number: string;
          updated_at: string;
        }) => {
          const person = peopleById.get(teacher.person_id);
          if (!person) return null;
          return {
            id: String(person["id"]),
            teacher_id: teacher.id,
            employee_number: teacher.employee_number,
            full_name: String(person["full_name"]),
            email: (person["email"] as string | null) ?? null,
            phone_primary: (person["phone"] as string | null) ?? null,
            status: String(teacher.status ?? person["status"]),
            updated_at: teacher.updated_at || String(person["updated_at"] ?? ""),
            roles: ["professor"],
            roleActive: teacher.status === "active",
          };
        },
      )
      .filter(Boolean)
      .sort((a, b) => a!.full_name.localeCompare(b!.full_name, "pt"));
  });

export const listTeachers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listTeachersInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    let query = db
      .from("teachers")
      .select("id, person_id, status, employee_number, hired_on, employment_type, updated_at")
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") query = query.eq("status", data.status);

    const { data: teachers, error } = await query;
    if (error) throw publicDatabaseError(error, "Não foi possível carregar os professores.");

    const personIds = [...new Set((teachers ?? []).map((row) => row.person_id))];
    const { data: people } = personIds.length
      ? await db
          .from("people")
          .select("id, full_name, email, phone, photo_url")
          .eq("school_id", membership.schoolId)
          .in("id", personIds)
      : {
          data: [] as Array<{
            id: string;
            full_name: string;
            email: string | null;
            phone: string | null;
            photo_url: string | null;
          }>,
        };
    const peopleById = new Map((people ?? []).map((row) => [row.id, row]));
    const q = (data.query ?? "").trim().toLowerCase();
    // Cada professor decide se alunos e encarregados vêem o seu contacto. A
    // escolha aplica-se antes da pesquisa: procurar pelo e-mail oculto não o
    // revela.
    const hiddenContacts = await loadHiddenTeachers(db, membership.schoolId);
    const viewerSeesAll = seesAllTeacherContacts(membership.allAppRoles ?? [membership.appRole]);

    const rows = (teachers ?? []).map((teacher) => {
      const person = peopleById.get(teacher.person_id);
      return {
        id: teacher.id as string,
        person_id: teacher.person_id as string,
        employee_number: teacher.employee_number as string,
        hired_on: teacher.hired_on as string | null,
        employment_type: teacher.employment_type as string | null,
        status: teacher.status as string,
        full_name: person?.full_name ?? "Professor",
        email: person?.email ?? null,
        phone: person?.phone ?? null,
        photo_url: (person?.photo_url as string | null | undefined) ?? null,
        updated_at: teacher.updated_at as string,
      };
    });

    return applyTeacherContactVisibility(rows, hiddenContacts, viewerSeesAll).filter((row) => {
      if (!q) return true;
      return (
        row.full_name.toLowerCase().includes(q) ||
        row.employee_number.toLowerCase().includes(q) ||
        (row.email ?? "").toLowerCase().includes(q)
      );
    });
  });

/** Número de professor automático: «DOC-000001» (IDENTIFIER_POLICIES.teacher). */
export const createTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createTeacherInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    // register_teacher exige 2FA: verificado antes de criar a pessoa, para não a deixar solta.
    requireAal2(context.claims, "Cadastrar o professor");
    const db = await loadSgaAdminClient();

    const { data: person, error: personError } = await db
      .from("people")
      .insert({
        school_id: membership.schoolId,
        full_name: data.fullName,
        preferred_name: data.fullName.split(/\s+/)[0] ?? data.fullName,
        email: data.email || null,
        phone: normalizePersonPhone(data.phone),
        status: "active",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (personError) throw publicDatabaseError(personError, "Não foi possível criar a pessoa.");

    const discardPerson = () =>
      db
        .from("people")
        .update({ deleted_at: new Date().toISOString(), updated_by: context.userId })
        .eq("id", person.id)
        .eq("school_id", membership.schoolId);
    // A RPC compara com a data do servidor (UTC); entre a meia-noite de Luanda e a de
    // UTC, «hoje» na escola ainda é amanhã para ela.
    const hiredOn =
      data.hiredOn || [schoolTodayIso(), schoolTodayIso(new Date(), "UTC")].sort()[0]!;

    let teacherId: string | null = null;
    let failure: { code?: string; message?: string } | null = null;
    // Número de register_teacher (auditoria 14, P3): sequência da escola, nunca abaixo
    // do maior número existente (migração 20261010110000).
    const registered = await sgaClient(context.supabase).rpc(
      "register_teacher",
      rpcArgs("register_teacher", {
        school_id: membership.schoolId,
        person_id: person.id,
        hired_on: hiredOn,
        employment_type: "permanent",
        highest_qualification: "bachelor",
        subject_ids: [],
      }),
    );
    if (!registered.error) {
      teacherId = String((registered.data as { teacherId?: string } | null)?.teacherId ?? "");
    } else if (isTeacherNumberTaken(registered.error)) {
      // Base sem a 20261010110000: a sequência começa em DOC-000001, que já existe.
      // Numera aqui, com a mesma regra (maior + 1), até a migração ser aplicada.
      const inserted = await insertTeacherWithNextNumber(db, membership.schoolId, (number) =>
        db
          .from("teachers")
          .insert({
            school_id: membership.schoolId,
            person_id: person.id,
            employee_number: number,
            hired_on: hiredOn,
            employment_type: "permanent",
            highest_qualification: "bachelor",
            status: "active",
            created_by: context.userId,
            updated_by: context.userId,
          })
          .select("id")
          .single(),
      );
      teacherId = inserted.data ? String(inserted.data.id) : null;
      failure = inserted.error;
    } else {
      failure = registered.error;
    }
    if (!teacherId) {
      // A pessoa foi criada só para este professor: sem ele, sai (antes ficava uma
      // ficha solta a cada tentativa falhada, e a seguinte duplicava-a).
      await discardPerson();
      if (failure && isRpcAuthDenied(failure)) {
        throw new Error("Esta conta precisa de 2FA activo e de permissão para cadastrar docentes.");
      }
      throw publicDatabaseError(failure ?? {}, "Não foi possível criar o professor.");
    }

    // Número escrito à mão: substitui o gerado.
    if (data.employeeNumber) {
      const { error: numberError } = await db
        .from("teachers")
        .update({ employee_number: data.employeeNumber, updated_by: context.userId })
        .eq("id", teacherId)
        .eq("school_id", membership.schoolId);
      if (numberError) {
        throw publicDatabaseError(
          numberError,
          "Professor criado, mas o número indicado não foi gravado.",
        );
      }
    }
    const { data: teacher, error } = await db
      .from("teachers")
      .select("*")
      .eq("id", teacherId)
      .eq("school_id", membership.schoolId)
      .single();
    if (error) throw publicDatabaseError(error, "Professor criado, mas não foi possível lê-lo.");
    return teacher;
  });

export const updateTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateTeacherInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: teacher, error: teacherError } = await db
      .from("teachers")
      .update({ status: data.status, updated_by: context.userId })
      .eq("id", data.teacherId)
      .eq("school_id", membership.schoolId)
      .select("id, person_id, status")
      .maybeSingle();
    if (teacherError)
      throw publicDatabaseError(teacherError, "Não foi possível actualizar o professor.");
    if (!teacher) throw new Error("Professor não encontrado.");

    const { error: personError } = await db
      .from("people")
      .update({
        full_name: data.fullName,
        email: data.email || null,
        phone: normalizePersonPhone(data.phone),
        updated_by: context.userId,
      })
      .eq("id", teacher.person_id)
      .eq("school_id", membership.schoolId);
    if (personError) throw publicDatabaseError(personError, "Não foi possível actualizar a ficha.");
    return teacher;
  });

export const deleteTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteTeacherInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { count, error: linkError } = await db
      .from("class_subjects")
      .select("id", { count: "exact", head: true })
      .eq("school_id", membership.schoolId)
      .eq("teacher_id", data.teacherId)
      .eq("status", "active");
    if (linkError) {
      throw publicDatabaseError(linkError, "Não foi possível validar disciplinas do professor.");
    }
    if ((count ?? 0) > 0) {
      throw new Error(
        "Este professor ainda está ligado a disciplinas activas. Reatribua as turmas antes de excluir.",
      );
    }
    const { data: teacher, error } = await db
      .from("teachers")
      .update({ status: "inactive", updated_by: context.userId })
      .eq("id", data.teacherId)
      .eq("school_id", membership.schoolId)
      .select("id, status")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível desactivar o professor.");
    if (!teacher) throw new Error("Professor não encontrado.");
    return teacher;
  });

export const updatePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updatePersonInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const normalizedNif = normalizePersonNif(data.nif);
    const personPatch: TablesUpdate<"people"> = {
      full_name: data.fullName,
      email: data.email || null,
      phone: normalizePersonPhone(data.phone),
      national_id: normalizedNif,
      updated_by: context.userId,
    };
    const hasGeography =
      data.includesGeography === true ||
      Boolean(data.province || data.municipality || data.commune || data.address);
    if (hasGeography) {
      personPatch["province"] = data.province || null;
      personPatch["municipality"] = data.municipality || null;
      personPatch["commune"] = data.commune || null;
      personPatch["address"] = data.address || null;
    }

    const { data: person, error } = await db
      .from("people")
      .update(personPatch)
      .eq("id", data.personId)
      .eq("school_id", membership.schoolId)
      .select("id, full_name, email, phone, status")
      .maybeSingle();
    if (error && hasGeography && isMissingPeopleGeography(error)) {
      throw new Error(
        "A localização não pôde ser actualizada porque a migration de Pessoas ainda não foi aplicada.",
      );
    }
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a ficha.");
    if (!person) throw new Error("Pessoa não encontrada.");
    await syncBiDocumentFromNif(
      db,
      membership.schoolId,
      data.personId,
      normalizedNif,
      context.userId,
    );
    return {
      ...person,
      phone_primary: person.phone,
    };
  });

export const setPersonInstitutionRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setPersonInstitutionRolesInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: person, error: personError } = await db
      .from("people")
      .select("id")
      .eq("id", data.personId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (personError) throw publicDatabaseError(personError, "Não foi possível validar a pessoa.");
    if (!person) throw new Error("Pessoa não encontrada nesta escola.");

    await assertPersonRoleStoreAvailable(db);
    const roles = await syncPersonInstitutionRoles(db, {
      schoolId: membership.schoolId,
      personId: data.personId,
      roles: data.roles,
      userId: context.userId,
    });
    return { personId: data.personId, roles };
  });

export const setPersonPhotoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setPersonPhotoUrlInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: person, error } = await db
      .from("people")
      .update({
        photo_url: data.photoUrl,
        updated_by: context.userId,
      })
      .eq("id", data.personId)
      .eq("school_id", membership.schoolId)
      .select("id, photo_url")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a foto.");
    if (!person) throw new Error("Pessoa não encontrada.");
    return person;
  });

export const addPersonDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => addPersonDocumentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: person, error: personError } = await db
      .from("people")
      .select("id")
      .eq("id", data.personId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (personError) throw publicDatabaseError(personError, "Não foi possível validar a pessoa.");
    if (!person) throw new Error("Pessoa não encontrada nesta escola.");

    if (data.document.file_id) {
      const { data: file, error: fileError } = await db
        .from("siga_files")
        .select("id")
        .eq("id", data.document.file_id)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      if (fileError && !/schema cache|does not exist|42P01|PGRST/i.test(fileError.message)) {
        throw publicDatabaseError(fileError, "Não foi possível validar o anexo.");
      }
      if (!fileError && !file) throw new Error("O anexo não pertence a esta escola.");
    }
    const documentNumber =
      data.document.document_type === "bi"
        ? (normalizePersonNif(data.document.document_number) ?? data.document.document_number)
        : data.document.document_number;
    const baseRow = {
      school_id: membership.schoolId,
      person_id: data.personId,
      document_type: data.document.document_type,
      document_number: documentNumber,
      issued_at: data.document.issued_at || null,
      expires_at: data.document.expires_at || null,
      created_by: context.userId,
      updated_by: context.userId,
    };
    const withFile = {
      ...baseRow,
      file_id: data.document.file_id || null,
      file_name: data.document.file_name || null,
    };
    let row: Record<string, unknown> | null = null;
    const first = await db
      .from("person_documents")
      .insert(withFile)
      .select("id, document_type, document_number, issued_at, expires_at, file_id, file_name")
      .single();
    if (first.error && /file_id|file_name|42703|schema cache/i.test(first.error.message)) {
      const fallback = await db
        .from("person_documents")
        .insert(baseRow)
        .select("id, document_type, document_number, issued_at, expires_at")
        .single();
      if (fallback.error) {
        throw publicDatabaseError(fallback.error, "Não foi possível adicionar o documento.");
      }
      row = fallback.data as Record<string, unknown>;
    } else if (first.error) {
      throw publicDatabaseError(first.error, "Não foi possível adicionar o documento.");
    } else {
      row = first.data as Record<string, unknown>;
    }
    if (data.document.document_type === "bi") {
      const { error: biError } = await db
        .from("people")
        .update({
          national_id: documentNumber,
          updated_by: context.userId,
        })
        .eq("id", data.personId)
        .eq("school_id", membership.schoolId);
      // O documento já ficou guardado; a ficha é que não mudou (por exemplo,
      // o BI já está noutra pessoa da escola). Diz-se, em vez de calar.
      if (biError) {
        throw publicDatabaseError(
          biError,
          "Documento guardado, mas o BI da ficha não foi actualizado. Verifique se o número já está noutra pessoa.",
        );
      }
    }
    if (!row) throw new Error("Não foi possível adicionar o documento.");
    return toPersonDocumentSummary(row);
  });

export const updatePersonStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updatePersonStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: person, error } = await db
      .from("people")
      .update({
        status: data.status,
        updated_by: context.userId,
      })
      .eq("id", data.personId)
      .eq("school_id", membership.schoolId)
      .select("id, status")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o estado.");
    if (!person) throw new Error("Pessoa não encontrada nesta escola.");
    return person;
  });

/** Vincula um login a um professor apenas com identidade institucional não conflituosa. */
export async function ensureTeacherHrRecord(input: {
  schoolId: string;
  userId: string;
  actorId: string;
  fullName: string;
  email: string;
}) {
  const db = await loadSgaAdminClient();
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("É necessário um e-mail institucional para vincular o professor.");
  const { data: people, error: peopleError } = await db
    .from("people")
    .select("id, email, full_name, user_id")
    .eq("school_id", input.schoolId)
    .ilike("email", email);
  if (peopleError)
    throw publicDatabaseError(peopleError, "Não foi possível validar a identidade do professor.");
  const matchingPeople = (people ?? []).filter(
    (row) => String(row.email ?? "").toLowerCase() === email,
  );
  if (matchingPeople.length > 1) {
    throw new Error("E-mail associado a múltiplas pessoas nesta escola; reveja o cadastro.");
  }
  let person = matchingPeople[0];
  if (person?.user_id && String(person.user_id) !== input.userId) {
    throw new Error("Pessoa já vinculada a outra conta; reveja o cadastro.");
  }

  if (!person) {
    const created = await db
      .from("people")
      .insert({
        school_id: input.schoolId,
        full_name: input.fullName,
        preferred_name: input.fullName.split(/\s+/)[0],
        email: email || null,
        user_id: input.userId,
        status: "active",
        created_by: input.actorId,
        updated_by: input.actorId,
      })
      .select("id, email, full_name, user_id")
      .single();
    if (created.error) {
      throw publicDatabaseError(created.error, "Não foi possível criar a pessoa do professor.");
    }
    person = created.data;
  }

  const { data: existing, error: teacherLookupError } = await db
    .from("teachers")
    .select("id, user_id")
    .eq("school_id", input.schoolId)
    .eq("person_id", person.id)
    .maybeSingle();
  if (teacherLookupError)
    throw publicDatabaseError(teacherLookupError, "Não foi possível validar a ficha docente.");

  if (existing?.user_id && String(existing.user_id) !== input.userId) {
    throw new Error("Professor já vinculado a outra conta; reveja o cadastro.");
  }
  if (!person.user_id) {
    const { data: linkedPerson, error: linkError } = await db
      .from("people")
      .update({ user_id: input.userId, updated_by: input.actorId })
      .eq("id", person.id)
      .eq("school_id", input.schoolId)
      .is("user_id", null)
      .select("id")
      .maybeSingle();
    if (linkError || !linkedPerson?.id) {
      throw new Error("Não foi possível vincular a pessoa ao login.");
    }
  }

  let teacherId = existing?.id ? String(existing.id) : null;
  if (!teacherId) {
    const inserted = await insertTeacherWithNextNumber(db, input.schoolId, (employeeNumber) =>
      db
        .from("teachers")
        .insert({
          school_id: input.schoolId,
          person_id: person.id,
          user_id: input.userId,
          employee_number: employeeNumber,
          hired_on: schoolTodayIso(),
          employment_type: "permanent",
          highest_qualification: "bachelor",
          status: "active",
          created_by: input.actorId,
          updated_by: input.actorId,
        })
        .select("id")
        .single(),
    );
    if (inserted.error || !inserted.data) {
      throw publicDatabaseError(
        inserted.error ?? {},
        "Não foi possível criar a ficha de professor.",
      );
    }
    teacherId = String(inserted.data.id);
  }

  if (!existing?.user_id && existing?.id) {
    const { data: linked, error: linkError } = await db
      .from("teachers")
      .update({ user_id: input.userId, updated_by: input.actorId })
      .eq("id", teacherId)
      .eq("school_id", input.schoolId)
      .is("user_id", null)
      .select("id")
      .maybeSingle();
    if (linkError || !linked?.id) {
      throw new Error("Não foi possível vincular a ficha docente ao login.");
    }
  }

  return { teacherId, personId: person.id };
}
