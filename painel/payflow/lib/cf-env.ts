/**
 * Abstração segura de ambiente entre Cloudflare Workers e Node.js / Next.js local.
 *
 * Em workerd os bindings (D1, R2, …) chegam por `cloudflare:workers` — **nunca**
 * em `globalThis.env` nem em `process.env`. Este módulo lia `globalThis.env` no
 * carregamento, não o encontrava nunca, caía no `process.env`, e `env.DB` ficava
 * a ser `undefined`: `getDb()` lançava «binding `DB` is unavailable» e o
 * `/api/v1/health` respondia 503 com `database: unavailable, latencyMs: 0` — o
 * zero é a prova de que nem chegava a consultar (`checkDatabase` sai no
 * `isD1()`). O binding `DB` estava correcto no Worker e a base tinha as tabelas;
 * era o código que não lhe chegava. É a via documentada pelo vinext
 * (`README.md`, «Cloudflare Bindings»).
 *
 * A importação é dinâmica porque o módulo não existe fora de workerd (`node
 * --test`, `next dev --webpack`): aí a falha é o caso normal, não um erro, e
 * fica o `process.env`. Resolve-se uma vez, no carregamento, antes de qualquer
 * pedido.
 *
 * A leitura é por `Proxy` e não por cópia: o `env` de `cloudflare:workers` pode
 * ser ele próprio um objecto vivo, e espalhá-lo com `...` arriscava perder
 * bindings. Os bindings ganham ao `globalThis.env` e ao `process.env`, por esta
 * ordem.
 */
type RuntimeEnv = Record<string, unknown>;

let bindings: RuntimeEnv = {};
try {
  bindings = ((await import("cloudflare:workers")) as { env?: RuntimeEnv }).env ?? {};
} catch {
  /* fora de workerd não há bindings; fica o process.env */
}

function globalEnv(): RuntimeEnv | undefined {
  return (globalThis as unknown as { env?: RuntimeEnv }).env;
}

function processEnv(): RuntimeEnv {
  return typeof process !== "undefined" ? (process.env as RuntimeEnv) : {};
}

function fontes(): RuntimeEnv[] {
  const g = globalEnv();
  return g && g !== (bindings as RuntimeEnv) ? [bindings, g, processEnv()] : [bindings, processEnv()];
}

export const env: RuntimeEnv = new Proxy({} as RuntimeEnv, {
  get(_alvo, nome: string | symbol) {
    if (typeof nome !== "string") return undefined;
    for (const fonte of fontes()) {
      const valor = fonte[nome];
      if (valor !== undefined) return valor;
    }
    return undefined;
  },
  has(_alvo, nome: string | symbol) {
    return typeof nome === "string" && fontes().some((fonte) => nome in fonte);
  },
  ownKeys() {
    return [...new Set(fontes().flatMap((fonte) => Object.keys(fonte)))];
  },
  getOwnPropertyDescriptor(_alvo, nome: string | symbol) {
    if (typeof nome !== "string") return undefined;
    for (const fonte of fontes()) {
      if (fonte[nome] !== undefined) {
        return { value: fonte[nome], enumerable: true, configurable: true, writable: false };
      }
    }
    return undefined;
  },
});
