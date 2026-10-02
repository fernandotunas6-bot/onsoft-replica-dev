import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Senha dos admins que os testes @live criam na produção. Vem de
 * `E2E_LIVE_ADMIN_PASSWORD` ou é gerada ao acaso em cada processo: cada teste
 * cria a conta e entra com ela no mesmo processo, por isso não precisa de ser
 * fixa. Esteve escrita aqui até 29/09 — o repositório passou a público e as
 * contas de teste antigas foram bloqueadas.
 */
export const E2E_LIVE_ADMIN_PASSWORD =
  process.env.E2E_LIVE_ADMIN_PASSWORD?.trim() || `E2e-${randomBytes(12).toString("base64url")}!9a`;

function loadRootEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

export function getLiveSupabaseAdmin(): SupabaseClient {
  loadRootEnv();
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const secret =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !secret) {
    throw new Error(
      "Testes @live requerem SUPABASE_URL e SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY) no .env.",
    );
  }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function ensureE2EAdminPassword(email: string, password = E2E_LIVE_ADMIN_PASSWORD) {
  const admin = getLiveSupabaseAdmin();
  const target = email.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(error.message);
  const user = data.users.find((row) => row.email?.toLowerCase() === target);
  if (!user?.id) throw new Error(`Utilizador admin não encontrado: ${email}`);
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });
  if (updateError) throw new Error(updateError.message);
  return user.id;
}

export async function findSchoolIdByTenantSlug(slug: string) {
  const admin = getLiveSupabaseAdmin();
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (tenantError) throw new Error(tenantError.message);
  if (!tenant?.id) return null;
  const { data: school, error: schoolError } = await admin
    .from("schools")
    .select("id")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (schoolError) throw new Error(schoolError.message);
  return school?.id ?? null;
}

export async function getAcceptedApplicationStudentId(schoolId: string, fullName: string) {
  const admin = getLiveSupabaseAdmin();
  const { data, error } = await admin
    .from("enrollment_applications")
    .select("id, status, student_id, full_name")
    .eq("school_id", schoolId)
    .eq("full_name", fullName)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Slugs criados pelos testes Playwright @live (prefixos de uniqueE2ESlug). */
export function isE2ETenantSlug(slug: string) {
  return /^(e2e|web|mat|gw)-[a-z0-9]+$/i.test(slug.trim());
}

/** Chave dev partilhada — espelha SIGA_GATEWAY_DEV_API_KEY na CI (.env). */
export const E2E_GATEWAY_DEV_API_KEY = "e2e-gateway-dev-key-ci";

export function getE2EGatewayDevApiKey() {
  return process.env.SIGA_GATEWAY_DEV_API_KEY?.trim() || E2E_GATEWAY_DEV_API_KEY;
}

export const E2E_GATEWAY_SCHOOL_WEBHOOK_KEY = "e2e-school-webhook-key-ci";

export const E2E_UNITEL_SCHOOL_WEBHOOK_KEY = "e2e-unitel-webhook-key-ci";

export async function installE2EMulticaixaIntegration(
  schoolId: string,
  config: { webhookApiKey: string; merchantId?: string },
) {
  const admin = getLiveSupabaseAdmin();
  await admin
    .from("school_integrations")
    .delete()
    .eq("school_id", schoolId)
    .eq("provider", "multicaixa_express");

  const { error } = await admin.from("school_integrations").insert({
    school_id: schoolId,
    provider: "multicaixa_express",
    status: "connected",
    config: {
      webhookApiKey: config.webhookApiKey,
      ...(config.merchantId ? { merchantId: config.merchantId } : {}),
    },
  });
  if (error) throw new Error(error.message);
}

export async function installE2EUnitelIntegration(
  schoolId: string,
  config: { webhookApiKey: string; merchantCode?: string },
) {
  const admin = getLiveSupabaseAdmin();
  await admin
    .from("school_integrations")
    .delete()
    .eq("school_id", schoolId)
    .eq("provider", "unitel_money");

  const { error } = await admin.from("school_integrations").insert({
    school_id: schoolId,
    provider: "unitel_money",
    status: "connected",
    config: {
      webhookApiKey: config.webhookApiKey,
      ...(config.merchantCode ? { merchantCode: config.merchantCode } : {}),
    },
  });
  if (error) throw new Error(error.message);
}

export interface E2EGatewayFixture {
  invoiceId: string;
  planId: string;
  reference: string;
  amount: number;
  studentId: string;
}

/** Fatura aberta + plano pending_gateway para testes @live do webhook EMIS/Unitel. */
export async function seedE2EGatewayFixture(
  schoolId: string,
  opts: { amount?: number; channel?: "multicaixa_express" | "unitel_money" } = {},
): Promise<E2EGatewayFixture> {
  const admin = getLiveSupabaseAdmin();
  const amount = opts.amount ?? 45_000;
  const channel = opts.channel ?? "multicaixa_express";
  const today = new Date().toISOString().slice(0, 10);

  const { data: staff } = await admin
    .from("school_memberships")
    .select("user_id")
    .eq("school_id", schoolId)
    .limit(1)
    .maybeSingle();
  let userId = staff?.user_id ?? null;
  if (!userId) {
    const { data: anyMember } = await admin
      .from("school_memberships")
      .select("user_id")
      .limit(1)
      .maybeSingle();
    userId = anyMember?.user_id ?? null;
  }

  let { data: year } = await admin
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .limit(1)
    .maybeSingle();

  if (!year?.id) {
    const curYear = new Date().getFullYear();
    const { data: createdYear, error: yearErr } = await admin
      .from("academic_years")
      .insert({
        school_id: schoolId,
        name: `${curYear}/${curYear + 1}`,
        starts_on: `${curYear}-09-01`,
        ends_on: `${curYear + 1}-07-31`,
        status: "active",
        ...(userId ? { created_by: userId, updated_by: userId } : {}),
      })
      .select("id")
      .single();
    if (yearErr)
      throw new Error(`Falha ao criar ano lectivo: ${yearErr.message} (${yearErr.details || ""})`);
    year = createdYear;
  }
  if (!year?.id) throw new Error("Ano lectivo em falta — bootstrap incompleto.");

  let { data: classGroup } = await admin
    .from("class_groups")
    .select("id")
    .eq("school_id", schoolId)
    .limit(1)
    .maybeSingle();

  if (!classGroup?.id) {
    let { data: campus } = await admin
      .from("campuses")
      .select("id")
      .eq("school_id", schoolId)
      .limit(1)
      .maybeSingle();
    if (!campus?.id) {
      const { data: createdCampus, error: campusErr } = await admin
        .from("campuses")
        .insert({
          school_id: schoolId,
          code: "SEDE",
          name: "Campus Principal",
          is_active: true,
        })
        .select("id")
        .single();
      if (campusErr) throw new Error(`Falha ao criar campus: ${campusErr.message}`);
      campus = createdCampus;
    }

    let { data: level } = await admin
      .from("academic_levels")
      .select("id")
      .eq("school_id", schoolId)
      .limit(1)
      .maybeSingle();
    if (!level?.id) {
      const { data: createdLevel, error: levelErr } = await admin
        .from("academic_levels")
        .insert({
          school_id: schoolId,
          code: "GERAL",
          name: "Ensino Geral",
          sequence: 1,
          is_active: true,
        })
        .select("id")
        .single();
      if (levelErr) throw new Error(`Falha ao criar nível académico: ${levelErr.message}`);
      level = createdLevel;
    }

    let { data: program } = await admin
      .from("programs")
      .select("id")
      .eq("school_id", schoolId)
      .limit(1)
      .maybeSingle();
    if (!program?.id && level?.id) {
      const { data: createdProgram, error: programErr } = await admin
        .from("programs")
        .insert({
          school_id: schoolId,
          academic_level_id: level.id,
          code: "GERAL",
          name: "Ensino Geral",
          kind: "general",
          is_active: true,
        })
        .select("id")
        .single();
      if (programErr) throw new Error(`Falha ao criar curso/programa: ${programErr.message}`);
      program = createdProgram;
    }

    let { data: grade } = await admin
      .from("grade_levels")
      .select("id")
      .eq("school_id", schoolId)
      .limit(1)
      .maybeSingle();
    if (!grade?.id && program?.id) {
      const { data: createdGrade, error: gradeErr } = await admin
        .from("grade_levels")
        .insert({
          school_id: schoolId,
          program_id: program.id,
          code: "10A",
          name: "10ª Classe",
          sequence: 10,
          is_active: true,
        })
        .select("id")
        .single();
      if (gradeErr) throw new Error(`Falha ao criar ano escolar/classe: ${gradeErr.message}`);
      grade = createdGrade;
    }

    const { data: createdGroup, error: groupErr } = await admin
      .from("class_groups")
      .insert({
        school_id: schoolId,
        academic_year_id: year.id,
        campus_id: campus?.id,
        grade_level_id: grade?.id,
        code: "10A-M",
        name: "10ª A — Manhã",
        shift: "morning",
        capacity: 35,
        status: "active",
        ...(userId ? { created_by: userId, updated_by: userId } : {}),
      })
      .select("id")
      .single();
    if (groupErr)
      throw new Error(`Falha ao criar turma: ${groupErr.message} (${groupErr.details || ""})`);
    classGroup = createdGroup;
  }
  if (!classGroup?.id) throw new Error("Turma em falta — bootstrap incompleto.");

  let { data: feePlan } = await admin
    .from("fee_plans")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!feePlan?.id) {
    const { data: createdPlan, error: planErr } = await admin
      .from("fee_plans")
      .insert({
        school_id: schoolId,
        academic_year_id: year.id,
        code: "PLANO-PADRAO",
        name: "Plano Padrão",
        status: "active",
      })
      .select("id")
      .single();
    if (planErr) throw new Error(`Falha ao criar plano financeiro: ${planErr.message}`);
    feePlan = createdPlan;
  }
  if (!feePlan?.id) throw new Error("Plano financeiro em falta — bootstrap incompleto.");

  let { data: feeItem } = await admin
    .from("fee_items")
    .select("id")
    .eq("school_id", schoolId)
    .eq("fee_plan_id", feePlan.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!feeItem?.id) {
    const { data: createdItem, error: itemErr } = await admin
      .from("fee_items")
      .insert({
        school_id: schoolId,
        fee_plan_id: feePlan.id,
        code: "PROPINA-MENSAL",
        name: "Propina Mensal",
        kind: "tuition",
        frequency: "monthly",
        amount,
        is_active: true,
      })
      .select("id")
      .single();
    if (itemErr) throw new Error(`Falha ao criar item de propina: ${itemErr.message}`);
    feeItem = createdItem;
  }
  if (!feeItem?.id) throw new Error("Item de taxa em falta — bootstrap incompleto.");

  const { data: person, error: personError } = await admin
    .from("people")
    .insert({
      school_id: schoolId,
      full_name: "Aluno Gateway E2E",
      preferred_name: "Aluno",
      status: "active",
      ...(userId ? { created_by: userId, updated_by: userId } : {}),
    })
    .select("id")
    .single();
  if (personError) throw new Error(personError.message);

  const studentNumber = `EST-${String(Math.floor(100000 + Math.random() * 900000))}`;
  const { data: student, error: studentErr } = await admin
    .from("students")
    .insert({
      school_id: schoolId,
      person_id: person.id,
      student_number: studentNumber,
      admission_date: today,
      status: "active",
      ...(userId ? { created_by: userId, updated_by: userId } : {}),
    })
    .select("id")
    .single();
  if (studentErr) throw new Error(`Falha ao criar estudante: ${studentErr.message}`);
  const studentId = student.id;

  const enrollmentNumber = `MAT-${String(Math.floor(100000 + Math.random() * 900000))}`;
  const { data: enrollment, error: enrollmentErr } = await admin
    .from("enrollments")
    .insert({
      school_id: schoolId,
      academic_year_id: year.id,
      class_group_id: classGroup.id,
      student_id: studentId,
      enrollment_number: enrollmentNumber,
      enrolled_on: today,
      status: "active",
      ...(userId ? { created_by: userId, updated_by: userId } : {}),
    })
    .select("id")
    .single();
  if (enrollmentErr) throw new Error(`Falha ao criar matrícula: ${enrollmentErr.message}`);

  const { data: contract, error: contractError } = await admin
    .from("finance_contracts")
    .insert({
      school_id: schoolId,
      enrollment_id: enrollment.id,
      fee_plan_id: feePlan.id,
      discount_percentage: 0,
      status: "active",
      ...(userId ? { created_by: userId } : {}),
    })
    .select("id")
    .single();
  if (contractError) throw new Error(contractError.message);

  const invoiceNumber = `E2E-GW-${Date.now()}`;
  const { data: invoice, error: invoiceError } = await admin
    .from("finance_invoices")
    .insert({
      school_id: schoolId,
      contract_id: contract.id,
      fee_item_id: feeItem.id,
      invoice_number: invoiceNumber,
      competence_month: `${today.slice(0, 7)}-01`,
      amount,
      discount_amount: 0,
      penalty_amount: 0,
      due_date: today,
      status: "open",
      ...(userId ? { issued_by: userId } : {}),
    })
    .select("id")
    .single();
  if (invoiceError) throw new Error(invoiceError.message);

  const {
    generateMulticaixaReference,
    normalizePaymentReference,
    resolveConfiguredSchoolEmisEntity,
  } = await import("@/features/finance/emiss-multicaixa");
  const emisEntity = await resolveConfiguredSchoolEmisEntity(admin, schoolId);
  if (!emisEntity) throw new Error("A escola de teste não tem entidade EMIS configurada.");
  const generated = generateMulticaixaReference(emisEntity, invoice.id, amount);
  const reference = normalizePaymentReference(generated.reference);

  const { data: plan, error: planError } = await admin
    .from("finance_payment_plans")
    .insert({
      school_id: schoolId,
      invoice_id: invoice.id,
      student_id: studentId,
      channel,
      installments: 1,
      reference,
      status: "pending_gateway",
      ...(userId ? { created_by: userId, updated_by: userId } : {}),
    })
    .select("id")
    .single();
  if (planError) throw new Error(planError.message);

  return {
    invoiceId: invoice.id as string,
    planId: plan.id as string,
    reference,
    amount,
    studentId,
  };
}

export async function getFinanceInvoiceStatus(invoiceId: string) {
  const admin = getLiveSupabaseAdmin();
  const { data, error } = await admin
    .from("finance_invoices")
    .select("status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.status ?? null;
}

export async function getPaymentPlanStatus(planId: string) {
  const admin = getLiveSupabaseAdmin();
  const { data, error } = await admin
    .from("finance_payment_plans")
    .select("status")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.status ?? null;
}

/** Remove tenant E2E de teste — só slugs e2e/web/mat e e-mail @siga-plus.test. */
export async function cleanupE2ETenantBySlug(slug: string, adminEmail?: string) {
  if (!isE2ETenantSlug(slug)) {
    throw new Error(`Refusing cleanup: slug «${slug}» não parece tenant E2E.`);
  }
  if (adminEmail && !adminEmail.trim().toLowerCase().endsWith("@siga-plus.test")) {
    throw new Error("Refusing cleanup: e-mail admin fora do domínio de teste.");
  }

  const admin = getLiveSupabaseAdmin();
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (tenantError) throw new Error(tenantError.message);
  if (!tenant?.id) return { removed: false as const };

  const tenantId = tenant.id as string;
  const { data: school } = await admin
    .from("schools")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (school?.id) {
    const { error: schoolDeleteError } = await admin.from("schools").delete().eq("id", school.id);
    if (schoolDeleteError) throw new Error(schoolDeleteError.message);
  }

  await admin.from("tenant_domains").delete().eq("tenant_id", tenantId);
  await admin.from("subscriptions").delete().eq("tenant_id", tenantId);
  await admin.from("tenant_usage").delete().eq("tenant_id", tenantId);
  await admin.from("saas_audit_logs").delete().eq("tenant_id", tenantId);

  const { error: tenantDeleteError } = await admin.from("tenants").delete().eq("id", tenantId);
  if (tenantDeleteError) throw new Error(tenantDeleteError.message);

  if (adminEmail) {
    const target = adminEmail.trim().toLowerCase();
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const user = users.users.find((row) => row.email?.toLowerCase() === target);
    if (user?.id) {
      await admin.auth.admin.deleteUser(user.id).catch(() => undefined);
    }
  }

  return { removed: true as const, tenantId };
}
