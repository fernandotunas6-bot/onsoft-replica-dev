import { describe, it, expect, vi } from "vitest";
import { exportSchoolData } from "@/features/import/export-engine";
import { parseImportFile } from "@/features/import/engine/parse";

function createMockTable(data: any[]) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    then: (resolve: any) => resolve({ data, error: null }),
  };
  return query;
}

describe("SIGA Data Import & Export Engine — Bidirectional Cycle Test", () => {
  it("deve exportar livro SIGA Exchange com 00_MANIFESTO e permitir releitura transparente pelo parser", async () => {
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === "students") {
          return createMockTable([
            {
              id: "std-001",
              student_number: "2026-0001",
              people: {
                full_name: "António Sebastião",
                national_id: "001234567LA012",
                gender: "M",
                date_of_birth: "2010-02-14",
                phone: "923000001",
                email: "antonio@escola.ao",
                address: "Maianga",
              },
              enrollments: [
                {
                  id: "enr-001",
                  status: "active",
                  class_groups: { name: "10ª A Manhã" },
                },
              ],
            },
          ]);
        }
        if (table === "teachers") {
          return createMockTable([
            {
              id: "tch-001",
              employee_number: "AG-1234",
              specialty: "Matemática",
              people: {
                full_name: "Prof. Joaquim Manuel",
                national_id: "008765432LA088",
                gender: "M",
                phone: "924000002",
                email: "joaquim@escola.ao",
              },
            },
          ]);
        }
        if (table === "class_groups") {
          return createMockTable([
            {
              id: "cls-001",
              name: "10ª A Manhã",
              code: "10A-M",
              shift: "Manhã",
              capacity: 45,
              room: "Sala 01",
              grade_levels: { name: "10ª Classe" },
            },
          ]);
        }
        if (table === "enrollments") {
          return createMockTable([
            {
              id: "enr-001",
              status: "active",
              created_at: "2026-02-01T10:00:00Z",
              students: {
                student_number: "2026-0001",
                people: { full_name: "António Sebastião" },
              },
              class_groups: { name: "10ª A Manhã" },
            },
          ]);
        }
        return createMockTable([]);
      }),
    } as any;

    const exportResult = await exportSchoolData(mockDb, {
      schoolId: "school-test-uuid",
      schoolName: "Colégio Teste SIGA",
      academicYearId: "year-2026-uuid",
      academicYearLabel: "2026",
      modules: ["alunos", "professores", "turmas", "matriculas"],
      mode: "siga_exchange",
    });

    expect(exportResult.buffer).toBeDefined();
    expect(exportResult.fileName).toContain("SIGA_EXCHANGE");
    expect(exportResult.recordCount).toBe(4);
    expect(exportResult.manifest?.format).toBe("SIGA-EXCHANGE");
    expect(exportResult.manifest?.checksum_sha256).toBeDefined();

    // Releitura do buffer exportado através do parseImportFile do motor
    const parsed = await parseImportFile(exportResult.buffer, exportResult.fileName);
    expect(parsed.sheets.length).toBeGreaterThanOrEqual(4);

    // Deve conter a aba ALUNOS com dados legíveis e cabeçalhos oficiais
    const alunosSheet = parsed.sheets.find((s) => s.name === "ALUNOS");
    expect(alunosSheet).toBeDefined();
    expect(alunosSheet!.rows.length).toBe(1);

    const alunoRow = alunosSheet!.rows[0];
    expect(alunoRow["Nome Completo do Aluno"]).toBe("António Sebastião");
    expect(alunoRow["Nº de Processo / Nº Aluno"]).toBe("2026-0001");
    expect(alunoRow["Bilhete de Identidade / Cédula"]).toBe("001234567LA012");
  }, 20000);
});
