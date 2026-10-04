import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { spotlightCatalog } from "./catalog";
import {
  applySpotlightOverrides,
  spotlightOverridesSchema,
  type SpotlightOverrides,
} from "./schemas";
import { updateSettingsDomainValue } from "@/features/school/settings-domains";

const DOMAIN = "spotlight";

/**
 * Leitura com o cliente do utilizador — segunda fatia do ARQ-01.
 *
 * `school_settings` tem, para `authenticated`, a política `settings_select_member`
 * com `USING private.is_active_member(school_id)`: cobre esta leitura, que já
 * era filtrada pela escola da membership. Verificado na produção a 2026-09-14
 * com `npm run siga:rls-readiness`.
 *
 * A **escrita** continua com o service role, e isso é deliberado: a tabela não
 * tem política de UPDATE nenhuma, e a de INSERT exige `private.is_aal2()` — ou
 * seja, sessão com segundo factor. Migrar a escrita sem resolver isso faria
 * «Guardar destaques» falhar em silêncio, com zero linhas afectadas e sem erro.
 */
async function readOverrides(
  db: SupabaseClient<Database>,
  schoolId: string,
): Promise<SpotlightOverrides> {
  const { data, error } = await db
    .from("school_settings")
    .select("value")
    .eq("school_id", schoolId)
    .eq("domain", DOMAIN)
    .maybeSingle();
  if (error && /schema cache|does not exist|42P01|PGRST/i.test(error.message)) {
    return { items: {}, extras: [] };
  }
  if (error) throw publicDatabaseError(error, "Não foi possível ler os destaques.");
  const parsed = spotlightOverridesSchema.safeParse(data?.value ?? { items: {}, extras: [] });
  return parsed.success ? parsed.data : { items: {}, extras: [] };
}

export const listSpotlightConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return applySpotlightOverrides(spotlightCatalog, { items: {}, extras: [] });
    const overrides = await readOverrides(context.supabase, membership.schoolId);
    return applySpotlightOverrides(spotlightCatalog, overrides);
  });

export const saveSpotlightOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => spotlightOverridesSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    const db = await loadSgaAdminClient();
    await updateSettingsDomainValue(db, membership.schoolId, DOMAIN, () => data, context.userId);
    return applySpotlightOverrides(spotlightCatalog, data);
  });
