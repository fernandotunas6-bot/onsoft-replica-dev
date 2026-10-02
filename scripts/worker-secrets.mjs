/**
 * Chaves que o servidor lê e que são segredos: vão para o worker por
 * `wrangler secret put` (cifradas, fora da listagem de bindings), nunca por
 * `vars` (texto simples). Obrigatória só a chave de serviço; as outras vão se
 * estiverem definidas no `.env` local ou no ambiente de quem publica.
 *
 * `tests/security/worker-secrets.test.ts` falha se o servidor passar a ler uma
 * chave sensível que não esteja aqui nem em NOT_WORKER_SECRETS.
 */
export const REQUIRED_WORKER_SECRETS = ["SUPABASE_SERVICE_ROLE_KEY"];

export const OPTIONAL_WORKER_SECRETS = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_JWT_SECRET",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "SIGA_CRON_SECRET",
  "OTP_PEPPER_SECRET",
  "PAYFLOW_SSO_SECRET",
  "PAYFLOW_INTEGRATION_API_KEY",
  "APPYPAY_WEBHOOK_TOKEN",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "TWILIO_WEBHOOK_AUTH_TOKEN",
  "SMS_API_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_CLOUD_TOKEN",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "META_APP_SECRET",
  "ZOHO_MAIL_CLIENT_SECRET",
  "ZOHO_MAIL_REFRESH_TOKEN",
  "GOOGLE_SERVICE_ACCOUNT_KEY",
  "GOOGLE_OAUTH_TOKEN",
  "LOVABLE_API_KEY",
  // URL de webhook (Slack ou outro) dos alertas de `reportSigaEvent`: quem a tem
  // escreve no canal, por isso vai cifrada. Sem ela nenhum alerta sai.
  "SIGA_ALERT_WEBHOOK_URL",
  // Par da VITE_HCAPTCHA_SITE_KEY: com ela, o registo público de escolas exige captcha.
  "HCAPTCHA_SECRET_KEY",
];

/** Lidas pelo código mas que não são segredos do worker (e porquê). */
export const NOT_WORKER_SECRETS = {
  SUPABASE_PUBLISHABLE_KEY: "chave pública; vai em vars",
  CLOUDFLARE_API_TOKEN: "só para publicar, na máquina de quem publica",
  SIGA_GATEWAY_DEV_API_KEY: "só para desenvolvimento local",
};

/** Pares [nome, valor] a enviar; o `.env` local tem prioridade sobre o ambiente. */
export function collectWorkerSecrets(envVars, processEnv) {
  const pick = (name) => envVars[name] || processEnv[name] || "";
  return [...REQUIRED_WORKER_SECRETS, ...OPTIONAL_WORKER_SECRETS]
    .map((name) => [name, pick(name)])
    .filter(([, value]) => value);
}
