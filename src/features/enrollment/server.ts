import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { normalizeStoredPhone } from "@/lib/angola-phone";
import { getRequestIP } from "@tanstack/react-start/server";
import { isRateLimitBypassed } from "@/lib/rate-limit";
import { consumeRateLimit } from "@/lib/shared-rate-limit";
import { sgaClient } from "@/integrations/supabase/sga";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { mapSgaGuardianRelationship } from "@/features/students/schemas";
import {
  publicInstalledProviderIds,
  publicSchoolEmail,
  publicSchoolPhone,
} from "@/features/integrations/install";
import { normalizePersonNif, isAngolaBiNif } from "@/lib/angola-identity";
import { requireAal2 } from "@/features/hr/require-aal2";
import {
  candidacyProcessNumber,
  decideEnrollmentApplicationInputSchema,
  getPublicEnrollmentFormInputSchema,
  listEnrollmentApplicationsInputSchema,
  submitPublicEnrollmentInputSchema,
  updateEnrollmentFormInputSchema,
} from "./schemas";

function isMissingPeopleGeography(error: { message?: string; code?: string } | null | undefined) {
  return Boolean(
    error &&
    (/province|municipality|commune|address|42703|schema cache/i.test(error.message ?? "") ||
      error.code === "42703"),
  );
}

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
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
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
        visible_fields: [
          "birth_date",
          "sex",
          "phone_primary",
          "email",
          "province",
          "municipality",
          "address",
          "guardian_name",
          "guardian_phone",
          "guardian_relationship",
        ],
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
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
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
    // Ensino Superior: o candidato escolhe o curso (nome e id são públicos).
    const { data: programRows } = await db
      .from("programs")
      .select("id, name")
      .eq("school_id", form.school_id)
      .in("kind", ["undergraduate", "postgraduate"])
      .eq("is_active", true)
      .order("name");
    return {
      ...form,
      programs: (programRows ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })),
      school_name: schoolName,
      school_phone: publicSchoolPhone(schoolPhone, installedProviders),
      school_email: publicSchoolEmail(schoolEmail, installedProviders),
      installedProviders,
    };
  });

const PUBLIC_ENROLLMENT_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 10 };

export const submitPublicEnrollment = createServerFn({ method: "POST" })
  .validator((input: unknown) => submitPublicEnrollmentInputSchema.parse(input))
  .handler(async ({ data }) => {
    // Formulário público: sem limite, um script enchia a lista de candidaturas.
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const rateLimitKey = `public_enrollment:${ip}`;
    if (ip !== "unknown" && !isRateLimitBypassed(rateLimitKey)) {
      if (!(await consumeRateLimit([rateLimitKey], PUBLIC_ENROLLMENT_RATE_LIMIT))) {
        throw new Error("Demasiadas candidaturas a partir desta ligação. Tente mais tarde.");
      }
    }
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

    let desiredProgram: { id: string; name: string } | null = null;
    if (data.desiredProgramId) {
      const { data: program } = await db
        .from("programs")
        .select("id, name")
        .eq("school_id", form.school_id)
        .eq("id", data.desiredProgramId)
        .in("kind", ["undergraduate", "postgraduate"])
        .eq("is_active", true)
        .maybeSingle();
      if (!program) throw new Error("O curso escolhido não está disponível nesta instituição.");
      desiredProgram = { id: String(program.id), name: String(program.name) };
    }

    const { data: inserted, error } = await db
      .from("enrollment_applications")
      .insert({
        school_id: form.school_id,
        form_id: form.id,
        full_name: data.person.full_name,
        status: "pending",
        payload: {
          person: data.person,
          guardianName: data.guardianName,
          guardianPhone: data.guardianPhone,
          guardianRelationship: data.guardianRelationship,
          ...(desiredProgram ? { desiredProgram } : {}),
        },
      })
      .select("id, created_at")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível enviar a candidatura.");
    return {
      ok: true,
      processNumber: candidacyProcessNumber(inserted.id, inserted.created_at),
    };
  });

export const listEnrollmentApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listEnrollmentApplicationsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriterFor("pessoas", context.supabase, context.userId, [
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
    return (rows ?? []).map((row) => ({
      ...row,
      processNumber: candidacyProcessNumber(row.id, row.created_at),
    }));
  });

export const decideEnrollmentApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => decideEnrollmentApplicationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    // Aceitar cria pessoa e aluno; register_student exige 2FA. Verificado antes
    // de escrever: sem isto, cada tentativa sem 2FA deixava pessoas órfãs.
    if (data.decision === "accepted") {
      requireAal2(context.claims, "Aceitar uma candidatura e criar o aluno");
    }
    const db = await loadSgaAdminClient();

    // A turma escolhida valida-se antes de criar o aluno.
    let classGroup: { id: string } | null = null;
    if (data.decision === "accepted" && data.classGroupId) {
      const { data: group, error: classError } = await db
        .from("class_groups")
        .select("id, academic_year_id")
        .eq("id", data.classGroupId)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      if (classError) throw publicDatabaseError(classError, "Não foi possível validar a turma.");
      if (!group) throw new Error("Turma não encontrada nesta escola.");
      if (!group.academic_year_id) throw new Error("Esta turma não tem ano lectivo associado.");
      classGroup = { id: String(group.id) };
    }

    // Reserva a candidatura antes de criar o que quer que seja: duas pessoas a
    // aceitar a mesma candidatura ao mesmo tempo criavam dois alunos. Uma
    // reserva abandonada (pedido que morreu a meio) expira em 10 minutos.
    const claimedAt = new Date();
    const staleBefore = new Date(claimedAt.getTime() - CLAIM_TTL_MS).toISOString();
    const { data: application, error: loadError } = await db
      .from("enrollment_applications")
      .update({ decided_at: claimedAt.toISOString(), decided_by: context.userId })
      .eq("id", data.applicationId)
      .eq("school_id", membership.schoolId)
      .eq("status", "pending")
      .or(`decided_at.is.null,decided_at.lt.${staleBefore}`)
      .select("id, full_name, payload, created_at, status")
      .maybeSingle();
    if (loadError) throw publicDatabaseError(loadError, "Não foi possível ler a candidatura.");
    if (!application) {
      throw new Error(
        "Esta candidatura já foi decidida ou está a ser processada por outra pessoa. Actualize a lista.",
      );
    }
    const releaseClaim = async () => {
      await db
        .from("enrollment_applications")
        .update({ decided_at: null, decided_by: null })
        .eq("id", application.id)
        .eq("school_id", membership.schoolId)
        .eq("status", "pending")
        .eq("decided_by", context.userId);
    };
    // Pessoas criadas por esta tentativa: se o registo do aluno falhar, saem
    // (marcadas como apagadas) para a tentativa seguinte não as duplicar.
    const createdPeople: string[] = [];
    const discardCreatedPeople = async () => {
      if (!createdPeople.length) return;
      await db
        .from("person_documents")
        .delete()
        .eq("school_id", membership.schoolId)
        .in("person_id", createdPeople);
      await db
        .from("people")
        .update({ deleted_at: new Date().toISOString(), updated_by: context.userId })
        .eq("school_id", membership.schoolId)
        .in("id", createdPeople);
    };

    let studentId: string | null = null;
    if (data.decision === "accepted") {
      try {
        const payload = (application.payload ?? {}) as {
          person?: {
            full_name?: string;
            email?: string;
            phone_primary?: string;
            nif?: string;
            birth_date?: string;
            sex?: string;
            province?: string;
            municipality?: string;
            commune?: string;
            address?: string;
          };
          guardianName?: string;
          guardianPhone?: string;
          guardianRelationship?: string;
        };
        const person = payload.person ?? {};
        const fullName = String(person.full_name ?? application.full_name).trim();
        const normalizedNif = normalizePersonNif(person.nif);
        const personPayload: TablesInsert<"people"> = {
          school_id: membership.schoolId,
          full_name: fullName,
          preferred_name: fullName.split(/\s+/)[0],
          email: person.email || null,
          phone: person.phone_primary
            ? (normalizeStoredPhone(person.phone_primary) ?? person.phone_primary)
            : null,
          national_id: normalizedNif,
          date_of_birth: person.birth_date || null,
          sex: person.sex === "M" ? "male" : person.sex === "F" ? "female" : person.sex || null,
          status: "active",
          created_by: context.userId,
          updated_by: context.userId,
        };
        const hasGeography = Boolean(
          person.province || person.municipality || person.commune || person.address,
        );
        if (hasGeography) {
          personPayload["province"] = person.province || null;
          personPayload["municipality"] = person.municipality || null;
          personPayload["commune"] = person.commune || null;
          personPayload["address"] = person.address || null;
        }

        // Mesmo BI já registado na escola: reaproveita a pessoa (antigo aluno,
        // irmão já com ficha de encarregado…) em vez de criar um duplicado; se
        // essa pessoa já é aluno, a candidatura não cria um segundo.
        let existingPersonId: string | null = null;
        if (normalizedNif) {
          const { data: samePerson, error: samePersonError } = await db
            .from("people")
            .select("id")
            .eq("school_id", membership.schoolId)
            .eq("national_id", normalizedNif)
            .is("deleted_at", null)
            .limit(1)
            .maybeSingle();
          if (samePersonError) {
            throw publicDatabaseError(
              samePersonError,
              "Não foi possível verificar o BI do candidato.",
            );
          }
          if (samePerson?.id) {
            const { data: existingStudent, error: existingStudentError } = await db
              .from("students")
              .select("id, student_number")
              .eq("school_id", membership.schoolId)
              .eq("person_id", samePerson.id)
              .is("deleted_at", null)
              .limit(1)
              .maybeSingle();
            if (existingStudentError) {
              throw publicDatabaseError(
                existingStudentError,
                "Não foi possível verificar o aluno.",
              );
            }
            if (existingStudent?.id) {
              throw new Error(
                `Já existe um aluno com este BI (processo ${existingStudent.student_number ?? "sem número"}). Matricule-o a partir da ficha dele.`,
              );
            }
            existingPersonId = String(samePerson.id);
          }
        }

        let personRow: { id: string };
        if (existingPersonId) {
          personRow = { id: existingPersonId };
        } else {
          const { data: inserted, error: personError } = await db
            .from("people")
            .insert(personPayload)
            .select("id")
            .single();
          if (personError && hasGeography && isMissingPeopleGeography(personError)) {
            throw new Error(
              "A candidatura contém localização, mas a migration territorial de Pessoas ainda não foi aplicada.",
            );
          }
          if (personError)
            throw publicDatabaseError(personError, "Não foi possível criar a pessoa.");
          personRow = inserted;
          createdPeople.push(inserted.id);
        }

        if (!existingPersonId && isAngolaBiNif(normalizedNif) && normalizedNif) {
          const { error: documentError } = await db.from("person_documents").insert({
            school_id: membership.schoolId,
            person_id: personRow.id,
            document_type: "bi",
            document_number: normalizedNif,
            created_by: context.userId,
            updated_by: context.userId,
          });
          if (documentError && !/duplicate|unique|23505/i.test(documentError.message)) {
            throw publicDatabaseError(
              documentError,
              "Não foi possível registar o BI do candidato.",
            );
          }
        }

        const guardianName = String(payload.guardianName ?? "").trim();
        let guardianPersonId: string | null = null;
        if (guardianName) {
          const { data: guardianPerson, error: guardianError } = await db
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
            .single();
          // Antes o erro era ignorado e o aluno ficava sem encarregado, sem aviso.
          if (guardianError) {
            throw publicDatabaseError(guardianError, "Não foi possível registar o encarregado.");
          }
          guardianPersonId = guardianPerson.id;
          createdPeople.push(guardianPerson.id);
        }

        // register_student cria o aluno (+ encarregado) numa transação atómica: gera o
        // número de processo por sequência própria (nunca duplica sob candidaturas
        // aceites em simultâneo) e valida a pessoa/encarregado antes de gravar.
        const { data: registered, error: registerError } = await sgaClient(context.supabase).rpc(
          "register_student",
          {
            school_id: membership.schoolId,
            person_id: personRow.id,
            admission_date: new Date().toISOString().slice(0, 10),
            guardian_person_id: guardianPersonId ?? undefined,
            // Ver nota em students/server.ts: DEFAULT NULL na base, opcional nos tipos.
            relationship: guardianPersonId
              ? mapSgaGuardianRelationship(payload.guardianRelationship || "encarregado")
              : undefined,
            primary_guardian: Boolean(guardianPersonId),
            financial_responsibility: Boolean(guardianPersonId),
            pickup_authorization: true,
          },
        );
        if (registerError) {
          // A base recusa sem 2FA (private.is_aal2) ou sem permissão. Antes, este
          // ramo repetia a escrita com a chave de serviço — contornava a recusa e
          // o registo do encarregado. Igual a createPerson: recusar e explicar.
          if (
            registerError.code === "42501" ||
            /is_aal2|autorização|permission denied/i.test(registerError.message ?? "")
          ) {
            throw new Error("Esta conta precisa de 2FA activo para matricular alunos.");
          }
          throw publicDatabaseError(registerError, "Não foi possível matricular o candidato.");
        } else {
          const studentOutcome = registered as { studentId: string };
          studentId = studentOutcome.studentId;
        }
      } catch (error) {
        // Nada ficou registado como aluno: desfaz as pessoas novas e liberta a
        // candidatura para outra tentativa.
        await discardCreatedPeople();
        await releaseClaim();
        throw error;
      }

      // O aluno existe: a candidatura fica aceite já, antes da turma. Se a
      // colocação na turma falhasse, a candidatura continuava «pendente» e
      // aceitá-la de novo criava um segundo aluno.
      await markApplicationDecided(db, {
        applicationId: application.id,
        schoolId: membership.schoolId,
        userId: context.userId,
        decision: "accepted",
        studentId,
      });

      const { recordStudentStatusHistory } = await import("@/features/students/status-history");
      if (classGroup && studentId) {
        // enroll_student tranca a turma (FOR UPDATE) e valida capacidade atomicamente.
        const { error: enrollError } = await sgaClient(context.supabase).rpc("enroll_student", {
          school_id: membership.schoolId,
          student_id: studentId,
          class_group_id: classGroup.id,
          enrolled_on: new Date().toISOString().slice(0, 10),
        });
        if (enrollError) {
          await recordStudentStatusHistory(db, {
            schoolId: membership.schoolId,
            studentId,
            previousStatus: null,
            newStatus: "applicant",
            reason: "Candidatura aceite; colocação na turma falhou",
            changedBy: context.userId,
          });
          // Sem desvio pela chave de serviço: saltaria a verificação de
          // capacidade da turma que enroll_student faz sob FOR UPDATE.
          if (
            enrollError.code === "42501" ||
            /is_aal2|autorização|permission denied/i.test(enrollError.message ?? "")
          ) {
            throw new Error(
              "Aluno criado, mas esta conta precisa de 2FA activo para o colocar na turma.",
            );
          }
          throw publicDatabaseError(
            enrollError,
            "Candidatura aceite e aluno criado, mas não foi possível colocá-lo na turma. Faça-o na ficha do aluno.",
          );
        }
      }

      await recordStudentStatusHistory(db, {
        schoolId: membership.schoolId,
        studentId: studentId!,
        previousStatus: null,
        newStatus: classGroup ? "active" : "applicant",
        reason: classGroup
          ? "Candidatura aceite e colocado em turma"
          : "Candidatura aceite (aguardando turma)",
        changedBy: context.userId,
      });
    }

    if (data.decision === "accepted") {
      return { id: application.id, status: "accepted", studentId };
    }
    const row = await markApplicationDecided(db, {
      applicationId: application.id,
      schoolId: membership.schoolId,
      userId: context.userId,
      decision: data.decision,
      studentId: null,
    });
    return { ...row, studentId };
  });

const CLAIM_TTL_MS = 10 * 60 * 1000;

/** Fecha a candidatura reservada por este utilizador (ver a reserva em decideEnrollmentApplication). */
async function markApplicationDecided(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  input: {
    applicationId: string;
    schoolId: string;
    userId: string;
    decision: "accepted" | "rejected";
    studentId: string | null;
  },
) {
  const updatePayload: TablesUpdate<"enrollment_applications"> = {
    status: input.decision,
    decided_at: new Date().toISOString(),
    decided_by: input.userId,
    updated_by: input.userId,
  };
  if (input.studentId) updatePayload["student_id"] = input.studentId;
  const { data: row, error } = await db
    .from("enrollment_applications")
    .update(updatePayload)
    .eq("id", input.applicationId)
    .eq("school_id", input.schoolId)
    .eq("status", "pending")
    .eq("decided_by", input.userId)
    .select("id, status")
    .maybeSingle();
  if (error) {
    throw publicDatabaseError(
      error,
      input.studentId
        ? "Aluno criado, mas a candidatura não actualizou."
        : "Não foi possível actualizar a candidatura.",
    );
  }
  if (!row) throw new Error("Candidatura já processada ou inexistente.");
  return row;
}
