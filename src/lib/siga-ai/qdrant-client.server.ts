/**
 * Cliente mínimo do Qdrant (REST), só-servidor.
 *
 * Forma da colecção, métrica, índices de payload e filtros portados de
 * `admin/app/services/rag_service.ts` do Project NOMAD (Apache-2.0, commit
 * 54ee30a4…) — mas com uma diferença que é a razão de ser deste módulo: o NOMAD
 * tem **uma** colecção global (`nomad_knowledge_base`); aqui cada ponto carrega
 * `school_id` e **toda** a pesquisa leva um filtro obrigatório por escola,
 * construído no servidor. Ver `buildSchoolFilter`.
 */
import { EMBEDDING_DIMENSION, EMBEDDING_DISTANCE } from "@/features/siga-ai/nomad-params";
import type { AiDocumentScope } from "@/features/siga-ai/schemas";

export const KB_COLLECTION = "siga_ai_kb";

export class VectorStoreError extends Error {
  constructor(
    message: string,
    public code: "unreachable" | "bad_response",
  ) {
    super(message);
  }
}

async function call<T>(
  baseUrl: string,
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 20_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...rest,
      headers: { "content-type": "application/json", ...(rest.headers ?? {}) },
      signal: controller.signal,
    });
  } catch {
    throw new VectorStoreError(
      "A base de dados vectorial não está acessível. A pesquisa documental fica indisponível.",
      "unreachable",
    );
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new VectorStoreError(
      `A base de dados vectorial respondeu ${response.status}.`,
      "bad_response",
    );
  }
  return (await response.json()) as T;
}

export async function health(baseUrl: string): Promise<boolean> {
  try {
    await call(baseUrl, "/collections", { timeoutMs: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Cria a colecção e os índices de payload. Idempotente. */
export async function ensureCollection(baseUrl: string): Promise<void> {
  const existing = await call<{ result?: { collections?: Array<{ name: string }> } }>(
    baseUrl,
    "/collections",
  );
  const has = existing.result?.collections?.some((item) => item.name === KB_COLLECTION);
  if (!has) {
    await call(baseUrl, `/collections/${KB_COLLECTION}`, {
      method: "PUT",
      body: JSON.stringify({
        vectors: { size: EMBEDDING_DIMENSION, distance: EMBEDDING_DISTANCE },
      }),
    });
  }
  // `school_id` primeiro: é o índice de que depende o isolamento.
  for (const field of ["school_id", "document_id", "scope", "owner_user_id", "active"]) {
    await call(baseUrl, `/collections/${KB_COLLECTION}/index?wait=true`, {
      method: "PUT",
      body: JSON.stringify({
        field_name: field,
        field_schema: field === "active" ? "bool" : "keyword",
      }),
    }).catch(() => {
      // O Qdrant recusa o índice duplicado; é o comportamento esperado em
      // execuções seguintes e não é falha.
    });
  }
}

export type KbPoint = {
  id: string;
  vector: number[];
  payload: {
    school_id: string;
    document_id: string;
    document_title: string;
    scope: AiDocumentScope;
    owner_user_id: string | null;
    chunk_index: number;
    text: string;
    keywords: string;
    heading?: string;
    active: boolean;
    created_at: number;
  };
};

export async function upsertPoints(baseUrl: string, points: KbPoint[]): Promise<void> {
  if (!points.length) return;
  await call(baseUrl, `/collections/${KB_COLLECTION}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({ points }),
    timeoutMs: 60_000,
  });
}

/**
 * Filtro de acesso — **a fronteira entre escolas**.
 *
 * `schoolId` vem sempre da membership resolvida no servidor, nunca do cliente.
 * O âmbito `personal` só é visível ao dono; `school` e `public` a quem é membro
 * da escola. Sem o `must` do `school_id`, um fragmento de outra escola podia
 * entrar numa resposta: é por isso que esta função é pura e tem teste próprio.
 */
export function buildSchoolFilter(schoolId: string, userId: string) {
  return {
    must: [{ key: "school_id", match: { value: schoolId } }],
    must_not: [{ key: "active", match: { value: false } }],
    should: [
      { key: "scope", match: { value: "school" } },
      { key: "scope", match: { value: "public" } },
      {
        must: [
          { key: "scope", match: { value: "personal" } },
          { key: "owner_user_id", match: { value: userId } },
        ],
      },
    ],
    min_should: 1,
  };
}

export type VectorHit = {
  id: string;
  score: number;
  payload: KbPoint["payload"];
};

export async function search(
  baseUrl: string,
  vector: number[],
  options: {
    schoolId: string;
    userId: string;
    limit: number;
    scoreThreshold: number;
    documentId?: string;
  },
): Promise<VectorHit[]> {
  const filter = buildSchoolFilter(options.schoolId, options.userId);
  const body = {
    vector,
    limit: options.limit,
    score_threshold: options.scoreThreshold,
    with_payload: true,
    filter: options.documentId
      ? {
          ...filter,
          must: [...filter.must, { key: "document_id", match: { value: options.documentId } }],
        }
      : filter,
  };
  const response = await call<{ result?: VectorHit[] }>(
    baseUrl,
    `/collections/${KB_COLLECTION}/points/search`,
    { method: "POST", body: JSON.stringify(body), timeoutMs: 30_000 },
  );
  return response.result ?? [];
}

/** Remove os fragmentos de um documento. O `school_id` continua obrigatório. */
export async function deleteDocument(
  baseUrl: string,
  schoolId: string,
  documentId: string,
): Promise<void> {
  await call(baseUrl, `/collections/${KB_COLLECTION}/points/delete?wait=true`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        must: [
          { key: "school_id", match: { value: schoolId } },
          { key: "document_id", match: { value: documentId } },
        ],
      },
    }),
    timeoutMs: 60_000,
  });
}
