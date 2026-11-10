import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança de todas as respostas (páginas e API). O PayFlow cobra
 * dinheiro: o checkout, a confirmação e a consola não podem ser embebidos noutro
 * site para enganar cliques (X-Frame-Options + frame-ancestors). A CSP só define
 * frame-ancestors, para não bloquear scripts. Mesma base do SIGA
 * (src/lib/security-headers.ts na raiz). Verificado em tests/security-headers.test.mjs.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Grupos de regex, como nos exemplos do Next: o vinext transforma `/:path*`
      // em `^/[^/]+.*$` (fora `/`) e `/:path+` num `+` literal (não apanha nada).
      { source: "/(.*)", headers: securityHeaders },
      // Checkout, comprovativos, portal do aluno, consola e API não são para
      // motores de pesquisa (os endereços levam códigos de pagamento).
      { source: "/(.+)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
  /**
   * `cloudflare:workers` só existe dentro do workerd. Fora dele o webpack
   * recusa o esquema ao analisar o `import()` de `lib/cf-env.ts` e o build
   * pára com `UnhandledSchemeError` — antes de o `try/catch` desse módulo
   * poder correr. Declarar o especificador como externo devolve-lhe a falha
   * em execução, que é o caso previsto: cai no `process.env`.
   */
  webpack(config) {
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : config.externals ? [config.externals] : []),
      { "cloudflare:workers": "commonjs cloudflare:workers" },
    ];
    return config;
  },
};

export default nextConfig;
