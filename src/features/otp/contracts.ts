export type OtpChannel = "email" | "sms" | "whatsapp";

export type OtpPurpose =
  | "signup_verification"
  | "login_2fa"
  | "password_reset"
  | "phone_change"
  | "email_change"
  | "payflow_sensitive_op"
  | "grade_approval"
  | "admin_step_up";

export interface OtpPayload {
  recipient: string; // "+244923000000" ou "utilizador@escola.ao"
  code: string;
  expiresInMinutes: number;
  schoolName?: string;
  purpose: OtpPurpose;
}

export interface OtpDeliveryResult {
  success: boolean;
  channel: OtpChannel;
  provider: string;
  externalMessageId?: string;
  error?: string;
}

export interface IMessageDeliveryAdapter {
  channel: OtpChannel;
  providerName: string;
  sendCode(payload: OtpPayload): Promise<OtpDeliveryResult>;
}

export interface VerificationSession {
  id: string;
  targetIdentifier: string;
  channelSent: OtpChannel;
  purpose: OtpPurpose;
  expiresAt: string;
  attemptsLeft: number;
}
