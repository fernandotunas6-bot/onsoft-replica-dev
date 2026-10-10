/**
 * Solicitações de vinculação institucional — servidor.
 *
 * Fluxo: identidade autenticada sem vínculo → escolhe escola e perfil → pede
 * acesso → secretaria verifica → aprovação cria/activa SÓ o vínculo
 * (`school_memberships` + `member_roles`) e, se o revisor o pedir
 * explicitamente, liga a conta ao cadastro encontrado (`people.user_id`).
 *
 * Nunca cria matrícula, contrato ou cadastro novo. Nunca devolve ao requerente
 * dados do cadastro encontrado. Toda a decisão fica em `audit_logs`.
 */
import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAal2 } from "@/features/hr/require-aal2";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { mapAppRoleToSgaCodes } from "@/integrations/supabase/sga";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { listUserSchoolMemberships } from "@/integrations/supabase/sga";
import { checkRateLimit, recordRateLimitAttempt } from "@/lib/rate-limit";
import { getAppName, getAppUrl } from "@/lib/app-config";
import {
  accessRequestProfileLabels,
  accessRequestStatusLabels,
  canGrantRole,
  classifyAccountLink,
  compactIdentifier,
  grantableRoleCodes,
  isSafeRecordMatch,
  nextAccessRequestStatus,
  OPEN_ACCESS_REQUEST_STATUSES,
  pickRoleByPreference,
  type AccessRequestProfile,
  type AccessRequestStatus,
  type AccountLinkSituation,
} from "./institutional-link";
import {
  listSchoolAccessRequestsInputSchema,
  requesterAccessRequestActionInputSchema,
  reviewAccessRequestInputSchema,
  searchSchoolsForAccessInputSchema,
  submitAccessRequestInputSchema,
} from "./request-schemas";
import { escapeHtml } from "@/lib/escape-html";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

const SEARCH_RATE_LIMIT = { windowMs: 60_000, max: 20 };
const SUBMIT_RATE_LIMIT = { windowMs: 60 * 60_000, max: 5 };
/** Escolas nestes estados não recebem pedidos. */
const INELIGIBLE_SCHOOL_STATUSES = [
  "suspended",
  "cancelled",
  "canceled",
  "archived",
  "inactive",
  "deleted",
  "blocked",
];

const REQUEST_COLUMNS =
  "id, school_id, user_id, requested_profile, status, full_name, national_id, institutional_number, contact_phone, message, matched_person_id, match_kind, granted_role_code, membership_id, reviewer_id, reviewed_at, decision_note, info_request_note, requester_reply, created_at, updated_at";

type AccessRequestRow = {
  id: string;
  school_id: string;
  user_id: string;
  requested_profile: AccessRequestProfile;
  status: AccessRequestStatus;
  full_name: string;
  national_id: string | null;
  institutional_number: string | null;
  contact_phone: string | null;
  message: string | null;
  matched_person_id: string | null;
  match_kind: string | null;
  granted_role_code: string | null;
  membership_id: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  decision_note: string | null;
  info_request_note: string | null;
  requester_reply: string | null;
  created_at: string;
  updated_at: string;
};

const MISSING_TABLE_MESSAGE =
  "As solicitações de acesso ainda não estão activas nesta instalação (tabela school_access_requests por aplicar — ver npm run siga:sql).";

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /school_access_requests/.test(error.message ?? "")
  );
}

function raise(error: { code?: string; message: string }, fallback: string): never {
  if (isMissingTable(error)) throw new Error(MISSING_TABLE_MESSAGE);
  throw publicDatabaseError(error, fallback);
}

async function loadSchoolNames(db: Db, schoolIds: string[]) {
  const map = new Map<string, { name: string }>();
  if (!schoolIds.length) return map;
  const { data } = await db.from("schools").select("id, name").in("id", schoolIds);
  for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
    map.set(row.id, { name: row.name });
  }
  return map;
}

async function writeAudit(
  db: Db,
  entry: {
    schoolId: string;
    actorId: string;
    action: string;
    requestId: string;
    metadata: Record<string, unknown>;
  },
) {
  try {
    await db.from("audit_logs").insert({
      school_id: entry.schoolId,
      actor_user_id: entry.actorId,
      action: entry.action,
      entity_type: "school_access_request",
      entity_id: entry.requestId,
      metadata: entry.metadata as Json,
    });
  } catch (error) {
    // A auditoria não pode derrubar a decisão já gravada, mas não fica em silêncio.
    console.error("[access-requests] audit_logs insert failed:", error);
  }
}

/** E-mail de melhor esforço: só com RESEND_API_KEY configurada. Devolve se foi enviado. */
async function notifyByEmail(input: {
  to: string | null | undefined;
  schoolName: string;
  subject: string;
  lines: string[];
}): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  const to = input.to?.trim();
  if (!apiKey || !to || !to.includes("@")) return false;
  try {
    const { resolveSystemSender, sendResendEmail } =
      await import("@/features/integrations/resend-client");
    const text = [...input.lines, "", `${getAppName()} · ${getAppUrl()}`].join("\n");
    const html = input.lines
      .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
      .join("");
    await sendResendEmail({
      apiKey,
      from: resolveSystemSender("auth", { schoolName: input.schoolName }),
      to: [to],
      subject: input.subject,
      html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111">${html}<p style="color:#666;font-size:12px">${escapeHtml(getAppName())}</p></div>`,
      text,
    });
    return true;
  } catch (error) {
    console.error("[access-requests] email failed:", error);
    return false;
  }
}

/** Papéis que revêem pedidos de acesso (os mesmos de `is_school_office`). */
const REVIEWER_ROLE_CODES = ["owner", "admin", "administrador", "secretary", "secretaria"];

/**
 * Avisa no portal (sino de notificações) quem revê pedidos na escola. Antes
 * só havia e-mail, e só com RESEND_API_KEY e e-mail na ficha da escola: sem
 * isso ninguém sabia que havia pedidos à espera. Falha em silêncio registado —
 * o pedido já está gravado e aparece em Acessos na mesma.
 */
async function notifyReviewers(
  db: Db,
  schoolId: string,
  input: { title: string; body: string; requestId: string },
): Promise<number> {
  try {
    // Três leituras simples: entre member_roles e roles/school_memberships há
    // duas chaves estrangeiras cada, e um embed seria ambíguo (PGRST201).
    const { data: memberships, error } = await db
      .from("school_memberships")
      .select("id, user_id")
      .eq("school_id", schoolId)
      .eq("status", "active");
    if (error) throw error;
    const userByMembership = new Map(
      ((memberships ?? []) as Array<{ id: string; user_id: string | null }>)
        .filter((m) => m.user_id)
        .map((m) => [m.id, m.user_id as string]),
    );
    if (!userByMembership.size) return 0;
    const { data: memberRoles, error: mrError } = await db
      .from("member_roles")
      .select("membership_id, role_id")
      .eq("school_id", schoolId)
      .in("membership_id", [...userByMembership.keys()]);
    if (mrError) throw mrError;
    const roleIds = [
      ...new Set(((memberRoles ?? []) as Array<{ role_id: string }>).map((r) => r.role_id)),
    ];
    const { data: roles, error: rolesError } = roleIds.length
      ? await db.from("roles").select("id, code").in("id", roleIds)
      : { data: [], error: null };
    if (rolesError) throw rolesError;
    const reviewerRoleIds = new Set(
      ((roles ?? []) as Array<{ id: string; code: string | null }>)
        .filter((r) => REVIEWER_ROLE_CODES.includes((r.code ?? "").toLowerCase()))
        .map((r) => r.id),
    );
    const userIds = new Set<string>();
    for (const mr of (memberRoles ?? []) as Array<{ membership_id: string; role_id: string }>) {
      const userId = userByMembership.get(mr.membership_id);
      if (userId && reviewerRoleIds.has(mr.role_id)) userIds.add(userId);
    }
    if (!userIds.size) return 0;
    const { insertInAppNotifications } = await import("@/features/academic/lesson-delivery");
    return await insertInAppNotifications(
      db,
      schoolId,
      [...userIds].map((userId) => ({
        userId,
        eventType: "access_request.submitted",
        title: input.title,
        body: input.body,
        payload: { requestId: input.requestId, href: "/acessos" },
      })),
    );
  } catch (error) {
    console.error("[access-requests] in-app notify failed:", error);
    return 0;
  }
}

/** Mostra só o fim de um identificador sensível (B.I.) na lista da secretaria. */
function maskIdentifier(value: string | null | undefined) {
  const compact = compactIdentifier(value);
  if (!compact) return null;
  if (compact.length <= 4) return "•".repeat(compact.length);
  return `${"•".repeat(Math.max(3, compact.length - 4))}${compact.slice(-4)}`;
}

// ─── Localizar cadastro institucional com segurança ─────────────────────────

type RecordMatch = { personId: string; kind: string } | null;

/**
 * Procura, NA ESCOLA indicada, o cadastro que corresponde ao pedido. Exige
 * dois factores (B.I. + identificador institucional). Filtra por B.I. na base
 * e compara números em memória — nenhum valor do utilizador entra num filtro
 * `.or(...)` do PostgREST.
 */
async function findInstitutionalRecord(
  db: Db,
  schoolId: string,
  profile: AccessRequestProfile,
  nationalId: string | undefined,
  institutionalNumber: string | undefined,
): Promise<RecordMatch> {
  const bi = compactIdentifier(nationalId);
  if (bi.length < 5 || !compactIdentifier(institutionalNumber)) return null;

  const { data: people } = await db
    .from("people")
    .select("id, national_id")
    .eq("school_id", schoolId)
    .eq("national_id", bi)
    .is("deleted_at", null)
    .limit(5);
  const candidates = (people ?? []) as Array<{ id: string; national_id: string | null }>;
  if (!candidates.length) return null;
  const personIds = candidates.map((p) => p.id);
  const nationalIdOf = new Map(candidates.map((p) => [p.id, p.national_id]));

  const matches = (personId: string, numbers: Array<string | null>) =>
    isSafeRecordMatch({
      requestedNumber: institutionalNumber,
      requestedNationalId: nationalId,
      recordNumbers: numbers,
      recordNationalId: nationalIdOf.get(personId) ?? null,
    });

  if (profile === "aluno") {
    const { data } = await db
      .from("students")
      .select("person_id, student_number")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .in("person_id", personIds);
    for (const row of (data ?? []) as Array<{ person_id: string; student_number: string | null }>) {
      if (matches(row.person_id, [row.student_number])) {
        return { personId: row.person_id, kind: "student_number+national_id" };
      }
    }
    return null;
  }

  if (profile === "professor" || profile === "funcionario" || profile === "outro") {
    const { data: teachers } = await db
      .from("teachers")
      .select("person_id, employee_number")
      .eq("school_id", schoolId)
      .in("person_id", personIds);
    for (const row of (teachers ?? []) as Array<{
      person_id: string;
      employee_number: string | null;
    }>) {
      if (matches(row.person_id, [row.employee_number])) {
        return { personId: row.person_id, kind: "teacher_number+national_id" };
      }
    }
    try {
      const { data: employments } = await db
        .from("hr_employments")
        .select("person_id, employee_number")
        .eq("school_id", schoolId)
        .in("person_id", personIds);
      for (const row of (employments ?? []) as Array<{
        person_id: string;
        employee_number: string | null;
      }>) {
        if (matches(row.person_id, [row.employee_number])) {
          return { personId: row.person_id, kind: "employee_number+national_id" };
        }
      }
    } catch {
      // RH ainda não aplicado nesta escola: sem correspondência por esta via.
    }
    return null;
  }

  if (profile === "encarregado") {
    // O encarregado identifica-se com o seu B.I. e o número do educando: o
    // educando tem de estar ligado a esta pessoa em student_guardians.
    const { data: links } = await db
      .from("student_guardians")
      .select("student_id, guardian_person_id")
      .eq("school_id", schoolId)
      .in("guardian_person_id", personIds);
    const guardianLinks = (links ?? []) as Array<{
      student_id: string;
      guardian_person_id: string;
    }>;
    if (!guardianLinks.length) return null;
    const { data: students } = await db
      .from("students")
      .select("id, student_number")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .in(
        "id",
        guardianLinks.map((l) => l.student_id),
      );
    const byId = new Map(
      (
        (students ?? []) as Array<{
          id: string;
          student_number: string | null;
        }>
      ).map((s) => [s.id, s]),
    );
    for (const link of guardianLinks) {
      const student = byId.get(link.student_id);
      if (!student) continue;
      if (matches(link.guardian_person_id, [student.student_number])) {
        return { personId: link.guardian_person_id, kind: "ward_student_number+national_id" };
      }
    }
  }
  return null;
}

// ─── Requerente ─────────────────────────────────────────────────────────────

export type MyAccessRequest = {
  id: string;
  schoolId: string;
  schoolName: string;
  profile: AccessRequestProfile;
  profileLabel: string;
  status: AccessRequestStatus;
  statusLabel: string;
  infoRequestNote: string | null;
  decisionNote: string | null;
  requesterReply: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InstitutionalLinkState = {
  situation: AccountLinkSituation;
  email: string | null;
  emailVerified: boolean;
  requests: MyAccessRequest[];
  /** false quando a tabela ainda não foi aplicada — a UI diz isso em vez de fingir. */
  requestsAvailable: boolean;
};

/** Situação da conta: com vínculo activo, ou sem vínculo (e os pedidos que já fez). */
export const getInstitutionalLinkState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InstitutionalLinkState> => {
    const db = await loadSgaAdminClient();
    const memberships = await listUserSchoolMemberships(db, context.userId);

    let email: string | null = null;
    let emailVerified = false;
    try {
      const { data } = await db.auth.admin.getUserById(context.userId);
      email = data.user?.email ?? null;
      emailVerified = Boolean(data.user?.email_confirmed_at);
    } catch {
      email = typeof context.claims.email === "string" ? context.claims.email : null;
    }

    const { data, error } = await db
      .from("school_access_requests")
      .select(REQUEST_COLUMNS)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error && !isMissingTable(error)) {
      throw publicDatabaseError(error, "Não foi possível consultar os seus pedidos de acesso.");
    }
    const rows = (error ? [] : (data ?? [])) as AccessRequestRow[];
    const schools = await loadSchoolNames(db, [...new Set(rows.map((r) => r.school_id))]);

    return {
      situation: classifyAccountLink(memberships),
      email,
      emailVerified,
      requestsAvailable: !error,
      requests: rows.map((row) => ({
        id: row.id,
        schoolId: row.school_id,
        schoolName: schools.get(row.school_id)?.name ?? "Escola",
        profile: row.requested_profile,
        profileLabel: accessRequestProfileLabels[row.requested_profile],
        status: row.status,
        statusLabel: accessRequestStatusLabels[row.status],
        infoRequestNote: row.info_request_note,
        decisionNote:
          row.status === "rejected" || row.status === "approved" ? row.decision_note : null,
        requesterReply: row.requester_reply,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  });

export type SchoolSearchResult = {
  id: string;
  name: string;
  /** Nome comercial, quando difere do nome oficial. */
  commercialName: string | null;
  /** Código público da escola (`schools.public_code`). */
  code: string | null;
  province: string | null;
};

type SchoolSearchRow = {
  id: string;
  name: string;
  commercial_name: string | null;
  public_code: string | null;
  province: string | null;
  status: string | null;
};

const SCHOOL_SEARCH_COLUMNS = "id, name, commercial_name, public_code, province, status";

function isEligibleSchool(status: string | null | undefined) {
  return !status || !INELIGIBLE_SCHOOL_STATUSES.includes(status.toLowerCase());
}

/**
 * Pesquisa escolas registadas no SIGA Plus por nome, nome comercial, código
 * público ou subdomínio. Só devolve identificação pública — nunca contactos,
 * NIF ou dados internos.
 */
export const searchSchoolsForAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => searchSchoolsForAccessInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<SchoolSearchResult[]> => {
    const key = `access_school_search:${context.userId}`;
    if (!checkRateLimit([key], SEARCH_RATE_LIMIT)) {
      throw new Error("Demasiadas pesquisas seguidas. Aguarde um minuto.");
    }
    recordRateLimitAttempt([key], SEARCH_RATE_LIMIT);

    const db = await loadSgaAdminClient();
    // Só letras, dígitos, espaço e hífen chegam ao padrão ILIKE — `%`, `_`,
    // vírgulas e parênteses ficam de fora (sintaxe de filtro do PostgREST).
    const term = data.query
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (term.length < 3) return [];
    const pattern = `%${term}%`;
    const code = term.replace(/\s+/g, "");

    const [byName, byCommercialName, byCode, bySlug] = await Promise.all([
      db.from("schools").select(SCHOOL_SEARCH_COLUMNS).ilike("name", pattern).limit(15),
      db.from("schools").select(SCHOOL_SEARCH_COLUMNS).ilike("commercial_name", pattern).limit(15),
      db.from("schools").select(SCHOOL_SEARCH_COLUMNS).ilike("public_code", code).limit(3),
      db.from("tenants").select("id").eq("slug", term.toLowerCase().replace(/\s+/g, "-")).limit(1),
    ]);

    const tenantIds = ((bySlug.data ?? []) as Array<{ id: string }>).map((t) => t.id);
    const byTenant = tenantIds.length
      ? await db.from("schools").select(SCHOOL_SEARCH_COLUMNS).in("tenant_id", tenantIds).limit(5)
      : { data: [] as SchoolSearchRow[] };

    const results = new Map<string, SchoolSearchResult>();
    // Correspondências exactas (código, subdomínio) primeiro.
    for (const row of [
      ...((byCode.data ?? []) as SchoolSearchRow[]),
      ...((byTenant.data ?? []) as SchoolSearchRow[]),
      ...((byName.data ?? []) as SchoolSearchRow[]),
      ...((byCommercialName.data ?? []) as SchoolSearchRow[]),
    ]) {
      if (!isEligibleSchool(row.status) || results.has(row.id)) continue;
      results.set(row.id, {
        id: row.id,
        name: row.name,
        commercialName:
          row.commercial_name && row.commercial_name !== row.name ? row.commercial_name : null,
        code: row.public_code,
        province: row.province,
      });
    }
    return [...results.values()].slice(0, 12);
  });

export const submitAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => submitAccessRequestInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const key = `access_request_submit:${context.userId}`;
    if (!checkRateLimit([key], SUBMIT_RATE_LIMIT)) {
      throw new Error("Atingiu o limite de pedidos por hora. Tente mais tarde.");
    }

    const db = await loadSgaAdminClient();

    const { data: school, error: schoolError } = await db
      .from("schools")
      .select("id, name, email, status")
      .eq("id", data.schoolId)
      .maybeSingle();
    if (schoolError) throw publicDatabaseError(schoolError, "Não foi possível validar a escola.");
    if (!school || !isEligibleSchool(school.status as string | null)) {
      throw new Error("Esta escola não está disponível para pedidos de acesso.");
    }

    const { data: existing } = await db
      .from("school_memberships")
      .select("id, status")
      .eq("school_id", data.schoolId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing?.status === "active") {
      throw new Error("A sua conta já está associada a esta escola.");
    }
    if (existing?.status === "suspended") {
      throw new Error(
        "O seu acesso a esta escola foi suspenso. Contacte a secretaria da escola directamente.",
      );
    }

    recordRateLimitAttempt([key], SUBMIT_RATE_LIMIT);

    const nationalId = data.nationalId ? compactIdentifier(data.nationalId) : undefined;
    const match = await findInstitutionalRecord(
      db,
      data.schoolId,
      data.profile,
      nationalId,
      data.institutionalNumber,
    );

    const { data: inserted, error } = await db
      .from("school_access_requests")
      .insert({
        school_id: data.schoolId,
        user_id: context.userId,
        requested_profile: data.profile,
        status: "pending",
        full_name: data.fullName,
        national_id: nationalId ?? null,
        institutional_number: data.institutionalNumber ?? null,
        contact_phone: data.contactPhone ?? null,
        message: data.message ?? null,
        matched_person_id: match?.personId ?? null,
        match_kind: match?.kind ?? null,
      })
      .select("id, status, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error(
          "Já tem um pedido em aberto para esta escola. Aguarde a decisão da secretaria.",
        );
      }
      raise(error, "Não foi possível enviar o pedido de acesso.");
    }

    await writeAudit(db, {
      schoolId: data.schoolId,
      actorId: context.userId,
      action: "access_request.submitted",
      requestId: inserted.id,
      metadata: { profile: data.profile, matched: Boolean(match), match_kind: match?.kind ?? null },
    });

    await notifyReviewers(db, data.schoolId, {
      requestId: String(inserted.id),
      title: `Novo pedido de acesso — ${accessRequestProfileLabels[data.profile]}`,
      body: `${data.fullName} pede acesso como ${accessRequestProfileLabels[data.profile].toLowerCase()}. Verifique a identidade e decida em Acessos → Solicitações.`,
    });

    await notifyByEmail({
      to: school.email,
      schoolName: school.name,
      subject: `Novo pedido de acesso — ${accessRequestProfileLabels[data.profile]}`,
      lines: [
        `Recebeu um novo pedido de acesso ao ${getAppName()} para ${school.name}.`,
        `Perfil pedido: ${accessRequestProfileLabels[data.profile]}.`,
        "Abra Acessos → Solicitações no portal para verificar a identidade e decidir.",
      ],
    });

    // Resposta propositadamente sem indicação de correspondência: saber se um
    // B.I. + número existe na escola é, em si, informação sensível.
    return { id: inserted.id as string, status: inserted.status as AccessRequestStatus };
  });

export const actOnMyAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => requesterAccessRequestActionInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await loadSgaAdminClient();
    const { data: row, error } = await db
      .from("school_access_requests")
      .select(REQUEST_COLUMNS)
      .eq("id", data.requestId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) raise(error, "Não foi possível abrir o pedido.");
    if (!row) throw new Error("Pedido não encontrado.");
    const request = row as AccessRequestRow;

    const next = nextAccessRequestStatus(request.status, data.action);
    if (!next) {
      throw new Error(
        `Não é possível ${data.action === "cancel" ? "cancelar" : "responder a"} um pedido ${accessRequestStatusLabels[request.status].toLowerCase()}.`,
      );
    }

    const patch: TablesUpdate<"school_access_requests"> = {
      status: next,
      updated_at: new Date().toISOString(),
    };
    if (data.action === "reply") patch["requester_reply"] = data.reply;

    const { data: updated, error: updateError } = await db
      .from("school_access_requests")
      .update(patch)
      .eq("id", request.id)
      .eq("user_id", context.userId)
      .eq("status", request.status)
      .select("id, status")
      .maybeSingle();
    if (updateError) raise(updateError, "Não foi possível actualizar o pedido.");
    if (!updated) throw new Error("O pedido mudou entretanto. Actualize a página.");

    await writeAudit(db, {
      schoolId: request.school_id,
      actorId: context.userId,
      action: data.action === "cancel" ? "access_request.cancelled" : "access_request.replied",
      requestId: request.id,
      metadata: { before: { status: request.status }, after: { status: next } },
    });
    if (data.action === "reply") {
      await notifyReviewers(db, request.school_id, {
        requestId: request.id,
        title: "Resposta a pedido de acesso",
        body: `${request.full_name} respondeu ao pedido de informação. Reveja em Acessos → Solicitações.`,
      });
    }
    return { id: request.id, status: next };
  });

// ─── Secretaria / Administração ─────────────────────────────────────────────

async function requireReviewer(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem escola activa.");
  if (membership.appRole !== "Administrador" && membership.appRole !== "Secretaria") {
    throw new Error("Apenas a Administração e a Secretaria gerem pedidos de acesso.");
  }
  return membership;
}

export type SchoolAccessRequestItem = {
  id: string;
  profile: AccessRequestProfile;
  profileLabel: string;
  status: AccessRequestStatus;
  statusLabel: string;
  fullName: string;
  nationalIdMasked: string | null;
  institutionalNumber: string | null;
  contactPhone: string | null;
  message: string | null;
  requesterEmail: string | null;
  requesterEmailVerified: boolean;
  requesterReply: string | null;
  infoRequestNote: string | null;
  decisionNote: string | null;
  grantedRoleCode: string | null;
  matchedRecord: {
    personId: string;
    fullName: string;
    kind: string | null;
    alreadyLinkedToOtherAccount: boolean;
  } | null;
  createdAt: string;
  reviewedAt: string | null;
};

export const listSchoolAccessRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listSchoolAccessRequestsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const membership = await requireReviewer(context.userId);
    const db = await loadSgaAdminClient();

    let query = db
      .from("school_access_requests")
      .select(REQUEST_COLUMNS)
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status === "open") query = query.in("status", [...OPEN_ACCESS_REQUEST_STATUSES]);
    else if (data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) {
      if (isMissingTable(error)) return { available: false as const, items: [], counts: {} };
      throw publicDatabaseError(error, "Não foi possível listar os pedidos de acesso.");
    }
    const list = (rows ?? []) as AccessRequestRow[];

    const personIds = [
      ...new Set(list.map((r) => r.matched_person_id).filter(Boolean)),
    ] as string[];
    const people = new Map<string, { full_name: string; user_id: string | null }>();
    if (personIds.length) {
      const { data: peopleRows } = await db
        .from("people")
        .select("id, full_name, user_id")
        .eq("school_id", membership.schoolId)
        .in("id", personIds);
      for (const p of (peopleRows ?? []) as Array<{
        id: string;
        full_name: string;
        user_id: string | null;
      }>) {
        people.set(p.id, p);
      }
    }

    const requesters = new Map<string, { email: string | null; verified: boolean }>();
    await Promise.all(
      [...new Set(list.map((r) => r.user_id))].map(async (uid) => {
        try {
          const { data: u } = await db.auth.admin.getUserById(uid);
          requesters.set(uid, {
            email: u.user?.email ?? null,
            verified: Boolean(u.user?.email_confirmed_at),
          });
        } catch {
          requesters.set(uid, { email: null, verified: false });
        }
      }),
    );

    const { data: countRows } = await db
      .from("school_access_requests")
      .select("status")
      .eq("school_id", membership.schoolId)
      .in("status", [...OPEN_ACCESS_REQUEST_STATUSES]);
    const counts: Partial<Record<AccessRequestStatus, number>> = {};
    for (const r of (countRows ?? []) as Array<{ status: AccessRequestStatus }>) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }

    const items: SchoolAccessRequestItem[] = list.map((row) => {
      const person = row.matched_person_id ? people.get(row.matched_person_id) : undefined;
      const requester = requesters.get(row.user_id);
      return {
        id: row.id,
        profile: row.requested_profile,
        profileLabel: accessRequestProfileLabels[row.requested_profile],
        status: row.status,
        statusLabel: accessRequestStatusLabels[row.status],
        fullName: row.full_name,
        nationalIdMasked: maskIdentifier(row.national_id),
        institutionalNumber: row.institutional_number,
        contactPhone: row.contact_phone,
        message: row.message,
        requesterEmail: requester?.email ?? null,
        requesterEmailVerified: requester?.verified ?? false,
        requesterReply: row.requester_reply,
        infoRequestNote: row.info_request_note,
        decisionNote: row.decision_note,
        grantedRoleCode: row.granted_role_code,
        matchedRecord:
          row.matched_person_id && person
            ? {
                personId: row.matched_person_id,
                fullName: person.full_name,
                kind: row.match_kind,
                alreadyLinkedToOtherAccount: Boolean(
                  person.user_id && person.user_id !== row.user_id,
                ),
              }
            : null,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at,
      };
    });

    return { available: true as const, items, counts, reviewerRole: membership.appRole };
  });

/** Cria ou reactiva o vínculo e atribui o papel. Idempotente. */
async function grantMembership(db: Db, schoolId: string, userId: string, roleCodes: string[]) {
  // O papel de proprietário nunca se concede por pedido de acesso. Entre os
  // códigos equivalentes, vale a ordem de `roleCodes` (a base não garante ordem).
  const codes = grantableRoleCodes(roleCodes);
  const { data: roles, error: rolesError } = await db
    .from("roles")
    .select("id, code")
    .eq("school_id", schoolId)
    .in("code", codes.length ? codes : ["-"]);
  if (rolesError)
    throw publicDatabaseError(rolesError, "Não foi possível ler os papéis da escola.");
  const role = pickRoleByPreference(roles ?? [], codes);
  if (!role) throw new Error("O papel pedido não está configurado nesta escola.");

  const now = new Date().toISOString();
  const { data: existing } = await db
    .from("school_memberships")
    .select("id, status")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .maybeSingle();

  let membershipId: string;
  // Para desfazer se o papel falhar: um vínculo activo sem papel deixava a
  // conta dentro da escola mesmo com o pedido depois recusado.
  let undo: (() => Promise<unknown>) | null = null;
  if (existing?.id) {
    if (existing.status === "suspended") {
      throw new Error(
        "Esta conta está suspensa nesta escola. Reactive-a em Acessos, se for o caso.",
      );
    }
    membershipId = existing.id as string;
    if (existing.status !== "active") {
      const { error } = await db
        .from("school_memberships")
        .update({ status: "active", activated_at: now, updated_at: now })
        .eq("id", membershipId);
      if (error) throw publicDatabaseError(error, "Não foi possível activar o vínculo.");
      const previousStatus = existing.status;
      const id = membershipId;
      undo = async () =>
        db
          .from("school_memberships")
          .update({ status: previousStatus, updated_at: new Date().toISOString() })
          .eq("id", id);
    }
  } else {
    const { data: created, error } = await db
      .from("school_memberships")
      .insert({
        school_id: schoolId,
        user_id: userId,
        status: "active",
        activated_at: now,
        joined_at: now,
      })
      .select("id")
      .single();
    if (error || !created) throw publicDatabaseError(error, "Não foi possível criar o vínculo.");
    membershipId = created.id as string;
    const id = membershipId;
    undo = async () => db.from("school_memberships").delete().eq("id", id);
  }

  // A chave de `member_roles` é (school_id, membership_id, role_id). Com
  // "membership_id,role_id" o PostgREST recusava sempre (sem índice que bata
  // certo) e aprovar um pedido de acesso falhava depois de criar o vínculo.
  const { error: roleError } = await db
    .from("member_roles")
    .upsert(
      { school_id: schoolId, membership_id: membershipId, role_id: role.id },
      { onConflict: "school_id,membership_id,role_id", ignoreDuplicates: true },
    );
  if (roleError) {
    if (undo) await undo();
    throw publicDatabaseError(roleError, "Não foi possível atribuir o papel.");
  }

  return { membershipId, roleCode: String(role.code) };
}

export const reviewAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => reviewAccessRequestInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireReviewer(context.userId);
    const db = await loadSgaAdminClient();

    const { data: row, error } = await db
      .from("school_access_requests")
      .select(REQUEST_COLUMNS)
      .eq("id", data.requestId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (error) raise(error, "Não foi possível abrir o pedido.");
    if (!row) throw new Error("Pedido não encontrado nesta escola.");
    const request = row as AccessRequestRow;

    if (request.user_id === context.userId) {
      throw new Error("Não pode decidir o seu próprio pedido de acesso.");
    }

    const next = nextAccessRequestStatus(request.status, data.action);
    if (!next) {
      throw new Error(
        `O pedido está ${accessRequestStatusLabels[request.status].toLowerCase()} — esta acção já não se aplica.`,
      );
    }

    const now = new Date().toISOString();
    const patch: TablesUpdate<"school_access_requests"> = { status: next, updated_at: now };
    const audit: Record<string, unknown> = {
      before: { status: request.status },
      after: { status: next },
      profile: request.requested_profile,
    };
    let linkedRecord = false;

    if (data.action === "start_review") {
      patch["reviewer_id"] = context.userId;
    } else if (data.action === "request_info") {
      patch["info_request_note"] = data.note;
      patch["reviewer_id"] = context.userId;
      audit["note"] = data.note;
    } else if (data.action === "reject") {
      patch["decision_note"] = data.note;
      patch["reviewer_id"] = context.userId;
      patch["reviewed_at"] = now;
      audit["note"] = data.note;
    } else {
      const decision = canGrantRole(membership.appRole, request.requested_profile, data.role);
      if (!decision.ok) throw new Error(decision.reason);
      // Como nos convites: conceder administração ou tesouraria exige 2FA.
      if (data.role === "Administrador" || data.role === "Tesouraria") {
        requireAal2(context.claims ?? {}, `Aprovar o acesso com cargo de ${data.role}`);
      }

      const codes = mapAppRoleToSgaCodes(data.role);
      const granted = await grantMembership(db, membership.schoolId, request.user_id, codes);

      if (data.linkMatchedRecord && request.matched_person_id) {
        // Só liga um cadastro sem conta — nunca rouba o vínculo de outra conta.
        const { data: linked, error: linkError } = await db
          .from("people")
          .update({ user_id: request.user_id, updated_at: now })
          .eq("id", request.matched_person_id)
          .eq("school_id", membership.schoolId)
          .is("user_id", null)
          .select("id")
          .maybeSingle();
        if (linkError)
          throw publicDatabaseError(linkError, "Vínculo criado, mas falhou a ligação ao cadastro.");
        linkedRecord = Boolean(linked);
      }

      patch["granted_role_code"] = granted.roleCode;
      patch["membership_id"] = granted.membershipId;
      patch["reviewer_id"] = context.userId;
      patch["reviewed_at"] = now;
      patch["decision_note"] = data.note ?? null;
      audit["role"] = data.role;
      audit["role_code"] = granted.roleCode;
      audit["membership_id"] = granted.membershipId;
      audit["linked_person_id"] = linkedRecord ? request.matched_person_id : null;
    }

    const { data: updated, error: updateError } = await db
      .from("school_access_requests")
      .update(patch)
      .eq("id", request.id)
      .eq("school_id", membership.schoolId)
      .eq("status", request.status)
      .select("id, status")
      .maybeSingle();
    if (updateError) raise(updateError, "Não foi possível gravar a decisão.");
    if (!updated) throw new Error("O pedido foi alterado por outra pessoa. Actualize a lista.");

    await writeAudit(db, {
      schoolId: membership.schoolId,
      actorId: context.userId,
      action: `access_request.${data.action}`,
      requestId: request.id,
      metadata: audit,
    });

    if (data.action === "approve") {
      // Já tem vínculo: o aviso aparece no sino do painel da escola.
      const { insertInAppNotifications } = await import("@/features/academic/lesson-delivery");
      await insertInAppNotifications(db, membership.schoolId, [
        {
          userId: request.user_id,
          title: "Pedido de acesso aprovado",
          body: "O seu acesso à escola foi aprovado. Já pode usar o painel.",
          eventType: "access_request.approved",
          payload: { requestId: request.id, href: "/" },
        },
      ]).catch((notifyError) => {
        console.error("[access-requests] aviso ao requerente falhou", notifyError);
      });
    }

    let emailed = false;
    if (data.action !== "start_review") {
      const [{ data: school }, requester] = await Promise.all([
        db.from("schools").select("name").eq("id", membership.schoolId).maybeSingle(),
        db.auth.admin.getUserById(request.user_id).catch(() => null),
      ]);
      const schoolName = String(school?.name ?? getAppName());
      const lines =
        data.action === "approve"
          ? [
              `O seu pedido de acesso a ${schoolName} foi aprovado.`,
              `Entre em ${getAppUrl()} para abrir o painel da escola.`,
            ]
          : data.action === "reject"
            ? [`O seu pedido de acesso a ${schoolName} não foi aprovado.`, `Motivo: ${data.note}`]
            : [
                `A secretaria de ${schoolName} precisa de mais informações sobre o seu pedido de acesso.`,
                data.note,
                `Responda em ${getAppUrl()}.`,
              ];
      emailed = await notifyByEmail({
        to: requester?.data.user?.email,
        schoolName,
        subject: `Pedido de acesso — ${accessRequestStatusLabels[next]}`,
        lines,
      });
    }

    return { id: request.id, status: next, linkedRecord, emailed };
  });
