/**
 * Verificação de saúde das dependências do PayFlow.
 *
 * O `/api/v1/health` respondia "ok" sem olhar para nada, e o PayFlow correu em
 * produção semanas sem base de dados (o deploy apagava a ligação D1) sem que
 * nada o denunciasse. Agora a saúde confirma a base com uma consulta real e
 * responde 503 quando ela falta, para monitores externos darem o alarme.
 *
 * Sem imports: importado directamente pelos testes (`node --test`).
 */

type D1Like = { prepare(sql: string): { first(): Promise<unknown> } };

export type DependencyCheck = {
  status: "ok" | "unavailable";
  latencyMs: number;
};

function isD1(value: unknown): value is D1Like {
  return typeof (value as D1Like | null)?.prepare === "function";
}

/** `SELECT 1` com limite de tempo. Nunca lança; o erro não sai para fora. */
export async function checkDatabase(db: unknown, timeoutMs = 2000): Promise<DependencyCheck> {
  const started = Date.now();
  if (!isD1(db)) return { status: "unavailable", latencyMs: 0 };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    await Promise.race([db.prepare("SELECT 1").first(), timeout]);
    return { status: "ok", latencyMs: Date.now() - started };
  } catch {
    return { status: "unavailable", latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/** 200 só quando todas as dependências críticas respondem. */
export function healthHttpStatus(checks: Record<string, DependencyCheck>): 200 | 503 {
  return Object.values(checks).every((check) => check.status === "ok") ? 200 : 503;
}
