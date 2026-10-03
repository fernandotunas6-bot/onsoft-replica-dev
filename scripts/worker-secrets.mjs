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
  "APPYPAY_CLIENT_SECRET",
  "ZOOM_CLIENT_SECRET",
  // URL de webhook do Slack para os alertas do gateway: quem a tem escreve no canal.
  "SIGA_GATEWAY_ALERT_SLACK_URL",
];

/**
 * Configuração que o servidor lê e que NÃO é segredo: vai em `vars` (texto simples)
 * quando está definida no `.env` de quem publica ou nas `vars` do ambiente GitHub.
 * Uma variável vazia não é enviada, e `keep_vars` (deploy-cf.mjs) mantém o que já
 * estiver no painel da Cloudflare — antes, cada publicação apagava-o.
 */
export const OPTIONAL_WORKER_VARS = [
  "PLATFORM_DOMAIN",
  "APPYPAY_ENV",
  "APPYPAY_CLIENT_ID",
  "APPYPAY_RESOURCE",
  "APPYPAY_GPO_METHOD",
  "APPYPAY_REF_METHOD",
  "CLOUDFLARE_ZONE_ID",
  "GOOGLE_WORKSPACE_DOMAIN",
  "MAILBOX_PROVIDER",
  "PAYFLOW_AUTO_SYNC",
  "SMS_API_URL",
  "WHATSAPP_OTP_TEMPLATE_NAME",
  "WHATSAPP_PHONE_NUMBER_ID",
  "ZOHO_MAIL_CLIENT_ID",
  "ZOHO_MAIL_ORG_ID",
  "ZOOM_CLIENT_ID",
  "ZOOM_REDIRECT_URI",
];

/** Pares [nome, valor] de configuração a pôr em `vars`; só os definidos. */
export function collectWorkerVars(envVars, processEnv) {
  return OPTIONAL_WORKER_VARS.map((name) => [name, envVars[name] || processEnv[name] || ""]).filter(
    ([, value]) => value,
  );
}

/** Lidas pelo código mas que não são segredos do worker (e porquê). */
export const NOT_WORKER_SECRETS = {
  SUPABASE_PUBLISHABLE_KEY: "chave pública; vai em vars",
  CLOUDFLARE_API_TOKEN: "só para publicar, na máquina de quem publica",
  SIGA_GATEWAY_DEV_API_KEY: "só para desenvolvimento local",
  NODE_ENV: "definida pelo build",
  SIGA_E2E_LIVE: "só nos testes E2E",
  E2E_ALERT_EMAIL_FROM: "só no CI (notificação de falha E2E)",
};

/** Pares [nome, valor] a enviar; o `.env` local tem prioridade sobre o ambiente. */
export function collectWorkerSecrets(envVars, processEnv) {
  const pick = (name) => envVars[name] || processEnv[name] || "";
  return [...REQUIRED_WORKER_SECRETS, ...OPTIONAL_WORKER_SECRETS]
    .map((name) => [name, pick(name)])
    .filter(([, value]) => value);
}
