import type { z } from "zod";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { validateGatePassDeviceInputSchema } from "./schemas";
import { gatePassLookupTokens } from "./gate-pass-token";
import { evaluateGatePassAccess, resolveGatePassDeviceByApiKey } from "./gate-pass-validation";

export type DeviceGatePassWebhookInput = z.infer<typeof validateGatePassDeviceInputSchema>;

/** Validação partilhada entre serverFn e rota HTTP `/api/catracas/device-scan`. */
export async function runDeviceGatePassWebhook(data: DeviceGatePassWebhookInput) {
  const db = await loadSgaAdminClient();
  const tokens = gatePassLookupTokens(data.token);
  if (tokens.length === 0) {
    return { granted: false, reason: "Token ou código inválido." };
  }

  const resolved = await resolveGatePassDeviceByApiKey(db, data.apiKey);
  if (!resolved) {
    return { granted: false, reason: "API key de dispositivo inválida." };
  }

  const result = await evaluateGatePassAccess(
    db,
    resolved.schoolId,
    tokens,
    data.direction,
    resolved,
  );

  if (resolved.deviceId) {
    await db
      .from("siga_turnstile_devices")
      .update({ last_ping_at: new Date().toISOString(), status: "online" })
      .eq("id", resolved.deviceId);
  }

  return result;
}
