import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
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
  setPersonPhotoUrlInputSchema,
  updatePersonInputSchema,
  updatePersonStatusInputSchema,
  updateTeacherInputSchema,
  normalizePersonPhone,
} from "./schemas";
import { isAngolaBiNif, normalizePersonNif } from "@/lib/angola-identity";

function mapSex(sex: string | undefined) {
  if (!sex) return null;
  if (sex === "M") return "male";
  if (sex === "F") return "female";
  return sex;
}

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
  for (const document of documents) {
    const { error } = await db.from("person_documents").insert({
      school_id: schoolId,
      person_id: personId,
      document_type: document.document_type,
      document_number: document.document_number,
      issued_at: document.issued_at || null,
      expires_at: document.expires_at || null,
      created_by: userId,
      updated_by: userId,
    });
    if (error) {
      throw publicDatabaseError(error, "Não foi possível guardar o documento da pessoa.");
    }
  }
}

async function syncBiDocumentFromNif(
  db: AdminDb,
  schoolId: string,
  personId: string,
  nif: string | null | undefined,
  userId: string,
) {
  if (!isAngolaBiNif(nif)) return;
  const compact = normalizePersonNif(nif);
  if (!compact) return;
  const { data: existing } = await db
    .from("person_documents")
    .select("id")
    .eq("school_id", schoolId)
    .eq("person_id", personId)
    .eq("document_type", "bi")
    .eq("document_number", compact)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing?.id) return;
  const { error } = await db.from("person_documents").insert({
    school_id: schoolId,
    person_id: personId,
    document_type: "bi",
    document_number: compact,
    created_by: userId,
    updated_by: userId,
  });
  if (error && !/duplicate|unique|23505/i.test(error.message)) {
    throw publicDatabaseError(error, "Não foi possível sincronizar o BI.");
  }
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export const searchPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => searchPeopleInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    const { data: people, error } = await db
      .from("people")
      .select(
        "id, full_name, preferred_name, email, phone, national_id, status, date_of_birth, updated_at",
      )
      .eq("school_id", membership.schoolId)
      .order("full_name")
      .limit(Math.max(data.limit * 3, 50));
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
      updated_at: person["updated_at"] as string,
      roles: [] as string[],
    }));

    if (!query) return mapped.slice(0, data.limit);
    return mapped
      .filter((person) => {
        const haystack = [
          person.full_name,
          person.email ?? "",
          person.phone_primary ?? "",
          person.nif ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, data.limit);
  });

export const findPersonDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => findPersonDuplicatesInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    const { data: people, error } = await db
      .from("people")
      .select("id, full_name, email, phone, national_id, date_of_birth, status")
      .eq("school_id", membership.schoolId)
      .limit(250);
    if (error) throw publicDatabaseError(error, "Não foi possível verificar duplicados.");

    const name = data.fullName.trim().toLowerCase();
    const email = (data.email ?? "").trim().toLowerCase();
    const phone = normalizePhone(data.phone);
    const nif = (data.nif ?? data.documentNumber ?? "").trim().toLowerCase();
    const birth = data.birthDate ?? "";

    return (people ?? [])
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
    const { data: documents, error: documentsError } = await db
      .from("person_documents")
      .select("id, document_type, document_number, issued_at, expires_at, file_id, file_name")
      .eq("school_id", membership.schoolId)
      .eq("person_id", person.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (documentsError && /file_id|file_name|42703|schema cache/i.test(documentsError.message)) {
      const fallback = await db
        .from("person_documents")
        .select("id, document_type, document_number, issued_at, expires_at")
        .eq("school_id", membership.schoolId)
        .eq("person_id", person.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      return {
        ...person,
        phone_primary: person.phone,
        birth_date: person.date_of_birth,
        nif: person.national_id,
        documents: fallback.data ?? [],
      };
    }
    if (
      documentsError &&
      !/schema cache|does not exist|42P01|PGRST/i.test(documentsError.message)
    ) {
      throw publicDatabaseError(documentsError, "Não foi possível carregar os documentos.");
    }
    return {
      ...person,
      phone_primary: person.phone,
      birth_date: person.date_of_birth,
      nif: person.national_id,
      documents: documents ?? [],
    };
  });

export const createPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createPersonInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const personInput = data.person;
    const normalizedNif = normalizePersonNif(personInput.nif);
    const { data: person, error } = await db
      .from("people")
      .insert({
        school_id: membership.schoolId,
        full_name: personInput.full_name,
        preferred_name:
          personInput.preferred_name ||
          personInput.first_name ||
          personInput.full_name.split(/\s+/)[0],
        email: personInput.email || null,
        phone: normalizePersonPhone(personInput.phone_primary),
        national_id: normalizedNif,
        date_of_birth: personInput.birth_date || null,
        sex: mapSex(personInput.sex),
        status: "active",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar a pessoa.");

    if (data.documents.length) {
      await insertPersonDocuments(
        db,
        membership.schoolId,
        person.id,
        context.userId,
        data.documents.map((document) => ({
          document_type: document.document_type,
          document_number:
            document.document_type === "bi"
              ? (normalizePersonNif(document.document_number) ?? document.document_number)
              : document.document_number,
          issued_at: document.issued_at,
          expires_at: document.expires_at,
        })),
      );
    }
    await syncBiDocumentFromNif(db, membership.schoolId, person.id, normalizedNif, context.userId);

    const roles = data.roles ?? [];
    if (roles.includes("professor")) {
      const { count } = await db
        .from("teachers")
        .select("id", { count: "exact", head: true })
        .eq("school_id", membership.schoolId);
      const seq = String((count ?? 0) + 1).padStart(6, "0");
      const { error: teacherError } = await db.from("teachers").insert({
        school_id: membership.schoolId,
        person_id: person.id,
        employee_number: `DOC-${seq}`,
        hired_on: new Date().toISOString().slice(0, 10),
        employment_type: "permanent",
        highest_qualification: "bachelor",
        status: "active",
        created_by: context.userId,
        updated_by: context.userId,
      });
      if (teacherError) {
        throw publicDatabaseError(
          teacherError,
          "Pessoa criada, mas falhou o registo de professor.",
        );
      }
    }
    if (roles.includes("aluno")) {
      // register_student gera o número de processo por sequência própria (nunca
      // duplica sob pedidos simultâneos, ao contrário do `EST-${Date.now()}` anterior,
      // que podia colidir em dois pedidos no mesmo milissegundo).
      const { error: registerError } = await context.supabase.rpc("register_student", {
        school_id: membership.schoolId,
        person_id: person.id,
        admission_date: new Date().toISOString().slice(0, 10),
        guardian_person_id: null,
        relationship: null,
        primary_guardian: false,
        financial_responsibility: false,
        pickup_authorization: true,
      });
      if (registerError) {
        if (
          registerError.code === "42501" ||
          /is_aal2|autorização|autorizacao/i.test(registerError.message ?? "")
        ) {
          throw new Error(
            "Pessoa criada, mas esta conta precisa de 2FA activo para a matricular como aluno.",
          );
        }
        throw publicDatabaseError(registerError, "Pessoa criada, mas falhou o registo de aluno.");
      }
    }

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
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    if (data.survivorId === data.duplicateId) {
      throw new Error("Seleccione duas pessoas diferentes.");
    }
    const db = await loadSgaAdminClient();

    const { data: people, error } = await db
      .from("people")
      .select("id, full_name, email, phone, national_id, date_of_birth, status")
      .eq("school_id", membership.schoolId)
      .in("id", [data.survivorId, data.duplicateId]);
    if (error) throw publicDatabaseError(error, "Não foi possível carregar as pessoas.");
    const survivor = (people ?? []).find((row) => row.id === data.survivorId);
    const duplicate = (people ?? []).find((row) => row.id === data.duplicateId);
    if (!survivor || !duplicate) throw new Error("Uma das pessoas não existe nesta escola.");

    const [{ data: students }, { data: teachers }] = await Promise.all([
      db
        .from("students")
        .select("id, person_id")
        .eq("school_id", membership.schoolId)
        .in("person_id", [data.survivorId, data.duplicateId]),
      db
        .from("teachers")
        .select("id, person_id")
        .eq("school_id", membership.schoolId)
        .in("person_id", [data.survivorId, data.duplicateId]),
    ]);

    const survivorStudents = (students ?? []).filter((row) => row.person_id === data.survivorId);
    const duplicateStudents = (students ?? []).filter((row) => row.person_id === data.duplicateId);
    if (survivorStudents.length && duplicateStudents.length) {
      throw new Error(
        "As duas fichas têm matrícula de aluno. Não é seguro fundi-las — desactive o duplicado.",
      );
    }
    const survivorTeachers = (teachers ?? []).filter((row) => row.person_id === data.survivorId);
    const duplicateTeachers = (teachers ?? []).filter((row) => row.person_id === data.duplicateId);
    if (survivorTeachers.length && duplicateTeachers.length) {
      throw new Error(
        "As duas fichas têm registo de professor. Não é seguro fundi-las — desactive o duplicado.",
      );
    }

    if (duplicateStudents.length) {
      const { error: studentError } = await db
        .from("students")
        .update({ person_id: data.survivorId, updated_by: context.userId })
        .in(
          "id",
          duplicateStudents.map((row) => row.id),
        );
      if (studentError) {
        throw publicDatabaseError(
          studentError,
          "Não foi possível transferir a matrícula de aluno.",
        );
      }
    }
    if (duplicateTeachers.length) {
      const { error: teacherError } = await db
        .from("teachers")
        .update({ person_id: data.survivorId, updated_by: context.userId })
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

    const survivorPatch: Record<string, unknown> = { updated_by: context.userId };
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
    const duplicateClear: Record<string, unknown> = {
      updated_by: context.userId,
      status: "inactive",
    };
    if (survivorPatch["email"]) duplicateClear["email"] = null;
    if (survivorPatch["phone"]) duplicateClear["phone"] = null;
    if (survivorPatch["national_id"]) duplicateClear["national_id"] = null;

    let duplicateError = (
      await db
        .from("people")
        .update(duplicateClear)
        .eq("id", data.duplicateId)
        .eq("school_id", membership.schoolId)
    ).error;
    if (duplicateError) {
      duplicateError = (
        await db
          .from("people")
          .update({ ...duplicateClear, status: "archived" })
          .eq("id", data.duplicateId)
          .eq("school_id", membership.schoolId)
      ).error;
    }
    if (duplicateError) {
      throw publicDatabaseError(duplicateError, "Não foi possível desactivar o duplicado.");
    }

    const { error: survivorError } = await db
      .from("people")
      .update(survivorPatch)
      .eq("id", data.survivorId)
      .eq("school_id", membership.schoolId);
    if (survivorError) {
      throw publicDatabaseError(survivorError, "Não foi possível actualizar a ficha sobrevivente.");
    }

    return {
      survivorId: data.survivorId,
      duplicateId: data.duplicateId,
      reason: data.reason,
    };
  });

export const listStaffDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
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
      ? await db.from("people").select("id, full_name, email, phone").in("id", personIds)
      : {
          data: [] as Array<{
            id: string;
            full_name: string;
            email: string | null;
            phone: string | null;
          }>,
        };
    const peopleById = new Map((people ?? []).map((row) => [row.id, row]));
    const q = (data.query ?? "").trim().toLowerCase();

    return (teachers ?? [])
      .map((teacher) => {
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
          updated_at: teacher.updated_at as string,
        };
      })
      .filter((row) => {
        if (!q) return true;
        return (
          row.full_name.toLowerCase().includes(q) ||
          row.employee_number.toLowerCase().includes(q) ||
          (row.email ?? "").toLowerCase().includes(q)
        );
      });
  });

export const createTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createTeacherInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
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

    const { count } = await db
      .from("teachers")
      .select("id", { count: "exact", head: true })
      .eq("school_id", membership.schoolId);
    const seq = String((count ?? 0) + 1).padStart(6, "0");
    const { data: teacher, error } = await db
      .from("teachers")
      .insert({
        school_id: membership.schoolId,
        person_id: person.id,
        employee_number: data.employeeNumber || `DOC-${seq}`,
        hired_on: data.hiredOn || new Date().toISOString().slice(0, 10),
        employment_type: "permanent",
        highest_qualification: "bachelor",
        status: "active",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar o professor.");
    return teacher;
  });

export const updateTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateTeacherInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
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
    const membership = await requireSgaWriter(context.supabase, context.userId, [
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
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const normalizedNif = normalizePersonNif(data.nif);
    const { data: person, error } = await db
      .from("people")
      .update({
        full_name: data.fullName,
        email: data.email || null,
        phone: normalizePersonPhone(data.phone),
        national_id: normalizedNif,
        updated_by: context.userId,
      })
      .eq("id", data.personId)
      .eq("school_id", membership.schoolId)
      .select("id, full_name, email, phone, status")
      .maybeSingle();
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

export const setPersonPhotoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setPersonPhotoUrlInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
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
    const membership = await requireSgaWriter(context.supabase, context.userId, [
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
      await db
        .from("people")
        .update({
          national_id: documentNumber,
          updated_by: context.userId,
        })
        .eq("id", data.personId)
        .eq("school_id", membership.schoolId);
    }
    if (!row) throw new Error("Não foi possível adicionar o documento.");
    return toPersonDocumentSummary(row);
  });

export const updatePersonStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updatePersonStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
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

/** Liga o login a uma ficha HR de professor (people + teachers). Sem coluna user_id, fica só por email. */
export async function ensureTeacherHrRecord(input: {
  schoolId: string;
  userId: string;
  actorId: string;
  fullName: string;
  email: string;
}) {
  const db = await loadSgaAdminClient();
  const email = input.email.trim().toLowerCase();
  const { data: people } = await db
    .from("people")
    .select("id, email, full_name")
    .eq("school_id", input.schoolId);
  let person =
    (people ?? []).find((row) => String(row.email ?? "").toLowerCase() === email && email) ??
    (people ?? []).find(
      (row) => String(row.full_name ?? "").toLowerCase() === input.fullName.trim().toLowerCase(),
    );

  if (!person) {
    const created = await db
      .from("people")
      .insert({
        school_id: input.schoolId,
        full_name: input.fullName,
        preferred_name: input.fullName.split(/\s+/)[0],
        email: email || null,
        status: "active",
        created_by: input.actorId,
        updated_by: input.actorId,
      })
      .select("id, email, full_name")
      .single();
    if (created.error) {
      throw publicDatabaseError(created.error, "Não foi possível criar a pessoa do professor.");
    }
    person = created.data;
  }

  const { data: existing } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("person_id", person.id)
    .maybeSingle();

  let teacherId = existing?.id ? String(existing.id) : null;
  if (!teacherId) {
    const { count } = await db
      .from("teachers")
      .select("id", { count: "exact", head: true })
      .eq("school_id", input.schoolId);
    const seq = String((count ?? 0) + 1).padStart(6, "0");
    const inserted = await db
      .from("teachers")
      .insert({
        school_id: input.schoolId,
        person_id: person.id,
        employee_number: `DOC-${seq}`,
        hired_on: new Date().toISOString().slice(0, 10),
        employment_type: "permanent",
        highest_qualification: "bachelor",
        status: "active",
        created_by: input.actorId,
        updated_by: input.actorId,
      })
      .select("id")
      .single();
    if (inserted.error) {
      throw publicDatabaseError(inserted.error, "Não foi possível criar a ficha de professor.");
    }
    teacherId = String(inserted.data.id);
  }

  const linked = await db
    .from("teachers")
    .update({ user_id: input.userId, updated_by: input.actorId })
    .eq("id", teacherId)
    .eq("school_id", input.schoolId);
  if (linked.error && !/user_id|42703|schema cache/i.test(linked.error.message)) {
    throw publicDatabaseError(linked.error, "Ficha criada, mas não ligou o login ao professor.");
  }

  return { teacherId, personId: person.id };
}
