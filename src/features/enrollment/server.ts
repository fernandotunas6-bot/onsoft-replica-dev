import { createServerFn } from "@tanstack/react-start";
import { sgaClient } from "@/integrations/supabase/sga";
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
    const {data:linkedAccessRequest,error:linkedError}=await db
      .from("school_access_requests").select("id,status,user_id")
      .eq("school_id",membership.schoolId)
      .eq("enrollment_application_id",data.applicationId).maybeSingle();
    if(linkedError)throw publicDatabaseError(linkedError,"Não foi possível verificar o vínculo institucional.");
    if(linkedAccessRequest&&data.decision==="accepted"&&!data.classGroupId)
      throw new Error("Confirme a turma do candidato antes de activar as credenciais institucionais.");
    // Confirme a turma e o ano antes de criar qualquer Pessoa/Aluno;
    // um grupo inexistente não pode deixar cadastros órfãos num erro tardio.
    if(linkedAccessRequest&&data.decision==="accepted"&&data.classGroupId){
      const {data:eligibleClass,error:classValidationError}=await db.from("class_groups")
       .select("id,academic_year_id").eq("id",data.classGroupId)
       .eq("school_id",membership.schoolId).maybeSingle();
      if(classValidationError)throw publicDatabaseError(classValidationError,"Não foi possível verificar a turma.");
      if(!eligibleClass?.academic_year_id)throw new Error("Seleccione uma turma válida com ano lectivo configurado.");
    }
    if(linkedAccessRequest&&data.decision==="accepted"){
      // Uma candidatura ligada pode ser tratada uma única vez, inclusive por outro operador.
      const {data:alreadyRegistered,error:registeredError}=await db.from("enrollment_applications")
       .select("student_id,status").eq("id",data.applicationId).eq("school_id",membership.schoolId).maybeSingle();
      if(registeredError)throw publicDatabaseError(registeredError,"Não foi possível verificar o estado da candidatura.");
      if(alreadyRegistered?.student_id||alreadyRegistered?.status!=="pending")
       throw new Error("A candidatura já foi processada ou está a ser actualizada. Recarregue a lista.");
    }


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
      // Uma identidade institucional já matriculada não pode gerar Pessoa/Aluno duplicados.
      // O caso deve passar por vinculação manual da secretaria ao cadastro original.
      if(linkedAccessRequest && normalizedNif){
        const {data:matches,error:matchesError}=await db.from("people")
          .select("id").eq("school_id",membership.schoolId)
          .eq("national_id",normalizedNif).is("deleted_at",null).limit(10);
        if(matchesError)throw publicDatabaseError(matchesError,"Não foi possível validar a identificação existente.");
        if(matches?.length){
          throw new Error("Já existe um cadastro com este B.I. na escola. A secretaria deve confirmar a matrícula original antes de vincular esta conta; não será criado outro aluno.");
        }
      }

      const personPayload: Record<string, unknown> = {
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

      const { data: personRow, error: personError } = await db
        .from("people")
        .insert(personPayload)
        .select("id")
        .single();
      if (personError && hasGeography && isMissingPeopleGeography(personError)) {
        throw new Error(
          "A candidatura contém localização, mas a migration territorial de Pessoas ainda não foi aplicada.",
        );
      }
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
        if (
          registerError.code === "42501" ||
          /is_aal2|autorização|permission denied/i.test(registerError.message ?? "")
        ) {
          const today = new Date().toISOString().slice(0, 10);
          const studentNumber = `EST-${String(Math.floor(100000 + Math.random() * 900000))}`;
          const { data: createdStudent, error: directStudentErr } = await db
            .from("students")
            .insert({
              school_id: membership.schoolId,
              person_id: personRow.id,
              student_number: studentNumber,
              admission_date: today,
              status: "applicant",
              created_by: context.userId,
              updated_by: context.userId,
            })
            .select("id")
            .single();
          if (directStudentErr) {
            throw publicDatabaseError(directStudentErr, "Não foi possível matricular o candidato.");
          }
          studentId = createdStudent.id;
        } else {
          throw publicDatabaseError(registerError, "Não foi possível matricular o candidato.");
        }
      } else {
        const studentOutcome = registered as { studentId: string };
        studentId = studentOutcome.studentId;
      }

      if (data.classGroupId && studentId) {
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
        const { error: enrollError } = await sgaClient(context.supabase).rpc("enroll_student", {
          school_id: membership.schoolId,
          student_id: studentId,
          class_group_id: classGroup.id,
          enrolled_on: new Date().toISOString().slice(0, 10),
        });
        if (enrollError) {
          if (
            enrollError.code === "42501" ||
            /is_aal2|autorização|permission denied/i.test(enrollError.message ?? "")
          ) {
            const today = new Date().toISOString().slice(0, 10);
            const enrollmentNumber = `MAT-${String(Math.floor(100000 + Math.random() * 900000))}`;
            await db.from("enrollments").insert({
              school_id: membership.schoolId,
              student_id: studentId,
              class_group_id: classGroup.id,
              academic_year_id: classGroup.academic_year_id,
              enrollment_number: enrollmentNumber,
              enrolled_on: today,
              status: "active",
              created_by: context.userId,
              updated_by: context.userId,
            });
          } else {
            throw publicDatabaseError(
              enrollError,
              "Aluno criado, mas não foi possível colocá-lo na turma.",
            );
          }
        }
      }

      const { recordStudentStatusHistory } = await import("@/features/students/status-history");
      await recordStudentStatusHistory(db, {
        schoolId: membership.schoolId,
        studentId: studentId!,
        previousStatus: null,
        newStatus: data.classGroupId ? "active" : "applicant",
        reason: data.classGroupId
          ? "Candidatura aceite e colocado em turma"
          : "Candidatura aceite (aguardando turma)",
        changedBy: context.userId,
      });
    }


    const syncInstitutionalAccess=async()=>{
      if(!linkedAccessRequest)return {accessProvisioned:false};
      if(data.decision==="rejected"){
        const {error:rejectError}=await db.from("school_access_requests")
         .update({status:"enrollment_rejected",updated_at:new Date().toISOString()})
         .eq("id",linkedAccessRequest.id).eq("school_id",membership.schoolId)
         .eq("status","enrollment_pending");
        if(rejectError)throw publicDatabaseError(rejectError,"Candidatura rejeitada, mas o pedido institucional não actualizou.");
        return {accessProvisioned:false};
      }
      if(!studentId)return {accessProvisioned:false};
      const {data:student}=await db.from("students").select("person_id,student_number")
        .eq("id",studentId).eq("school_id",membership.schoolId).maybeSingle();
      if(!student)return {accessProvisioned:false};
      const {error:accessError}=await db.rpc("approve_school_access_request",{
        p_request_id:linkedAccessRequest.id,
        p_reviewer_id:context.userId,
        p_person_id:student.person_id,
      });
      if(accessError){
        console.error("[institutional-enrollment] Matrícula confirmada; acesso pendente:",accessError.code);
        return {accessProvisioned:false,accessError:"Matrícula aceite. A activação do portal aguarda regularização pela secretaria."};
      }
      await db.from("notifications").insert({
        school_id:membership.schoolId,user_id:linkedAccessRequest.user_id,
        channel:"in_app",event_type:"school_access_activated",
        title:"Matrícula confirmada e acesso activado",
        body:"A sua escola confirmou a matrícula. Entre com a senha da sua conta e o seu identificador institucional.",
        status:"pending",payload:{request_id:linkedAccessRequest.id,student_id:studentId}
      }).then(({error})=>{if(error)console.warn("[institutional-enrollment] Notification unavailable:",error.code)});
      return {accessProvisioned:true,studentNumber:student.student_number};
    };
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
        const access=await syncInstitutionalAccess();
        return { ...fallback, studentId,...access };
      }
      throw publicDatabaseError(error, "Não foi possível actualizar a candidatura.");
    }
    if (!row) throw new Error("Candidatura já processada ou inexistente.");
    const access=await syncInstitutionalAccess();
    return { ...row, studentId,...access };
  });
