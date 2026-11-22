/**
 * Ambiente dos builds sem segredos (análise 22, P2-2).
 *
 * Os builds (Vite, Next, VitePress, vinext) executam código de centenas de dependências.
 * Nenhum precisa de um segredo do servidor: os do Worker do SIGA vão por
 * `wrangler secret put` e as Pages não têm segredos. Antes, o passo de publicação corria
 * os builds com cerca de 40 segredos no ambiente (chave de serviço do Supabase, segredo
 * JWT, Twilio, WhatsApp, conta de serviço Google…): uma dependência comprometida podia
 * lê-los de `process.env`. Só o `wrangler` os recebe agora.
 *
 * Fica tudo o que não parece segredo (PATH, HOME, NODE_ENV, CI…) e tudo o que é público
 * por definição: `VITE_*`, `NEXT_PUBLIC_*` e as chaves publicáveis.
 */
import { OPTIONAL_WORKER_SECRETS, REQUIRED_WORKER_SECRETS } from "../worker-secrets.mjs";

/** Nomes com cara de segredo. */
const SECRET_NAME = /(?:KEY|SECRET|TOKEN|PASSWORD|PEPPER|CREDENTIALS?|_SID|_AUTH)$/i;
/** Públicos por definição: vão para o bundle do browser de qualquer forma. */
const PUBLIC_NAME = /^(?:VITE_|NEXT_PUBLIC_)|PUBLISHABLE/;

const KNOWN_SECRETS = new Set([...REQUIRED_WORKER_SECRETS, ...OPTIONAL_WORKER_SECRETS]);

/** Nome que não pode chegar ao ambiente de um build. */
export function isBuildSecretName(name) {
  if (PUBLIC_NAME.test(name)) return false;
  return KNOWN_SECRETS.has(name) || SECRET_NAME.test(name);
}

/** Cópia do ambiente sem segredos, para passar a `npm run build`/`vite build`. */
export function buildEnvWithoutSecrets(env) {
  const out = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (isBuildSecretName(name)) continue;
    out[name] = value;
  }
  return out;
}
