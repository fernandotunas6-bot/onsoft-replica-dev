import type { Context } from "./model";

/**
 * Pedidos de documentos do próprio aluno e os documentos que a escola emite.
 * Só consulta: no SIGA os pedidos são registados pela secretaria.
 */
export const documentStatuses = [
  "submitted",
  "in_review",
  "approved",
  "fulfilled",
  "rejected",
  "cancelled",
] as const;
export type DocumentStatus = (typeof documentStatuses)[number];

export interface StudentDocuments {
  schoolId: string;
  userId: string;
  role: "aluno";
  requests: {
    id: string;
    document: string;
    status: DocumentStatus;
    details: string | null;
    requestedAt: string;
    updatedAt: string;
  }[];
  available: { name: string; kind: "certificate" | "declaration" | "other" }[];
}

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, k: string[]) =>
  Object.keys(v).length === k.length && k.every((k) => k in v);
const uuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const text = (v: unknown, max = 300) => typeof v === "string" && !!v.trim() && v.length <= max;
const instant = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
  Number.isFinite(Date.parse(v));

export function parseStudentDocuments(value: unknown, ctx: Context): StudentDocuments {
  const invalid = (): never => {
    throw new Error("Contrato de documentos inválido.");
  };
  if (
    !object(value) ||
    !keys(value, ["schoolId", "userId", "role", "requests", "available"]) ||
    ctx.role !== "aluno" ||
    value.role !== ctx.role ||
    value.schoolId !== ctx.schoolId ||
    value.userId !== ctx.userId ||
    !Array.isArray(value.requests) ||
    value.requests.length > 500 ||
    !Array.isArray(value.available) ||
    value.available.length > 200
  )
    return invalid();
  const ids = new Set<string>();
  for (const r of value.requests) {
    if (
      !object(r) ||
      !keys(r, ["id", "document", "status", "details", "requestedAt", "updatedAt"]) ||
      !uuid(r.id) ||
      ids.has(r.id) ||
      !text(r.document) ||
      !documentStatuses.includes(r.status as DocumentStatus) ||
      !(r.details === null || text(r.details, 1000)) ||
      !instant(r.requestedAt) ||
      !instant(r.updatedAt)
    )
      return invalid();
    ids.add(r.id);
  }
  for (const t of value.available) {
    if (
      !object(t) ||
      !keys(t, ["name", "kind"]) ||
      !text(t.name) ||
      !["certificate", "declaration", "other"].includes(String(t.kind))
    )
      return invalid();
  }
  return value as unknown as StudentDocuments;
}
