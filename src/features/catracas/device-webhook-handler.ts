import type { z } from "zod";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { validateGatePassDeviceInputSchema } from "./schemas";
import { gatePassLookupTokens } from "./gate-pass-token";
import { evaluateGatePassAccess, resolveGatePassDeviceByApiKey } from "./gate-pass-validation";
import { consumeRateLimit } from "@/lib/shared-rate-limit";
import { isRateLimitBypassed } from "@/lib/rate-limit";

export type DeviceGatePassWebhookResult = Awaited<ReturnType<typeof evaluateGatePassAccess>> & {
  rateLimited?: boolean;
};

/** Chaves erradas a partir do mesmo IP: trava quem tenta adivinhar a API key. */
export const DEVICE_BAD_KEY_LIMIT = { windowMs: 15 * 60 * 1000, max: 20 };
/**
 * Leituras por dispositivo. Uma catraca não passa mais de ~1 pessoa por segundo;
 * acima disto é alguém a percorrer números de cartão com uma key roubada (a
 * resposta traz nome e fotografia do aluno).
 */
export const DEVICE_SCAN_LIMIT = { windowMs: 60 * 1000, max: 120 };

export type DeviceGatePassWebhookInput = z.infer<typeof validateGatePassDeviceInputSchema>;

/** Validação partilhada entre serverFn e rota HTTP `/api/catracas/device-scan`. */
export async function runDeviceGatePassWebhook(
  data: DeviceGatePassWebhookInput,
  requestIp = "unknown",
): Promise<DeviceGatePassWebhookResult> {
  const db = await loadSgaAdminClient();
  const tokens = gatePassLookupTokens(data.token);
  if (tokens.length === 0) {
    return { granted: false, reason: "Token ou código inválido." };
  }

  const resolved = await resolveGatePassDeviceByApiKey(db, data.apiKey);
  if (!resolved) {
    const ipKey = `catraca_badkey:${requestIp}`;
    if (!isRateLimitBypassed(ipKey) && !(await consumeRateLimit([ipKey], DEVICE_BAD_KEY_LIMIT))) {
      return {
        granted: false,
        reason: "Demasiadas tentativas. Tente mais tarde.",
        rateLimited: true,
      };
    }
    return { granted: false, reason: "API key de dispositivo inválida." };
  }

  const deviceKey = `catraca_scan:${resolved.deviceId ?? resolved.schoolId}`;
  if (
    !isRateLimitBypassed(deviceKey) &&
    !(await consumeRateLimit([deviceKey], DEVICE_SCAN_LIMIT))
  ) {
    return { granted: false, reason: "Demasiadas leituras neste dispositivo.", rateLimited: true };
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
