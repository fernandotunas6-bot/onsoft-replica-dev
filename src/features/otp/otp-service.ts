import { createHmac, randomInt } from "crypto";
import { OtpChannel, OtpPurpose, VerificationSession } from "./contracts";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

export class OtpService {
  private static getPepper(): string {
    return (
      (typeof process !== "undefined" && process.env?.OTP_PEPPER_SECRET?.trim()) ||
      "siga-plus-core-otp-secret-pepper-2026"
    );
  }

  /**
   * Gera código estritamente numérico de 6 dígitos com gerador criptograficamente seguro (CSPRNG).
   */
  public static generateCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Gera hash seguro do código de 6 dígitos utilizando HMAC-SHA256.
   * Garante que o código nunca fica em texto limpo no banco.
   */
  public static hashCode(code: string, identifier?: string): string {
    const raw = identifier ? `${identifier.trim().toLowerCase()}:${code.trim()}` : code.trim();
    return createHmac("sha256", this.getPepper()).update(raw).digest("hex");
  }

  /**
   * Normaliza o identificador de destino (e-mail ou número de telefone).
   * Para números de Angola, garante prefixo internacional +244 se tiver 9 dígitos.
   */
  public static normalizeIdentifier(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.includes("@")) {
      return trimmed.toLowerCase();
    }
    // Remove espaços, traços e parênteses
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length === 9 && (digits.startsWith("9") || digits.startsWith("2"))) {
      return `+244${digits}`;
    }
    if (digits.length === 12 && digits.startsWith("244")) {
      return `+${digits}`;
    }
    return trimmed.startsWith("+") ? trimmed : `+${digits}`;
  }

  /**
   * Cria e persiste o registo seguro de OTP no banco com TTL de 5 minutos.
   */
  public static async createOtpSession(params: {
    targetIdentifier: string;
    channel: OtpChannel;
    purpose: OtpPurpose;
    schoolId?: string | null;
    userId?: string | null;
    requestedIp?: string | null;
    userAgent?: string | null;
    code?: string;
  }): Promise<{ session: VerificationSession; generatedCode: string }> {
    const normalizedIdentifier = this.normalizeIdentifier(params.targetIdentifier);
    const code = params.code || this.generateCode();
    const codeHash = this.hashCode(code, normalizedIdentifier);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutos

    const db = await loadSgaAdminClient();

    // Invalida sessões ativas anteriores para o mesmo identificador e propósito (evita duplicidade)
    await db
      .from("verification_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("target_identifier", normalizedIdentifier)
      .eq("purpose", params.purpose)
      .is("consumed_at", null);

    const { data, error } = await db
      .from("verification_otps")
      .insert({
        school_id: params.schoolId ?? null,
        user_id: params.userId ?? null,
        target_identifier: normalizedIdentifier,
        channel_sent: params.channel,
        purpose: params.purpose,
        code_hash: codeHash,
        attempts_left: 5,
        expires_at: expiresAt,
        requested_ip: params.requestedIp ?? null,
        user_agent: params.userAgent ?? null,
      })
      .select("id, target_identifier, channel_sent, purpose, expires_at, attempts_left")
      .single();

    if (error || !data) {
      throw new Error(`Falha ao persistir sessão OTP: ${error?.message || "Erro desconhecido"}`);
    }

    return {
      session: {
        id: data.id,
        targetIdentifier: data.target_identifier,
        channelSent: data.channel_sent as OtpChannel,
        purpose: data.purpose as OtpPurpose,
        expiresAt: data.expires_at,
        attemptsLeft: data.attempts_left,
      },
      generatedCode: code,
    };
  }

  /**
   * Validação atómica do código OTP:
   * - Verifica expiração
   * - Compara hash HMAC
   * - Decrementa tentativas se errado
   * - Marca como consumido atomicamente no primeiro acerto
   */
  public static async verifyCode(params: {
    targetIdentifier: string;
    purpose: OtpPurpose;
    code: string;
    /** Quando dado, só aceita um código pedido por esta conta. */
    userId?: string;
  }): Promise<{
    valid: boolean;
    reason?: "invalid_code" | "expired" | "not_found" | "too_many_attempts";
    attemptsLeft?: number;
  }> {
    const normalizedIdentifier = this.normalizeIdentifier(params.targetIdentifier);
    const db = await loadSgaAdminClient();

    // Busca a sessão ativa mais recente
    let query = db
      .from("verification_otps")
      .select("id, code_hash, attempts_left, expires_at, consumed_at")
      .eq("target_identifier", normalizedIdentifier)
      .eq("purpose", params.purpose)
      .is("consumed_at", null);
    if (params.userId) query = query.eq("user_id", params.userId);
    const { data: record, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !record) {
      return { valid: false, reason: "not_found" };
    }

    // 1. Checa expiração temporal
    if (new Date(record.expires_at).getTime() < Date.now()) {
      await db
        .from("verification_otps")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", record.id);
      return { valid: false, reason: "expired" };
    }

    // 2. Checa tentativas esgotadas
    if (record.attempts_left <= 0) {
      await db
        .from("verification_otps")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", record.id);
      return { valid: false, reason: "too_many_attempts", attemptsLeft: 0 };
    }

    // 3. Validação do hash
    const computedHash = this.hashCode(params.code, normalizedIdentifier);
    const isMatch = computedHash === record.code_hash;

    if (isMatch) {
      // Sucesso: invalidação imediata e atómica
      await db
        .from("verification_otps")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", record.id);

      return { valid: true };
    }

    // Incorreto: decrementa tentativas
    const newAttemptsLeft = record.attempts_left - 1;
    const isNowExhausted = newAttemptsLeft <= 0;

    await db
      .from("verification_otps")
      .update({
        attempts_left: newAttemptsLeft,
        ...(isNowExhausted ? { consumed_at: new Date().toISOString() } : {}),
      })
      .eq("id", record.id);

    return {
      valid: false,
      reason: isNowExhausted ? "too_many_attempts" : "invalid_code",
      attemptsLeft: Math.max(0, newAttemptsLeft),
    };
  }
}
