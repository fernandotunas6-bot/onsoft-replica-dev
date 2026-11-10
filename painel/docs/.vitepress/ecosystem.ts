/**
 * Endereços das outras apps para as páginas em Markdown. O menu «Apps» (config.ts)
 * lê as mesmas variáveis do deploy (scripts/deploy-all.mjs define-as); sem elas, os
 * domínios de produção da plataforma. Antes, a página inicial tinha
 * www.portal-siga.com e admin.portal-siga.com escritos à mão, enquanto o WEB e o
 * ADMIN eram publicados em *.pages.dev (auditoria de 01/11/2026).
 */
const env = import.meta.env
const domain = String(env.VITE_PLATFORM_DOMAIN || 'portal-siga.com')
  .trim()
  .toLowerCase()
  .replace(/^\.+|\.+$/g, '')
const local = !env.PROD

function origin(value: string | undefined, production: string, development: string): string {
  return String(value || (local ? development : production)).replace(/\/+$/, '')
}

export const ECOSYSTEM = {
  web: origin(env.VITE_WEB_URL, `https://www.${domain}`, 'http://localhost:5174'),
  admin: origin(env.VITE_ADMIN_URL, `https://admin.${domain}`, 'http://localhost:3005'),
  siga: origin(env.VITE_SIGA_URL, `https://${domain}`, 'http://localhost:3006'),
  payflow: origin(env.VITE_PAYFLOW_URL, `https://payflow.${domain}`, 'http://localhost:3007'),
}
