import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
