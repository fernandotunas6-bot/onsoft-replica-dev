import { describe, expect, it } from "vitest";
import { readMobileDocuments } from "@/features/mobile-v4/documents.server";
import type { MobileAcademicScope } from "@/features/mobile-v4/academic-scope.server";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SCHOOL = id(1);
const USER = id(2);
const STUDENT = id(3);
const scope: MobileAcademicScope = {
  schoolId: SCHOOL,
  role: "aluno",
  teacherId: null,
  studentId: STUDENT,
  classGroupIds: [],
  classSubjectIds: [],
  enrollmentIds: [],
};
type Filters = [string, string, unknown][];
function database(tables: Record<string, Record<string, unknown>[]>, count?: number) {
  const calls: { table: string; select: string; filters: Filters }[] = [];
  return {
    calls,
    db: {
      from(table: string) {
        const call = { table, select: "", filters: [] as Filters };
        calls.push(call);
        const chain: Record<string, unknown> = {
          select: (s: string) => ((call.select = s), chain),
          limit: () => chain,
          eq: (f: string, v: unknown) => (call.filters.push(["eq", f, v]), chain),
          then: (resolve: (v: unknown) => void) => {
            const rows = (tables[table] ?? []).filter((r) =>
              call.filters.every(([, f, v]) => r[f] === v),
            );
            resolve({ data: rows, count: count ?? rows.length, error: null });
          },
        };
        return chain;
      },
    } as never,
  };
}
const request = (n: number, extra: Record<string, unknown> = {}) => ({
  id: id(n),
  school_id: SCHOOL,
  student_id: STUDENT,
  template_id: id(50),
  request_type: "declaration",
  status: "submitted",
  purpose: "Nº 12 · Urgente",
  created_at: `2026-10-0${n % 9}T10:00:00+00:00`,
  updated_at: null,
  review_note: "nota interna",
  ...extra,
});

describe("documentos do aluno no Mobile", () => {
  it("só os pedidos do próprio aluno, com o nome do modelo e sem a nota interna", async () => {
    const { db, calls } = database({
      document_requests: [
        request(1),
        request(2, { status: "approved", template_id: null, request_type: "Certidão" }),
        request(3, { student_id: id(9) }),
        request(4, { school_id: id(8) }),
      ],
      document_templates: [
        {
          id: id(50),
          school_id: SCHOOL,
          name: "Declaração de matrícula",
          document_type: "declaration",
          status: "active",
        },
        {
          id: id(51),
          school_id: SCHOOL,
          name: "Antigo",
          document_type: "certificate",
          status: "archived",
        },
      ],
    });
    const result = await readMobileDocuments(db, scope, USER);
    expect(result.requests.map((r) => [r.id, r.document, r.status])).toEqual([
      [id(2), "Certidão", "approved"],
      [id(1), "Declaração de matrícula", "submitted"],
    ]);
    expect(result.requests[1]!.updatedAt).toBe(result.requests[1]!.requestedAt);
    expect(result.available).toEqual([{ name: "Declaração de matrícula", kind: "declaration" }]);
    expect(JSON.stringify(result)).not.toContain("nota interna");
    expect(calls.find((c) => c.table === "document_requests")!.select).not.toContain("review_note");
    expect(
      calls.every((c) => c.filters.some(([, f, v]) => f === "school_id" && v === SCHOOL)),
    ).toBe(true);
  });

  it("cada documento que a escola emite aparece uma vez, mesmo com várias versões", async () => {
    const { db } = database({
      document_requests: [],
      document_templates: [
        {
          id: id(50),
          school_id: SCHOOL,
          name: "Declaração",
          document_type: "declaration",
          status: "active",
        },
        {
          id: id(51),
          school_id: SCHOOL,
          name: "declaração ",
          document_type: "declaration",
          status: "active",
        },
      ],
    });
    expect((await readMobileDocuments(db, scope, USER)).available).toEqual([
      { name: "declaração", kind: "declaration" },
    ]);
  });

  it("um professor nunca chega aqui; leitura truncada ou estado desconhecido falham", async () => {
    await expect(
      readMobileDocuments(database({}).db, { ...scope, role: "professor", studentId: null }, USER),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      readMobileDocuments(database({ document_requests: [request(1)] }, 5).db, scope, USER),
    ).rejects.toMatchObject({ status: 503, code: "DOCUMENTS_UNAVAILABLE" });
    await expect(
      readMobileDocuments(
        database({ document_requests: [request(1, { status: "lost" })] }).db,
        scope,
        USER,
      ),
    ).rejects.toMatchObject({ status: 503, code: "DOCUMENTS_INCONSISTENT" });
  });
});
