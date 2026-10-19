/**
 * Configuração de cobrança da plataforma (`saas_billing_settings`, linha única).
 *
 * Tabela só do servidor (FORCE RLS, sem permissões para anon/authenticated):
 * estas funções recebem o cliente de serviço de quem as chama — o painel da
 * escola, a resolução do tenant, o ciclo comercial ou o ADMIN — e não abrem
 * um cliente próprio.
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import type { Json } from "@/integrations/supabase/types";
import {
  DEFAULT_BILLING,
  billingSettingsToRow,
  normalizeBillingSettings,
  type BillingSettings,
} from "./billing-periods";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/** Lida em cada resolução de tenant: 60 s em memória chegam (muda raramente). */
const CACHE_MS = 60_000;
let cache: { value: BillingSettings; at: number } | null = null;

export function clearBillingSettingsCache() {
  cache = null;
}

/**
 * Lê a configuração. Qualquer falha devolve o padrão (cobrança ligada): nunca
 * se deixa de cobrar por um erro de leitura, nem se bloqueia uma escola por ele
 * — o bloqueio por falta de pagamento depende também do estado da escola.
 */
export async function readBillingSettings(db: Db): Promise<BillingSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const { data, error } = await db
      .from("saas_billing_settings")
      .select("charging_enabled, trial_days, periods, notice")
      .eq("id", 1)
      .maybeSingle();
    if (error) return DEFAULT_BILLING;
    const value = normalizeBillingSettings(data);
    cache = { value, at: Date.now() };
    return value;
  } catch {
    return DEFAULT_BILLING;
  }
}

/** Grava a configuração (ADMIN) e regista quem mudou o quê. */
export async function writeBillingSettings(
  db: Db,
  input: { settings: BillingSettings; userId: string },
): Promise<BillingSettings> {
  const before = await readBillingSettings(db);
  const settings = normalizeBillingSettings(billingSettingsToRow(input.settings));
  const row = billingSettingsToRow(settings);
  const { error } = await db.from("saas_billing_settings").upsert(
    {
      id: 1,
      ...row,
      periods: row.periods as unknown as Json,
      updated_by: input.userId,
    },
    { onConflict: "id" },
  );
  if (error) throw publicDatabaseError(error, "Não foi possível guardar a configuração.");
  clearBillingSettingsCache();
  await db.from("saas_audit_logs").insert({
    user_id: input.userId,
    action: "billing_settings_updated",
    entity: "saas_billing_settings",
    entity_id: null,
    metadata: {
      charging_enabled: { from: before.chargingEnabled, to: settings.chargingEnabled },
      trial_days: { from: before.trialDays, to: settings.trialDays },
      periods: row.periods,
      notice: settings.notice,
    } as Json,
  });
  return settings;
}

/**
 * A escola não paga agora: isenta pela equipa ou cobrança desligada para
 * todas. Não apaga planos nem períodos — ao voltar a cobrar, tudo segue.
 */
export function isBillingWaived(
  tenant: { billing_exempt?: boolean | null } | null | undefined,
  settings: Pick<BillingSettings, "chargingEnabled">,
): boolean {
  return !settings.chargingEnabled || tenant?.billing_exempt === true;
}
