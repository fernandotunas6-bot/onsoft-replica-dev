import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter } from "@/integrations/supabase/sga-admin";
import { mapSgaGuardianRelationship } from "@/features/students/schemas";
import {
  publicInstalledProviderIds,
  publicSchoolEmail,
  publicSchoolPhone,
} from "@/features/integrations/install";
import { normalizePersonNif, isAngolaBiNif } from "@/lib/angola-identity";
import {
  candidacyProcessNumber,
  decideEnrollmentApplicationInputSchema,
  getPublicEnrollmentFormInputSchema,
  listEnrollmentApplicationsInputSchema,
  submitPublicEnrollmentInputSchema,
  updateEnrollmentFormInputSchema,
} from "./schemas";

function slugFromSchoolName(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "matricula";
}

export const getOrCreateEnrollmentForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const existing = await db
      .from("enrollment_forms")
      .select(
        "id, slug, title, subtitle, hero_text, accent_color, logo_url, is_open, visible_fields",
      )
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing.error) {
      throw publicDatabaseError(existing.error, "Não foi possível carregar o formulário público.");
    }
    if (existing.data) return existing.data;

    const school = await db
      .from("schools")
      .select("name")
      .eq("id", membership.schoolId)
      .maybeSingle();
    const slug = `${slugFromSchoolName(String(school.data?.name ?? "escola"))}-matricula`;
    const { data, error } = await db
      .from("enrollment_forms")
      .insert({
        school_id: membership.schoolId,
        slug,
        title: "Candidatura a matrícula",
        subtitle: "Preencha os dados do aluno para a secretaria confirmar.",
        hero_text: "Bem-vindo. A sua candidatura fica pendente até a secretaria validar.",
        accent_color: "#1d4ed8",
        is_open: true,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select(
        "id, slug, title, subtitle, hero_text, accent_color, logo_url, is_open, visible_fields",
      )
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar o link de matrícula.");
    return data;
  });

export const updateEnrollmentForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateEnrollmentFormInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: form, error } = await db
      .from("enrollment_forms")
      .update({
        title: data.title,
        subtitle: data.subtitle ?? null,
        hero_text: data.heroText ?? null,
        accent_color: data.accentColor,
        logo_url: data.logoUrl ?? null,
        is_open: data.isOpen,
        visible_fields: data.visibleFields,
        updated_by: context.userId,
      })
      .eq("id", data.id)
      .eq("school_id", membership.schoolId)
      .select(
        "id, slug, title, subtitle, hero_text, accent_color, logo_url, is_open, visible_fields",
      )
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o formulário.");
    if (!form) throw new Error("Formulário não encontrado.");
    return form;
  });

export const getPublicEnrollmentForm = createServerFn({ method: "GET" })
  .validator((input: unknown) => getPublicEnrollmentFormInputSchema.parse(input))
  .handler(async ({ data }) => {
    const db = await loadSgaAdminClient();
    const { data: form, error } = await db
      .from("enrollment_forms")
      .select(
        "id, slug, title, subtitle, hero_text, accent_color, logo_url, is_open, visible_fields, school_id",
      )
      .eq("slug", data.slug)
      .eq("is_open", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível abrir o formulário.");
    if (!form) throw new Error("Este link de matrícula não está disponível.");
    let schoolName = "Escola";
    let schoolPhone: string | null = null;
    let schoolEmail: string | null = null;
    const school = await db
      .from("schools")
      .select("name, phone, email")
      .eq("id", form.school_id)
      .maybeSingle();
    if (school.error && /phone|email|42703|schema cache/i.test(school.error.message)) {
      const fallback = await db
        .from("schools")
        .select("name")
        .eq("id", form.school_id)
        .maybeSingle();
      schoolName = fallback.data?.name ?? "Escola";
    } else {
      schoolName = school.data?.name ?? "Escola";
      schoolPhone = (school.data?.phone as string | null) ?? null;
      schoolEmail = (school.data?.email as string | null) ?? null;
    }
    let installedProviders: string[] = [];
    try {
      const integrations = await db
        .from("school_integrations")
        .select("provider, status")
        .eq("school_id", form.school_id);
      if (!integrations.error) {
        installedProviders = publicInstalledProviderIds(integrations.data ?? []);
      }
    } catch {
      installedProviders = [];
    }
    return {
      ...form,
      school_name: schoolName,
      school_phone: publicSchoolPhone(schoolPhone, installedProviders),
      school_email: publicSchoolEmail(schoolEmail, installedProviders),
      installedProviders,
    };
  });

export const submitPublicEnrollment = createServerFn({ method: "POST" })
  .validator((input: unknown) => submitPublicEnrollmentInputSchema.parse(input))
  .handler(async ({ data }) => {
    const db = await loadSgaAdminClient();
    const { data: form, error: formError } = await db
      .from("enrollment_forms")
      .select("id, school_id, is_open")
      .eq("slug", data.slug)
      .eq("is_open", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (formError) throw publicDatabaseError(formError, "Não foi possível validar o formulário.");
    if (!form) throw new Error("Este link de matrícula está fechado.");

    const { error } = await db.from("enrollment_applications").insert({
      school_id: form.school_id,
      form_id: form.id,
      full_name: data.person.full_name,
      status: "pending",
      payload: {
        person: data.person,
        guardianName: data.guardianName,
        guardianPhone: data.guardianPhone,
        guardianRelationship: data.guardianRelationship,
      },
    });
    if (error) throw publicDatabaseError(error, "Não foi possível enviar a candidatura.");
    return { ok: true };
  });

export const listEnrollmentApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listEnrollmentApplicationsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const columns = "id, full_name, status, payload, created_at, student_id";
    let query = db
      .from("enrollment_applications")
      .select(columns)
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") query = query.eq("status", data.status);
    let { data: rows, error } = await query;
    if (error && /student_id|42703|schema cache/i.test(error.message)) {
      let fallback = db
        .from("enrollment_applications")
        .select("id, full_name, status, payload, created_at")
        .eq("school_id", membership.schoolId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (data.status !== "all") fallback = fallback.eq("status", data.status);
      const retry = await fallback;
      rows = retry.data as typeof rows;
      error = retry.error;
    }
    if (error) throw publicDatabaseError(error, "Não foi possível carregar as candidaturas.");
    return rows ?? [];
  });

export const decideEnrollmentApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => decideEnrollmentApplicationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();
    const { data: application, error: loadError } = await db
      .from("enrollment_applications")
      .select("id, full_name, payload, created_at, status")
      .eq("id", data.applicationId)
      .eq("school_id", membership.schoolId)
      .eq("status", "pending")
      .maybeSingle();
    if (loadError) throw publicDatabaseError(loadError, "Não foi possível ler a candidatura.");
    if (!application) throw new Error("Candidatura já processada ou inexistente.");

    let studentId: string | null = null;
    if (data.decision === "accepted") {
      const payload = (application.payload ?? {}) as {
        person?: {
          full_name?: string;
          email?: string;
          phone_primary?: string;
          nif?: string;
          birth_date?: string;
          sex?: string;
        };
        guardianName?: string;
        guardianPhone?: string;
        guardianRelationship?: string;
      };
      const person = payload.person ?? {};
      const fullName = String(person.full_name ?? application.full_name).trim();
      const normalizedNif = normalizePersonNif(person.nif);
      const { data: personRow, error: personError } = await db
        .from("people")
        .insert({
          school_id: membership.schoolId,
          full_name: fullName,
          preferred_name: fullName.split(/\s+/)[0],
          email: person.email || null,
          phone: person.phone_primary || null,
          national_id: normalizedNif,
          date_of_birth: person.birth_date || null,
          sex: person.sex === "M" ? "male" : person.sex === "F" ? "female" : person.sex || null,
          status: "active",
          created_by: context.userId,
          updated_by: context.userId,
        })
        .select("id")
        .single();
      if (personError) throw publicDatabaseError(personError, "Não foi possível criar a pessoa.");

      if (isAngolaBiNif(normalizedNif) && normalizedNif) {
        const { error: documentError } = await db.from("person_documents").insert({
          school_id: membership.schoolId,
          person_id: personRow.id,
          document_type: "bi",
          document_number: normalizedNif,
          created_by: context.userId,
          updated_by: context.userId,
        });
        if (documentError && !/duplicate|unique|23505/i.test(documentError.message)) {
          throw publicDatabaseError(documentError, "Não foi possível registar o BI do candidato.");
        }
      }

      const guardianName = String(payload.guardianName ?? "").trim();
      let guardianPersonId: string | null = null;
      if (guardianName) {
        const { data: guardianPerson } = await db
          .from("people")
          .insert({
            school_id: membership.schoolId,
            full_name: guardianName,
            preferred_name: guardianName.split(/\s+/)[0],
            phone: payload.guardianPhone || null,
            status: "active",
            created_by: context.userId,
            updated_by: context.userId,
          })
          .select("id")
          .maybeSingle();
        guardianPersonId = guardianPerson?.id ?? null;
      }

      // register_student cria o aluno (+ encarregado) numa transação atómica: gera o
      // número de processo por sequência própria (nunca duplica sob candidaturas
      // aceites em simultâneo) e valida a pessoa/encarregado antes de gravar.
      const { data: registered, error: registerError } = await context.supabase.rpc(
        "register_student",
        {
          school_id: membership.schoolId,
          person_id: personRow.id,
          admission_date: new Date().toISOString().slice(0, 10),
          guardian_person_id: guardianPersonId,
          relationship: guardianPersonId
            ? mapSgaGuardianRelationship(payload.guardianRelationship || "encarregado")
            : null,
          primary_guardian: Boolean(guardianPersonId),
          financial_responsibility: Boolean(guardianPersonId),
          pickup_authorization: true,
        },
      );
      if (registerError) {
        if (
          registerError.code === "42501" ||
          /is_aal2|autorização/i.test(registerError.message ?? "")
        ) {
          throw new Error(
            "Esta conta precisa de verificação em duas etapas (2FA) activa para aceitar candidaturas.",
          );
        }
        throw publicDatabaseError(registerError, "Não foi possível matricular o candidato.");
      }
      const studentOutcome = registered as { studentId: string };
      studentId = studentOutcome.studentId;

      if (data.classGroupId) {
        const { data: classGroup, error: classError } = await db
          .from("class_groups")
          .select("id, academic_year_id")
          .eq("id", data.classGroupId)
          .eq("school_id", membership.schoolId)
          .maybeSingle();
        if (classError) throw publicDatabaseError(classError, "Não foi possível validar a turma.");
        if (!classGroup) throw new Error("Turma não encontrada nesta escola.");
        if (!classGroup.academic_year_id) {
          throw new Error("Esta turma não tem ano lectivo associado.");
        }
        // enroll_student tranca a turma (FOR UPDATE) e valida capacidade atomicamente.
        const { error: enrollError } = await context.supabase.rpc("enroll_student", {
          school_id: membership.schoolId,
          student_id: studentOutcome.studentId,
          class_group_id: classGroup.id,
          enrolled_on: new Date().toISOString().slice(0, 10),
        });
        if (enrollError) {
          if (
            enrollError.code === "42501" ||
            /is_aal2|autorização/i.test(enrollError.message ?? "")
          ) {
            throw new Error(
              "Aluno criado, mas esta conta precisa de 2FA activo para o colocar na turma.",
            );
          }
          throw publicDatabaseError(
            enrollError,
            "Aluno criado, mas não foi possível colocá-lo na turma.",
          );
        }
      }
    }

    const updatePayload: Record<string, unknown> = {
      status: data.decision,
      decided_at: new Date().toISOString(),
      decided_by: context.userId,
      updated_by: context.userId,
    };
    if (studentId) updatePayload["student_id"] = studentId;

    const { data: row, error } = await db
      .from("enrollment_applications")
      .update(updatePayload)
      .eq("id", data.applicationId)
      .eq("school_id", membership.schoolId)
      .eq("status", "pending")
      .select("id, status")
      .maybeSingle();
    if (error) {
      if (studentId && /student_id|42703|schema cache/i.test(error.message)) {
        const { data: fallback, error: fallbackError } = await db
          .from("enrollment_applications")
          .update({
            status: data.decision,
            decided_at: new Date().toISOString(),
            decided_by: context.userId,
            updated_by: context.userId,
          })
          .eq("id", data.applicationId)
          .eq("school_id", membership.schoolId)
          .select("id, status")
          .maybeSingle();
        if (fallbackError) {
          throw publicDatabaseError(
            fallbackError,
            "Aluno criado, mas a candidatura não actualizou.",
          );
        }
        return { ...fallback, studentId };
      }
      throw publicDatabaseError(error, "Não foi possível actualizar a candidatura.");
    }
    if (!row) throw new Error("Candidatura já processada ou inexistente.");
    return { ...row, studentId };
  });
