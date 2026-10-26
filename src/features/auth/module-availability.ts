import modulesCatalog from "../../../scripts/siga/modules.json";

/**
 * Que módulos é que esta escola tem ligados.
 *
 * Há dois níveis, e a ordem importa:
 *
 *  1. **omissão do produto** — `dormant: true` no `scripts/siga/modules.json`
 *     significa desligado para todas as escolas. A 25/10/2026 são o Alumni, o RH
 *     e as Catracas: zero registos em produção;
 *  2. **estado por escola** — uma linha em `school_modules` com `status`, que
 *     prevalece sobre a omissão. É isto que permite ligar o RH numa escola
 *     piloto sem o mostrar às outras.
 *
 * **Falta de linha nunca tira nada.** Sem linha vale a omissão do produto, e é
 * de propósito: uma escola nova, ou uma tabela que não respondeu, fica com o que
 * o produto dá por omissão em vez de ficar sem navegação. O mecanismo só pode
 * acrescentar ao que já se via, ou retirar quando alguém o escreveu
 * explicitamente.
 *
 * **Isto não é controlo de acesso.** Esconder um módulo não protege dados: quem
 * souber o endereço entra, e o que recusa são os guardas de cada server function
 * (`tests/security/server-fn-guards.test.ts`) e o `canAccessPath`. Esta camada
 * decide o que se **mostra**, não o que se **pode**.
 */

export type ModuleStatus =
  "installed" | "active" | "disabled" | "update_available" | "incompatible" | "error" | "archived";

/** Os estados que contam como ligado. Os outros — e qualquer valor novo — não. */
const STATUS_LIGADO: ReadonlySet<string> = new Set<ModuleStatus>([
  "installed",
  "active",
  "update_available",
]);

export type ModuleSpec = {
  id: string;
  label: string;
  /** Id do mosaico no lançador (`skill` no `modules.json`), quando tem um. */
  launcherId: string | null;
  /** `true` quando o produto o dá desligado por omissão. */
  dormant: boolean;
  navPath: string | null;
  secondaryNavPaths: string[];
};

/** O catálogo tal como o `modules.json` o declara. */
export const MODULE_CATALOG: ModuleSpec[] = modulesCatalog.modules.map((mod) => ({
  id: mod.id,
  label: mod.label,
  launcherId: "skill" in mod && mod.skill ? mod.skill : null,
  dormant: "dormant" in mod && mod.dormant === true,
  navPath: "navPath" in mod && mod.navPath ? mod.navPath : null,
  secondaryNavPaths:
    "secondaryNavPaths" in mod && Array.isArray(mod.secondaryNavPaths)
      ? [...mod.secondaryNavPaths]
      : [],
}));

export const DORMANT_MODULE_IDS: string[] = MODULE_CATALOG.filter((mod) => mod.dormant).map(
  (mod) => mod.id,
);

/** `true` se este estado conta como módulo ligado. */
export function statusEnablesModule(status: string | null | undefined): boolean {
  return status ? STATUS_LIGADO.has(status) : false;
}

/**
 * Os módulos ligados para uma escola. `overrides` são **só** as linhas que
 * existem em `school_modules`; o que não vier ali fica na omissão do produto.
 */
export function resolveEnabledModules(
  overrides: Readonly<Record<string, boolean>> = {},
  catalog: readonly ModuleSpec[] = MODULE_CATALOG,
): Set<string> {
  const ligados = new Set<string>();
  for (const mod of catalog) {
    const explicito = Object.prototype.hasOwnProperty.call(overrides, mod.id)
      ? overrides[mod.id]
      : undefined;
    if (explicito === undefined ? !mod.dormant : explicito) ligados.add(mod.id);
  }
  return ligados;
}

/**
 * Os caminhos de navegação que ficam escondidos. Um caminho só cai aqui se
 * **nenhum** módulo ligado o reclamar: o `/financeiro/rh` é do RH e também
 * secundário do financeiro, e com o RH desligado continua a não aparecer porque
 * quem o reclama como secundário é um módulo cujo próprio dono está desligado.
 */
export function hiddenNavPaths(
  enabled: ReadonlySet<string>,
  catalog: readonly ModuleSpec[] = MODULE_CATALOG,
): Set<string> {
  const escondidos = new Set<string>();
  for (const mod of catalog) {
    if (enabled.has(mod.id)) continue;
    if (mod.navPath) escondidos.add(mod.navPath);
    for (const path of mod.secondaryNavPaths) escondidos.add(path);
  }
  // Um caminho reclamado por um módulo ligado nunca fica escondido.
  for (const mod of catalog) {
    if (!enabled.has(mod.id)) continue;
    if (mod.navPath) escondidos.delete(mod.navPath);
  }
  return escondidos;
}

/** Os mosaicos do lançador que ficam escondidos, por módulo desligado. */
export function hiddenLauncherIds(
  enabled: ReadonlySet<string>,
  catalog: readonly ModuleSpec[] = MODULE_CATALOG,
): Set<string> {
  const escondidos = new Set<string>();
  for (const mod of catalog) {
    if (!enabled.has(mod.id) && mod.launcherId) escondidos.add(mod.launcherId);
  }
  return escondidos;
}
