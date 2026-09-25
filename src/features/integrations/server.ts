import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import type { Json } from "@/integrations/supabase/types";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  academicIntegrationCatalog,
  isCatalogIntegrationId,
  type CatalogIntegrationId,
} from "./catalog";
import { capabilityIdsFor, installPackageFor, parseGrantedCapabilities } from "./install";
import { isPendingWorkspaceProvider } from "./google-workspace-availability";
import { projectIntegrationConfig } from "./public-config";
import { generateWebhookApiKey, buildRotatedWebhookConfig } from "./gateway-webhook-key";
import {
  normalizeResendRecipients,
  resolveResendCredentials,
  sendResendEmail,
} from "./resend-client";
import {
  normalizeWhatsAppRecipients,
  resolveWhatsAppCredentials,
  sendWhatsAppCloudMessage,
} from "./whatsapp-client";

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
  html: z.string().trim().max(20_000).optional(),
});

const sendSchoolWhatsAppInputSchema = z.object({
  to: z.array(z.string().trim().min(6).max(32)).min(1).max(50).optional(),
  text: z.string().trim().min(1).max(4096),
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
  const pending = isPendingWorkspaceProvider(item.id);
  const rawConfig = readJsonObject(stored?.config);
  const projection = pending
    ? projectIntegrationConfig(item.id, {})
    : projectIntegrationConfig(item.id, rawConfig);
  return {
    ...item,
    // A configured merchant ID is not proof of Google OAuth consent.
    status: pending ? "disconnected" : stored?.status ?? "disconnected",
    config: projection.config,
    hasStoredSecret: projection.hasStoredSecret,
    grantedCapabilities: pending ? [] : parseGrantedCapabilities(rawConfig),
    updatedAt: stored?.updated_at ?? null,
  };
}

export type SchoolIntegrationSummary = ReturnType<typeof integrationPublicRow>;

export const listSchoolIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    const db = await loadSgaAdminClient();
    try {
      const { data, error } = await db
        .from("school_integrations")
        .select("provider, status, config, updated_at")
        .eq("school_id", membership.schoolId);
      if (error) throw error;
      const byProvider = new Map((data ?? []).map((row) => [row.provider, row]));
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
          status: isPendingWorkspaceProvider(item.id) ? "disconnected" : stored?.status ?? "disconnected",
          grantedCapabilities: isPendingWorkspaceProvider(item.id)
            ? []
            : parseGrantedCapabilities(readJsonObject(stored?.config)),
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
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    if (!isCatalogIntegrationId(data.provider)) {
      throw new Error("Integração desconhecida no catálogo SIGA.");
    }
    if (isPendingWorkspaceProvider(data.provider)) {
      throw new Error(
        "Google Workspace requer autorização independente e cofre seguro de tokens. Ligação indisponível.",
      );
    }
    const db = await loadSgaAdminClient();
    const existing = await readIntegrationConfig(db, membership.schoolId, data.provider);
    const { error } = await db.from("school_integrations").upsert(
      {
        school_id: membership.schoolId,
        provider: data.provider,
        status: data.status,
        config: {
          ...existing,
          // A redacted blank form field means preserve the existing server secret.
          merchantId: data.merchantId?.trim() || existing["merchantId"] || "",
          callbackUrl: data.callbackUrl?.trim() || existing["callbackUrl"] || "",
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
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    if (!isCatalogIntegrationId(data.provider)) {
      throw new Error("Integração desconhecida no catálogo SIGA.");
    }
    if (isPendingWorkspaceProvider(data.provider)) {
      throw new Error(
        "Google Workspace requer autorização independente e cofre seguro de tokens. Ligação indisponível.",
      );
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
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
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
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
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
export const sendSchoolResendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sendSchoolResendEmailInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
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

    const html =
      data.html ??
      `<pre style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(data.text)}</pre>`;

    try {
      const result = await sendResendEmail({
        apiKey: credentials.apiKey,
        from: credentials.from,
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
    const membership = await requireSgaWriter(context.supabase, context.userId, [
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
