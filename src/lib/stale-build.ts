/**
 * Recuperação de build obsoleta.
 *
 * Cada deploy substitui o conjunto inteiro de activos no Cloudflare Workers: os ficheiros
 * com o hash antigo passam a dar 404. Quem tinha o SIGA aberto continua a pedir os
 * antigos, e a primeira importação em diferido — mudar de separador, abrir um modal —
 * rebenta com «Failed to fetch dynamically imported module». O ecrã fica preso num erro
 * que um recarregamento resolve, e o utilizador não tem como saber isso.
 *
 * Mesmo padrão do `session-expiry.ts`: reconhecer o erro em qualquer sítio e tratar dele.
 */

const RELOAD_KEY = "siga:stale-build-reload";
/** Duas recuperações seguidas em menos de um minuto são ciclo, não recuperação. */
const MIN_INTERVAL_MS = 60_000;

const STALE_BUILD_PATTERN =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load module script|unable to preload/i;

export const STALE_BUILD_MESSAGE = "Há uma versão nova. A recarregar…";

export function isStaleBuildError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return STALE_BUILD_PATTERN.test(message);
}

function reloadedRecently(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    return Number.isFinite(last) && Date.now() - last < MIN_INTERVAL_MS;
  } catch {
    // Sem sessionStorage não há travão possível; mais vale não recarregar do que arriscar
    // um ciclo sem fim.
    return true;
  }
}

/** Devolve true se reconheceu o erro e mandou recarregar. */
export function recoverFromStaleBuild(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleBuildError(error)) return false;
  if (reloadedRecently()) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * Apanha o que não passa pelo limite de erro do router: as pré-cargas que o
 * `defaultPreload: "intent"` dispara ao passar o rato, e os `<script>` que o navegador
 * não conseguiu buscar.
 */
export function attachStaleBuildRecovery(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("unhandledrejection", (event) => {
    recoverFromStaleBuild(event.reason);
  });

  window.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      // Só os nossos próprios pedaços da build. Um script de terceiros bloqueado por um
      // bloqueador de anúncios — o hCaptcha, por exemplo — não pode pôr a página a
      // recarregar-se em ciclo.
      if (
        target instanceof HTMLScriptElement &&
        target.src.startsWith(`${window.location.origin}/assets/`)
      ) {
        recoverFromStaleBuild(new Error("failed to load module script"));
        return;
      }
      recoverFromStaleBuild(event.error);
    },
    true,
  );
}
