import {
  IMessageDeliveryAdapter,
  OtpChannel,
  OtpDeliveryResult,
  OtpPurpose,
  VerificationSession,
} from "./contracts";
import { OtpService } from "./otp-service";
import { ResendOtpAdapter } from "./adapters/resend-otp-adapter";
import { WhatsAppOtpAdapter } from "./adapters/whatsapp-otp-adapter";
import { SmsOtpAdapter } from "./adapters/sms-otp-adapter";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { checkRateLimit, recordRateLimitAttempt } from "@/lib/rate-limit";

export interface RequestOtpOptions {
  targetIdentifier: string; // "+244923000000" ou "utilizador@escola.ao"
  purpose: OtpPurpose;
  preferredChannel?: OtpChannel;
  schoolId?: string | null;
  schoolName?: string;
  userId?: string | null;
  requestedIp?: string | null;
  userAgent?: string | null;
  allowSimultaneous?: boolean;
}

export interface RequestOtpResult {
  success: boolean;
  sessionId?: string;
  channelUsed?: OtpChannel;
  targetIdentifier: string;
  cooldownSeconds: number;
  error?: string;
}

// Cooldown de 60s entre envios para o mesmo identificador; máx 5 envios por hora
const OTP_HOURLY_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 };
const OTP_COOLDOWN_RATE_LIMIT = { windowMs: 60 * 1000, max: 1 };
// Por IP, qualquer destino: sem isto, variar o e-mail/telefone disparava
// códigos sem limite a partir do mesmo IP (custo de SMS/WhatsApp e assédio).
const OTP_IP_HOURLY_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 20 };

export class OtpDispatcher {
  private adapters: Map<OtpChannel, IMessageDeliveryAdapter> = new Map();

  constructor(customAdapters?: IMessageDeliveryAdapter[]) {
    if (customAdapters && customAdapters.length > 0) {
      for (const adapter of customAdapters) {
        this.adapters.set(adapter.channel, adapter);
      }
    } else {
      this.adapters.set("email", new ResendOtpAdapter());
      this.adapters.set("whatsapp", new WhatsAppOtpAdapter());
      this.adapters.set("sms", new SmsOtpAdapter());
    }
  }

  public getAdapter(channel: OtpChannel): IMessageDeliveryAdapter | undefined {
    return this.adapters.get(channel);
  }

  /**
   * Determina a ordem de canais prioritários para a cascata de envio.
   */
  public resolveChannelCascade(identifier: string, preferred?: OtpChannel): OtpChannel[] {
    const isEmail = identifier.includes("@");
    const primary = preferred || (isEmail ? "email" : "whatsapp");

    if (isEmail) {
      // Para e-mail, tentar e-mail primeiro
      return [primary, "email"].filter((v, i, a) => a.indexOf(v) === i) as OtpChannel[];
    }

    // Para telefone (+244 Angola): WhatsApp -> SMS -> E-mail
    const baseList: OtpChannel[] = ["whatsapp", "sms"];
    const ordered = [primary, ...baseList.filter((c) => c !== primary)];
    return ordered;
  }

  /**
   * Orquestra o envio do código com controle de rate limiting e fallback automático.
   */
  public async requestOtp(options: RequestOtpOptions): Promise<RequestOtpResult> {
    const normalizedIdentifier = OtpService.normalizeIdentifier(options.targetIdentifier);
    const ip = options.requestedIp || "unknown";

    // 1. Checagem de Rate Limits e Cooldown
    const cooldownKey = `otp_cooldown:${normalizedIdentifier}`;
    const hourlyKey = `otp_hourly:${normalizedIdentifier}:${ip}`;

    if (!checkRateLimit([cooldownKey], OTP_COOLDOWN_RATE_LIMIT)) {
      return {
        success: false,
        targetIdentifier: normalizedIdentifier,
        cooldownSeconds: 60,
        error: "Por favor, aguarde 60 segundos antes de solicitar um novo código.",
      };
    }

    // IP desconhecido não entra: uma chave comum a todos bloquearia toda a gente.
    const ipKey = ip !== "unknown" ? `otp_ip_hourly:${ip}` : null;
    if (ipKey && !checkRateLimit([ipKey], OTP_IP_HOURLY_RATE_LIMIT)) {
      return {
        success: false,
        targetIdentifier: normalizedIdentifier,
        cooldownSeconds: 3600,
        error: "Limite de solicitações de verificação atingido para esta hora. Tente mais tarde.",
      };
    }

    if (!checkRateLimit([hourlyKey], OTP_HOURLY_RATE_LIMIT)) {
      return {
        success: false,
        targetIdentifier: normalizedIdentifier,
        cooldownSeconds: 3600,
        error: "Limite de solicitações de verificação atingido para esta hora. Tente mais tarde.",
      };
    }

    // 2. Geração do código e sessão criptográfica
    let session: VerificationSession;
    let generatedCode: string;

    const channelCascade = this.resolveChannelCascade(
      normalizedIdentifier,
      options.preferredChannel,
    );

    try {
      const created = await OtpService.createOtpSession({
        targetIdentifier: normalizedIdentifier,
        channel: channelCascade[0] || "whatsapp",
        purpose: options.purpose,
        schoolId: options.schoolId,
        userId: options.userId,
        requestedIp: options.requestedIp,
        userAgent: options.userAgent,
      });
      session = created.session;
      generatedCode = created.generatedCode;
    } catch (err: any) {
      return {
        success: false,
        targetIdentifier: normalizedIdentifier,
        cooldownSeconds: 0,
        error: err.message || "Erro ao iniciar sessão de verificação.",
      };
    }

    // 3. Execução da Cascata de Envio
    let finalDeliveryResult: OtpDeliveryResult | null = null;
    let successfulChannel: OtpChannel | null = null;

    for (const channel of channelCascade) {
      const adapter = this.adapters.get(channel);
      if (!adapter) continue;

      const result = await adapter.sendCode({
        recipient: normalizedIdentifier,
        code: generatedCode,
        expiresInMinutes: 5,
        schoolName: options.schoolName,
        purpose: options.purpose,
      });

      // Regista tentativa de despacho no banco de dados para auditoria
      await this.logDispatch({
        schoolId: options.schoolId,
        channel,
        provider: adapter.providerName,
        externalMessageId: result.externalMessageId,
        senderAddress: channel === "email" ? "auth@portal-siga.com" : "SIGA Plus",
        recipient: normalizedIdentifier,
        status: result.success ? "sent" : "failed",
        errorDetails: result.error,
        metadata: {
          purpose: options.purpose,
          sessionId: session.id,
        },
      });

      if (result.success) {
        finalDeliveryResult = result;
        successfulChannel = channel;
        break; // Sucesso na entrega, encerra cascata
      }
    }

    // Se todos os canais falharem
    if (!finalDeliveryResult || !finalDeliveryResult.success || !successfulChannel) {
      return {
        success: false,
        sessionId: session.id,
        targetIdentifier: normalizedIdentifier,
        cooldownSeconds: 0,
        error:
          finalDeliveryResult?.error ||
          "Não foi possível entregar o código através de nenhum dos canais disponíveis.",
      };
    }

    // 4. Regista tentativa bem-sucedida nos contadores de rate limit
    recordRateLimitAttempt([cooldownKey], OTP_COOLDOWN_RATE_LIMIT);
    recordRateLimitAttempt([hourlyKey], OTP_HOURLY_RATE_LIMIT);
    if (ipKey) recordRateLimitAttempt([ipKey], OTP_IP_HOURLY_RATE_LIMIT);

    return {
      success: true,
      sessionId: session.id,
      channelUsed: successfulChannel,
      targetIdentifier: normalizedIdentifier,
      cooldownSeconds: 60,
    };
  }

  /**
   * Regista histórico forense em `communication_dispatches`.
   */
  private async logDispatch(params: {
    schoolId?: string | null;
    channel: OtpChannel;
    provider: string;
    externalMessageId?: string;
    senderAddress: string;
    recipient: string;
    status: "sent" | "failed";
    errorDetails?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const db = await loadSgaAdminClient();
      await db.from("communication_dispatches").insert({
        school_id: params.schoolId ?? null,
        channel: params.channel,
        provider: params.provider,
        external_message_id: params.externalMessageId ?? null,
        sender_address: params.senderAddress,
        recipient: params.recipient,
        subject_or_template: "OTP Verification",
        status: params.status,
        error_details: params.errorDetails ?? null,
        metadata: params.metadata ?? {},
      });
    } catch {
      // Best-effort: não interromper o fluxo se a escrita de log falhar
    }
  }
}
