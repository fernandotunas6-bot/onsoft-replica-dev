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
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    if (!isCatalogIntegrationId(data.provider)) {
      throw new Error("Integração desconhecida no catálogo SIGA.");
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
