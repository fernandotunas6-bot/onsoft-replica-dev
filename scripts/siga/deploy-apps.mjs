/**
 * Regras puras do deploy (scripts/deploy-all.mjs, scripts/deploy-cf.mjs), num módulo
 * à parte para se poderem testar sem publicar nada.
 */

/**
 * Que apps publicar: `SIGA_DEPLOY_APPS=siga,payflow` (ou `all`, por omissão). Serve para
 * republicar só o que falhou, ou só o SIGA quando um painel estático não constrói, sem
 * mexer no código. Nome desconhecido recusa logo: um erro de escrita não pode publicar
 * «nada» e dar sucesso.
 */
export const DEPLOY_APPS = ["docs", "web", "admin", "payflow", "siga"];

export function selectDeployApps(raw) {
  const wanted = String(raw ?? "all")
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (wanted.length === 0 || wanted.includes("all")) return new Set(DEPLOY_APPS);
  const unknown = wanted.filter((app) => !DEPLOY_APPS.includes(app));
  if (unknown.length) {
    throw new Error(
      `SIGA_DEPLOY_APPS: app desconhecida (${unknown.join(", ")}). Use all ou ${DEPLOY_APPS.join(", ")}.`,
    );
  }
  return new Set(wanted);
}

/**
 * Publicação de emergência a partir da máquina de quem publica, sem API token:
 * `npx wrangler login` (navegador) e `SIGA_DEPLOY_AUTH=wrangler-login`. O wrangler usa
 * a sessão OAuth em vez de CLOUDFLARE_API_TOKEN.
 */
export function usesWranglerLogin(env) {
  return env.SIGA_DEPLOY_AUTH === "wrangler-login";
}

/** Nunca no CI: lá não há navegador e o caminho é o token do ambiente `production`. */
export function assertWranglerLoginAllowed(env) {
  if (usesWranglerLogin(env) && env.GITHUB_ACTIONS === "true") {
    throw new Error("SIGA_DEPLOY_AUTH=wrangler-login é só para publicar à mão, nunca no CI.");
  }
}
