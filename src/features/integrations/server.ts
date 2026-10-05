import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import type { Json } from "@/integrations/supabase/types";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  academicIntegrationCatalog,
  isCatalogIntegrationId,
  type CatalogIntegrationId,
} from "./catalog";
import { capabilityIdsFor, installPackageFor, parseGrantedCapabilities } from "./install";
import {
  generateWebhookApiKey,
  buildRotatedWebhookConfig,
  maskGatewayWebhookKeys,
} from "./gateway-webhook-key";
import { requireAal2 } from "@/features/hr/require-aal2";
import {
  normalizeResendRecipients,
  resolveResendCredentials,
  resolveSystemSender,
  sendResendEmail,
} from "./resend-client";
import { isRateLimitBypassed } from "@/lib/rate-limit";
import { consumeRateLimit } from "@/lib/shared-rate-limit";
import {
  normalizeWhatsAppRecipients,
  resolveWhatsAppCredentials,
  sendWhatsAppCloudMessage,
} from "./whatsapp-client";
import { normalizeSmsRecipients, resolveTwilioCredentials, sendTwilioSms } from "./sms-client";

const upsertIntegrationInputSchema = z.object({
  provider: z.string().trim().min(2).max(80),
  status: z.enum(["disconnected", "configured", "connected", "error"]).default("configured"),
  merchantId: z.string().trim().max(120).optional(),
  callbackUrl: z.string().trim().max(300).optional(),
  sandbox: z.boolean().default(true),
});

const installIntegrationInputSchema = z.object({
  provider: z.string().trim().min(2).max(80),
  capabilityIds: z.array(z.string().trim().min(2).max(80)).max(20).optional(),
});

const revokeIntegrationInputSchema = z.object({
  provider: z.string().trim().min(2).max(80),
});

const rotateGatewayWebhookKeyInputSchema = z.object({
  provider: z.enum(["multicaixa_express", "unitel_money"]),
});

const sendSchoolResendEmailInputSchema = z.object({
  to: z.array(z.string().email()).min(1).max(50).optional(),
  subject: z.string().trim().min(2).max(200),
  text: z.string().trim().min(1).max(8000),
});

// Com a chave da plataforma, uma escola criada pelo registo público podia
// enviar para qualquer endereço, com o remetente que quisesse: um canal de
// phishing com a reputação do domínio SIGA. Limite por escola e por hora.
const PLATFORM_EMAIL_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 20 };

const sendSchoolWhatsAppInputSchema = z.object({
  to: z.array(z.string().trim().min(6).max(32)).min(1).max(50).optional(),
  text: z.string().trim().min(1).max(4096),
});

const sendSchoolSmsInputSchema = z.object({
  to: z.array(z.string().trim().min(6).max(32)).min(1).max(50).optional(),
  text: z.string().trim().min(1).max(1600),
});

type IntegrationConfig = { [key: string]: Json | undefined };

function readJsonObject(value: unknown): IntegrationConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as IntegrationConfig;
}

function integrationPublicRow(
  item: (typeof academicIntegrationCatalog)[number],
  stored?: { status?: string | null; config?: unknown; updated_at?: string | null },
) {
  const config = readJsonObject(stored?.config);
  return {
    ...item,
    status: stored?.status ?? "disconnected",
    config,
    grantedCapabilities: parseGrantedCapabilities(config),
    updatedAt: stored?.updated_at ?? null,
  };
}

/** Gateways de pagamento: o comerciante decide para onde vai o dinheiro e a
 * chave do webhook emite recibos — mexer neles exige 2FA, como o IBAN. */
const PAYMENT_PROVIDERS = new Set(["multicaixa_express", "unitel_money"]);

export type SchoolIntegrationSummary = ReturnType<typeof integrationPublicRow>;

export const listSchoolIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    try {
      const { data, error } = await db
        .from("school_integrations")
        .select("provider, status, config, updated_at")
        .eq("school_id", membership.schoolId);
      if (error) throw error;
      // A API key do gateway emite recibos (POST /api/finance/gateway/confirm):
      // só sai em claro para uma sessão com 2FA, como o resto do dinheiro.
      const revealKeys = context.claims?.["aal"] === "aal2";
      const byProvider = new Map(
        (data ?? []).map((row) => [
          row.provider,
          { ...row, config: maskGatewayWebhookKeys(row.config, revealKeys) },
        ]),
      );
      return academicIntegrationCatalog.map((item) =>
        integrationPublicRow(item, byProvider.get(item.id)),
      );
    } catch {
      return academicIntegrationCatalog.map((item) => integrationPublicRow(item));
    }
  });

export const listInstalledCapabilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) {
      return academicIntegrationCatalog.map((item) => ({
        id: item.id,
        status: "disconnected" as const,
        grantedCapabilities: [] as string[],
      }));
    }
    const db = await loadSgaAdminClient();
    try {
      const { data, error } = await db
        .from("school_integrations")
        .select("provider, status, config")
        .eq("school_id", membership.schoolId);
      if (error) throw error;
      const byProvider = new Map((data ?? []).map((row) => [row.provider, row]));
      return academicIntegrationCatalog.map((item) => {
        const stored = byProvider.get(item.id);
        return {
          id: item.id,
          status: stored?.status ?? "disconnected",
          grantedCapabilities: parseGrantedCapabilities(readJsonObject(stored?.config)),
        };
      });
    } catch {
      return academicIntegrationCatalog.map((item) => ({
        id: item.id,
        status: "disconnected" as const,
        grantedCapabilities: [] as string[],
      }));
    }
  });

export const upsertSchoolIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => upsertIntegrationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    if (!isCatalogIntegrationId(data.provider)) {
      throw new Error("Integração desconhecida no catálogo SIGA.");
    }
    if (PAYMENT_PROVIDERS.has(data.provider)) {
      requireAal2(context.claims ?? {}, "Configurar um gateway de pagamentos");
    }
    const db = await loadSgaAdminClient();
    const existing = await readIntegrationConfig(db, membership.schoolId, data.provider);
    const previousMerchant = String(existing["merchantId"] ?? "");
    const nextMerchant = String(data.merchantId ?? existing["merchantId"] ?? "");
    if (PAYMENT_PROVIDERS.has(data.provider) && nextMerchant !== previousMerchant) {
      const { error: auditError } = await db.from("audit_logs").insert({
        school_id: membership.schoolId,
        actor_user_id: context.userId,
        action: "integration.payment_merchant.changed",
        entity_type: "school_integration",
        entity_id: null,
        metadata: { provider: data.provider, before: previousMerchant, after: nextMerchant },
      });
      if (auditError) {
        throw publicDatabaseError(
          auditError,
          "Não foi possível registar a alteração na auditoria.",
        );
      }
    }
    const { error } = await db.from("school_integrations").upsert(
      {
        school_id: membership.schoolId,
        provider: data.provider,
        status: data.status,
        config: {
          ...existing,
          merchantId: data.merchantId ?? existing["merchantId"] ?? "",
          callbackUrl: data.callbackUrl ?? existing["callbackUrl"] ?? "",
          sandbox: data.sandbox,
        },
        updated_by: context.userId,
        created_by: context.userId,
      },
      { onConflict: "school_id,provider" },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível guardar a integração.");
    return { ok: true };
  });

export const installSchoolIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => installIntegrationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    if (!isCatalogIntegrationId(data.provider)) {
      throw new Error("Integração desconhecida no catálogo SIGA.");
    }
    if (PAYMENT_PROVIDERS.has(data.provider)) {
      requireAal2(context.claims ?? {}, "Instalar um gateway de pagamentos");
    }
    const pack = installPackageFor(data.provider);
    if (!pack) throw new Error("Pacote de instalação em falta.");
    const allowed = new Set(capabilityIdsFor(data.provider));
    const selected = (data.capabilityIds?.length ? data.capabilityIds : [...allowed]).filter((id) =>
      allowed.has(id),
    );
    if (!selected.length) throw new Error("Seleccione pelo menos uma função para instalar.");
    const db = await loadSgaAdminClient();
    const existing = await readIntegrationConfig(db, membership.schoolId, data.provider);
    const webhookApiKey =
      typeof existing["webhookApiKey"] === "string" && existing["webhookApiKey"].trim()
        ? existing["webhookApiKey"]
        : generateWebhookApiKey();
    const { error } = await db.from("school_integrations").upsert(
      {
        school_id: membership.schoolId,
        provider: data.provider,
        status: "configured",
        config: {
          ...existing,
          grantedCapabilities: selected,
          installedAt: new Date().toISOString(),
          sandbox: existing["sandbox"] ?? true,
          ...(data.provider === "multicaixa_express" || data.provider === "unitel_money"
            ? { webhookApiKey }
            : {}),
        },
        updated_by: context.userId,
        created_by: context.userId,
      },
      { onConflict: "school_id,provider" },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível instalar a integração.");
    return { ok: true, grantedCapabilities: selected };
  });

export const revokeSchoolIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => revokeIntegrationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    if (!isCatalogIntegrationId(data.provider)) {
      throw new Error("Integração desconhecida no catálogo SIGA.");
    }
    const db = await loadSgaAdminClient();
    const existing = await readIntegrationConfig(db, membership.schoolId, data.provider);
    const { error } = await db.from("school_integrations").upsert(
      {
        school_id: membership.schoolId,
        provider: data.provider,
        status: "disconnected",
        config: {
          ...existing,
          grantedCapabilities: [],
          installedAt: null,
        },
        updated_by: context.userId,
        created_by: context.userId,
      },
      { onConflict: "school_id,provider" },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível desinstalar a integração.");
    return { ok: true };
  });

export const rotateGatewayWebhookApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => rotateGatewayWebhookKeyInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    requireAal2(context.claims ?? {}, "Gerar a API key do gateway de pagamentos");
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    const existing = await readIntegrationConfig(db, membership.schoolId, data.provider);
    const { data: row } = await db
      .from("school_integrations")
      .select("status")
      .eq("school_id", membership.schoolId)
      .eq("provider", data.provider)
      .maybeSingle();
    const rotated = buildRotatedWebhookConfig(existing);
    const { error } = await db.from("school_integrations").upsert(
      {
        school_id: membership.schoolId,
        provider: data.provider,
        status: row?.status ?? "configured",
        config: rotated.config,
        updated_by: context.userId,
        created_by: context.userId,
      },
      { onConflict: "school_id,provider" },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível rotacionar a API key.");
    return {
      ok: true as const,
      webhookApiKey: rotated.webhookApiKey,
      previousKeyValidUntil: rotated.previousKeyValidUntil,
    };
  });

/**
 * Envio HTTP Resend com API key da escola (Integrações → merchantId).
 * Sem key ou sem destinatários resolvíveis → mode "clipboard" (caller copia).
 */
async function withoutOptedOutPhones(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  recipients: string[],
): Promise<string[]> {
  const { data: optedOut } = await db
    .from("user_communication_preferences")
    .select("user_id")
    .eq("school_id", schoolId)
    .eq("announcements_enabled", false);
  const userIds = (optedOut ?? []).map((row) => String(row.user_id));
  if (!userIds.length) return recipients;
  const { data: people } = await db
    .from("people")
    .select("phone")
    .eq("school_id", schoolId)
    .in("user_id", userIds);
  // Últimos 9 dígitos: o mesmo número em formato WhatsApp (dígitos) ou SMS (+E164).
  const blocked = new Set((people ?? []).map((row) => phoneKey(String(row.phone ?? ""))));
  return recipients.filter((phone) => !blocked.has(phoneKey(phone)));
}

const phoneKey = (phone: string) => phone.replace(/\D/g, "").slice(-9);

/**
 * Com credenciais da plataforma (SMS Twilio, token WhatsApp do SIGA), só se envia
 * para números registados nesta escola: sem isto, uma escola criada pelo registo
 * público mandava mensagens pagas pela plataforma a qualquer número.
 */
async function onlySchoolPhones(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  recipients: string[],
): Promise<string[]> {
  const { data: people } = await db
    .from("people")
    .select("phone")
    .eq("school_id", schoolId)
    .not("phone", "is", null)
    .limit(20000);
  const known = new Set(
    (people ?? [])
      .map((row) => phoneKey(String(row.phone ?? "")))
      .filter((key) => key.length === 9),
  );
  return recipients.filter((phone) => known.has(phoneKey(phone)));
}

/** Limite por escola e por hora, partilhado entre instâncias do Worker. */
async function platformQuotaOk(key: string) {
  if (isRateLimitBypassed(key)) return true;
  return consumeRateLimit([key], PLATFORM_EMAIL_RATE_LIMIT);
}

async function withoutOptedOutRecipients(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  recipients: string[],
): Promise<string[]> {
  const { data: optedOut } = await db
    .from("user_communication_preferences")
    .select("user_id")
    .eq("school_id", schoolId)
    .eq("announcements_enabled", false);
  const userIds = (optedOut ?? []).map((row) => String(row.user_id));
  if (!userIds.length) return recipients;
  const { data: people } = await db
    .from("people")
    .select("email")
    .eq("school_id", schoolId)
    .in("user_id", userIds);
  const blocked = new Set((people ?? []).map((row) => String(row.email ?? "").toLowerCase()));
  return recipients.filter((email) => !blocked.has(email.toLowerCase()));
}

export const sendSchoolResendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sendSchoolResendEmailInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    let row: { status?: string | null; config?: unknown } | null = null;
    try {
      const { data: stored, error } = await db
        .from("school_integrations")
        .select("status, config")
        .eq("school_id", membership.schoolId)
        .eq("provider", "resend_email")
        .maybeSingle();
      if (error) throw error;
      row = stored;
    } catch {
      return {
        mode: "clipboard" as const,
        reason: "Tabela school_integrations em falta — aplique APPLY_ENROLLMENT_AND_PREMIUM.sql.",
      };
    }

    const config = readJsonObject(row?.config);
    const granted = parseGrantedCapabilities(config);
    const connected =
      row?.status === "connected" ||
      row?.status === "configured" ||
      granted.includes("resend.send");
    if (!connected) {
      return { mode: "clipboard" as const, reason: "Resend não instalado nesta escola." };
    }

    const credentials = resolveResendCredentials(config, process.env.RESEND_API_KEY);
    const ownKey = String(config.merchantId ?? config.apiKey ?? config.webhookApiKey ?? "").trim();
    const usingPlatformKey = !ownKey;
    if (!credentials) {
      return {
        mode: "clipboard" as const,
        reason: "Configure a API key Resend em Definições → Integrações (campo merchant).",
      };
    }

    let recipients = normalizeResendRecipients(data.to ?? []);
    if (!recipients.length) {
      recipients = await listSchoolStaffEmails(db, membership.schoolId);
    }
    if (!recipients.length) {
      return {
        mode: "clipboard" as const,
        reason: "Sem destinatários: indique e-mails ou cadastre e-mails na equipa.",
      };
    }

    // Quem desligou os comunicados nesta escola não os recebe por e-mail.
    recipients = await withoutOptedOutRecipients(db, membership.schoolId, recipients);
    if (!recipients.length) {
      return {
        mode: "clipboard" as const,
        reason: "Todos os destinatários desligaram os comunicados por e-mail.",
      };
    }

    let from = credentials.from;
    if (usingPlatformKey) {
      if (!(await platformQuotaOk(`platform_email:${membership.schoolId}`))) {
        return {
          mode: "clipboard" as const,
          reason: "Limite de envios por hora atingido. Configure uma chave Resend própria.",
        };
      }
      // Só para contactos desta escola, e com o remetente do sistema.
      const { data: known } = await db
        .from("people")
        .select("email")
        .eq("school_id", membership.schoolId)
        .in("email", recipients);
      const allowed = new Set((known ?? []).map((row) => String(row.email ?? "").toLowerCase()));
      recipients = recipients.filter((email) => allowed.has(email));
      if (!recipients.length) {
        return {
          mode: "clipboard" as const,
          reason: "Sem destinatários desta escola com e-mail registado.",
        };
      }
      const { data: school } = await db
        .from("schools")
        .select("name")
        .eq("id", membership.schoolId)
        .maybeSingle();
      from = resolveSystemSender("academic", { schoolName: school?.name ?? null });
    }

    const html = `<pre style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(data.text)}</pre>`;

    try {
      const result = await sendResendEmail({
        apiKey: credentials.apiKey,
        from,
        to: recipients,
        subject: data.subject,
        text: data.text,
        html,
      });
      return {
        mode: "sent" as const,
        id: result.id,
        recipientCount: recipients.length,
      };
    } catch (error) {
      return {
        mode: "clipboard" as const,
        reason: error instanceof Error ? error.message : "Falha no envio Resend.",
      };
    }
  });

/**
 * Envio HTTP WhatsApp Cloud API.
 * merchantId = Phone Number ID; callbackUrl (não-URL) ou WHATSAPP_ACCESS_TOKEN = token.
 * Sem credenciais → mode "deeplink" (caller abre wa.me).
 */
export const sendSchoolWhatsAppMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sendSchoolWhatsAppInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    let row: { status?: string | null; config?: unknown } | null = null;
    try {
      const { data: stored, error } = await db
        .from("school_integrations")
        .select("status, config")
        .eq("school_id", membership.schoolId)
        .eq("provider", "whatsapp_business")
        .maybeSingle();
      if (error) throw error;
      row = stored;
    } catch {
      return {
        mode: "deeplink" as const,
        reason: "Tabela school_integrations em falta — aplique APPLY_ENROLLMENT_AND_PREMIUM.sql.",
      };
    }

    const config = readJsonObject(row?.config);
    const granted = parseGrantedCapabilities(config);
    const connected =
      row?.status === "connected" ||
      row?.status === "configured" ||
      granted.includes("whatsapp.notices");
    if (!connected) {
      return { mode: "deeplink" as const, reason: "WhatsApp Business não instalado nesta escola." };
    }

    const credentials = resolveWhatsAppCredentials(
      config,
      process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.WHATSAPP_CLOUD_TOKEN,
    );
    if (!credentials) {
      return {
        mode: "deeplink" as const,
        reason:
          "Configure Phone Number ID (merchant) e Access Token (callback) em Definições → Integrações.",
      };
    }

    const ownToken = String(
      config.accessToken ?? config.apiKey ?? config.webhookApiKey ?? config.callbackUrl ?? "",
    ).trim();
    const usingPlatformToken = !ownToken || /^https?:\/\//i.test(ownToken);
    if (usingPlatformToken) {
      if (!(await platformQuotaOk(`platform_whatsapp:${membership.schoolId}`))) {
        return {
          mode: "deeplink" as const,
          reason: "Limite de envios por hora atingido. Configure um token WhatsApp próprio.",
        };
      }
    }

    let recipients = normalizeWhatsAppRecipients(data.to ?? []);
    if (!recipients.length) {
      recipients = await listSchoolStaffPhones(db, membership.schoolId);
    }
    if (!recipients.length) {
      return {
        mode: "deeplink" as const,
        reason: "Sem destinatários: indique telemóveis ou cadastre phones na equipa.",
      };
    }
    if (usingPlatformToken) {
      recipients = await onlySchoolPhones(db, membership.schoolId, recipients);
      if (!recipients.length) {
        return {
          mode: "deeplink" as const,
          reason: "Sem destinatários desta escola com telemóvel registado.",
        };
      }
    }
    // Quem desligou os comunicados nesta escola não os recebe por WhatsApp.
    recipients = await withoutOptedOutPhones(db, membership.schoolId, recipients);
    if (!recipients.length) {
      return {
        mode: "deeplink" as const,
        reason: "Todos os destinatários desligaram os comunicados.",
      };
    }

    let sent = 0;
    const errors: string[] = [];
    for (const to of recipients) {
      try {
        await sendWhatsAppCloudMessage({
          accessToken: credentials.accessToken,
          phoneNumberId: credentials.phoneNumberId,
          toE164Digits: to,
          text: data.text,
        });
        sent += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Falha WhatsApp");
      }
    }

    if (sent === 0) {
      return {
        mode: "deeplink" as const,
        reason: errors[0] || "Falha no envio WhatsApp Cloud API.",
      };
    }
    return {
      mode: "sent" as const,
      recipientCount: sent,
      partialErrors: errors.length ? errors.slice(0, 3) : undefined,
    };
  });

/**
 * Envio HTTP SMS via Twilio. Credenciais globais (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/
 * TWILIO_FROM_NUMBER), não por escola -- não há UI de configuração de SMS em
 * Definições → Integrações, ao contrário do WhatsApp Business. Sem credenciais →
 * mode "unavailable" (caller decide o que fazer, ex. copiar texto para a área de
 * transferência).
 */
export const sendSchoolSmsMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sendSchoolSmsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const credentials = resolveTwilioCredentials();
    if (!credentials) {
      return {
        mode: "unavailable" as const,
        reason: "Twilio não está configurado no servidor (faltam variáveis de ambiente).",
      };
    }

    let recipients = normalizeSmsRecipients(data.to ?? []);
    if (!recipients.length) {
      recipients = await listSchoolStaffPhones(db, membership.schoolId);
    }
    if (!recipients.length) {
      return {
        mode: "unavailable" as const,
        reason: "Sem destinatários: indique telemóveis ou cadastre phones na equipa.",
      };
    }
    // A conta Twilio é da plataforma (paga por SMS): só números desta escola,
    // sem quem desligou os comunicados, e com limite por hora.
    recipients = await onlySchoolPhones(db, membership.schoolId, recipients);
    recipients = await withoutOptedOutPhones(db, membership.schoolId, recipients);
    if (!recipients.length) {
      return {
        mode: "unavailable" as const,
        reason:
          "Sem destinatários desta escola com telemóvel registado (ou desligaram os comunicados).",
      };
    }
    if (!(await platformQuotaOk(`platform_sms:${membership.schoolId}`))) {
      return {
        mode: "unavailable" as const,
        reason: "Limite de envios de SMS por hora atingido.",
      };
    }

    let sent = 0;
    const errors: string[] = [];
    for (const to of recipients) {
      try {
        await sendTwilioSms({
          accountSid: credentials.accountSid,
          authToken: credentials.authToken,
          fromNumber: credentials.fromNumber,
          toE164: to,
          text: data.text,
        });
        sent += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Falha SMS");
      }
    }

    if (sent === 0) {
      return {
        mode: "unavailable" as const,
        reason: errors[0] || "Falha no envio SMS via Twilio.",
      };
    }
    return {
      mode: "sent" as const,
      recipientCount: sent,
      partialErrors: errors.length ? errors.slice(0, 3) : undefined,
    };
  });

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function listSchoolStaffEmails(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
): Promise<string[]> {
  try {
    const { data: memberships, error } = await db
      .from("school_memberships")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .limit(80);
    if (error || !memberships?.length) return [];
    const userIds = memberships.map((row) => row.user_id).filter(Boolean);
    if (!userIds.length) return [];
    const { data: profiles } = await db
      // `profiles` não tem coluna `email` — o e-mail vive em `people` (e em
      // `auth.users`). Com `email` no select, o PostgREST recusava a consulta
      // inteira e o resultado vinha vazio, indistinguível de «não há contactos».
      .from("people")
      .select("email")
      .in("user_id", userIds)
      .limit(80);
    return normalizeResendRecipients((profiles ?? []).map((row) => String(row.email ?? "")));
  } catch {
    return [];
  }
}

async function listSchoolStaffPhones(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
): Promise<string[]> {
  try {
    const { data: memberships, error } = await db
      .from("school_memberships")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .limit(80);
    if (error || !memberships?.length) return [];
    const userIds = memberships.map((row) => row.user_id).filter(Boolean);
    if (!userIds.length) return [];
    const { data: profiles } = await db
      .from("profiles")
      .select("phone")
      .in("id", userIds)
      .limit(80);
    return normalizeWhatsAppRecipients(
      (profiles ?? []).map((row) => String((row as { phone?: string | null }).phone ?? "")),
    );
  } catch {
    return [];
  }
}

async function readIntegrationConfig(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  provider: CatalogIntegrationId,
) {
  try {
    const { data } = await db
      .from("school_integrations")
      .select("config")
      .eq("school_id", schoolId)
      .eq("provider", provider)
      .maybeSingle();
    return readJsonObject(data?.config);
  } catch {
    return {};
  }
}
