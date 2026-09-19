import { describe, it, expect, vi } from "vitest";
import { exportSchoolData } from "@/features/import/export-engine";

function createMockTable(data: unknown[]) {
  const query: Record<string, unknown> = {};
  const chain = () => query;
  query.select = vi.fn(chain);
  query.eq = vi.fn(chain);
  query.is = vi.fn(chain);
  query.order = vi.fn(chain);
  query.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: data as unknown[], error: null });
  return query;
}

describe("exportSchoolData — módulos Ciclo 55", () => {
  it("exporta folhas para inscricoes, avaliacoes, historico_academico e historico_financeiro", async () => {
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === "enrollment_applications") {
          return createMockTable([
            {
              id: "app-1",
              full_name: "Benedito Calei",
              status: "pending",
              payload: { person: { phone_primary: "923000111", email: "b@escola.ao" } },
              created_at: "2026-09-01T10:00:00Z",
              decided_at: null,
            },
          ]);
        }
        if (table === "siga_assessment_items") {
          return createMockTable([
            {
              id: "ai-1",
              name: "Prova 1",
              kind: "teste",
              component: "P1",
              term: 1,
              max_score: 20,
              assessed_on: "2026-09-01",
              created_at: "2026-09-01T10:00:00Z",
            },
          ]);
        }
        if (table === "student_academic_history") {
          return createMockTable([
            {
              id: "hist-1",
              academic_year_label: "2024/2025",
              grade_level: "7ª Classe",
              previous_school: "Escola Primária Central",
              final_average: 14.5,
              outcome: "Aprovado",
              students: {
                student_number: "PROC-1",
                people: { full_name: "Ana Silva", national_id: "0012LA" },
              },
            },
          ]);
        }
        if (table === "enrollments") {
          return createMockTable([]);
        }
        if (table === "finance_invoices") {
          return createMockTable([
            {
              id: "inv-1",
              invoice_number: "FT-001",
              amount: 45000,
              amount_paid: 45000,
              status: "paid",
              due_date: "2026-03-01",
              paid_at: "2026-03-01T12:00:00Z",
              payment_channel: "multicaixa",
              students: {
                student_number: "PROC-1",
                people: { full_name: "Ana Silva", national_id: "0012LA" },
              },
            },
          ]);
        }
        return createMockTable([]);
      }),
    };

    const result = await exportSchoolData(mockDb as any, {
      schoolId: "school-1",
      schoolName: "Colégio Teste",
      modules: ["inscricoes", "avaliacoes", "historico_academico", "historico_financeiro"],
      mode: "human",
    });

    expect(result.recordCount).toBe(4);
    expect(result.fileName).toContain("SIGA_Exportacao");
    expect(result.buffer.byteLength).toBeGreaterThan(1000);
  });
});
