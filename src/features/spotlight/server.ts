import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { spotlightCatalog } from "./catalog";
import {
  applySpotlightOverrides,
  spotlightOverridesSchema,
  type SpotlightOverrides,
} from "./schemas";

const DOMAIN = "spotlight";

async function readOverrides(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
): Promise<SpotlightOverrides> {
  const { data, error } = await db
    .from("school_settings")
    .select("value")
    .eq("school_id", schoolId)
    .eq("domain", DOMAIN)
    .maybeSingle();
  if (error && /schema cache|does not exist|42P01|PGRST/i.test(error.message)) {
    return { items: {} };
  }
  if (error) throw publicDatabaseError(error, "Não foi possível ler os destaques.");
  const parsed = spotlightOverridesSchema.safeParse(data?.value ?? { items: {} });
  return parsed.success ? parsed.data : { items: {} };
}

export const listSpotlightConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return applySpotlightOverrides(spotlightCatalog, { items: {} });
    const db = await loadSgaAdminClient();
    const overrides = await readOverrides(db, membership.schoolId);
    return applySpotlightOverrides(spotlightCatalog, overrides);
  });

export const saveSpotlightOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => spotlightOverridesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    const db = await loadSgaAdminClient();
    const existing = await db
      .from("school_settings")
      .select("id, version")
      .eq("school_id", membership.schoolId)
      .eq("domain", DOMAIN)
      .maybeSingle();
    if (existing.error && /schema cache|does not exist|42P01|PGRST/i.test(existing.error.message)) {
      throw new Error("Não foi possível guardar. Aplique APPLY_IN_SQL_EDITOR.sql (school_settings).");
    }
    if (existing.data?.id) {
      const { error } = await db
        .from("school_settings")
        .update({
          value: data,
          version: Number(existing.data.version ?? 1) + 1,
          changed_by: context.userId,
        })
        .eq("id", existing.data.id);
      if (error) throw publicDatabaseError(error, "Não foi possível guardar os destaques.");
    } else {
      const { error } = await db.from("school_settings").insert({
        school_id: membership.schoolId,
        domain: DOMAIN,
        version: 1,
        value: data,
        changed_by: context.userId,
      });
      if (error) throw publicDatabaseError(error, "Não foi possível criar os destaques.");
    }
    return applySpotlightOverrides(spotlightCatalog, data);
  });
