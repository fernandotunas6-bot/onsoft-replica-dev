/**
 * Porta de segurança para a matriz E2E de dois tenants.
 *
 * Lê apenas dados fictícios já existentes: NÃO cria nem modifica alunos,
 * escolas, notas, pagamentos ou documentos. Nenhuma conta de produção é aceite.
 */
import { isAbsolute, relative, resolve, sep } from "node:path";

type Env = Record<string, string | undefined>;

export type CrudStagingConfig = {
  baseUrl: string;
  stateA: string;
  stateB: string;
  markerA: string;
  markerB: string;
  supabaseOrigin: string;
};

const PRODUCTION_PROJECT = "xodgfmxiaunpamctfeea";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resolveCrudStagingConfig(env: Env): CrudStagingConfig | null {
  if (env["SIGA_CRUD_E2E"] !== "1") return null;

  const value = (name: string) => env[name]?.trim() ?? "";
  const baseUrl = value("VITE_SIGA_URL");
  const stagingRef = value("SIGA_CRUD_E2E_PROJECT_REF");
  const dbUrl = value("SUPABASE_URL");
  const stateA = value("SIGA_CRUD_E2E_TENANT_A_STATE");
  const stateB = value("SIGA_CRUD_E2E_TENANT_B_STATE");
  const markerA = value("SIGA_CRUD_E2E_TENANT_A_MARKER");
  const markerB = value("SIGA_CRUD_E2E_TENANT_B_MARKER");

  if (!baseUrl || !stagingRef || !dbUrl || !stateA || !stateB || !markerA || !markerB) {
    throw new Error("E2E CRUD: configure servidor local, staging, duas sessões e dois marcadores.");
  }
  if (!/^[a-z0-9]{15,32}$/.test(stagingRef) || stagingRef === PRODUCTION_PROJECT) {
    throw new Error("E2E CRUD: projecto de staging inválido ou de produção.");
  }

  let app: URL;
  let db: URL;
  try {
    app = new URL(baseUrl);
    db = new URL(dbUrl);
  } catch {
    throw new Error("E2E CRUD: URL inválida.");
  }
  if (
    !LOCAL_HOSTS.has(app.hostname) ||
    !["http:", "https:"].includes(app.protocol) ||
    app.username ||
    app.password ||
    app.pathname !== "/" ||
    app.search ||
    app.hash
  ) {
    throw new Error("E2E CRUD: a aplicação tem de estar num servidor local.");
  }
  if (
    db.protocol !== "https:" ||
    db.hostname !== `${stagingRef}.supabase.co` ||
    db.username ||
    db.password ||
    db.pathname !== "/" ||
    db.search ||
    db.hash
  ) {
    throw new Error("E2E CRUD: URL Supabase não corresponde ao staging autorizado.");
  }
  for (const name of ["VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    const other = value(name);
    if (other && other.replace(/\/$/, "") !== db.origin) {
      throw new Error("E2E CRUD: o frontend aponta para um Supabase diferente do staging.");
    }
  }
  // Nunca usar storageState relativo ou guardado debaixo do repositório:
  // os ficheiros contêm tokens de autenticação, mesmo com dados fictícios.
  const workspace = resolve(process.cwd());
  const insideWorkspace = (path: string) => {
    const target = resolve(path);
    const subpath = relative(workspace, target);
    return subpath === "" || (subpath !== ".." && !subpath.startsWith(`..${sep}`) && !isAbsolute(subpath));
  };
  if (
    !isAbsolute(stateA) ||
    !isAbsolute(stateB) ||
    !stateA.endsWith(".json") ||
    !stateB.endsWith(".json") ||
    insideWorkspace(stateA) ||
    insideWorkspace(stateB)
  ) {
    throw new Error("E2E CRUD: as sessões devem estar em ficheiros JSON absolutos fora do repositório.");
  }
  if (resolve(stateA) === resolve(stateB)) {
    throw new Error("E2E CRUD: as duas escolas não podem usar a mesma sessão.");
  }

  // A pesquisa de Pessoas ignora caixa e acentos. Os marcadores usados para
  // provar o isolamento não podem coincidir depois dessa normalização.
  const searchable = (value: string) =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt").trim();
  const searchA = searchable(markerA);
  const searchB = searchable(markerB);
  if (!searchA || !searchB || searchA.length < 4 || searchB.length < 4 || searchA === searchB) {
    throw new Error("E2E CRUD: escolas e registos de teste devem ser distintos.");
  }
  if (searchA.includes(searchB) || searchB.includes(searchA)) {
    throw new Error("E2E CRUD: use marcadores de alunos que não se sobreponham.");
  }

  return { baseUrl: app.origin, stateA, stateB, markerA, markerB, supabaseOrigin: db.origin };
}
