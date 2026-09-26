import { describe, it, expect } from "vitest";
import { cursosImporter } from "@/features/import/importers/cursos-importer";
import { horariosImporter } from "@/features/import/importers/horarios-importer";
import { dividasImporter } from "@/features/import/importers/dividas-importer";
import { pagamentosImporter } from "@/features/import/importers/pagamentos-importer";
import { historicoFinanceiroImporter } from "@/features/import/importers/historico-financeiro-importer";
import { classesImporter } from "@/features/import/importers/classes-importer";
import { disciplinasImporter } from "@/features/import/importers/disciplinas-importer";
import { salasImporter } from "@/features/import/importers/salas-importer";
import { propinasImporter } from "@/features/import/importers/propinas-importer";
import { pautasImporter } from "@/features/import/importers/pautas-importer";
import { presencasImporter } from "@/features/import/importers/presencas-importer";
import { IMPORTER_REGISTRY } from "@/features/import/engine/registry";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `commitRow` corre em dry run exactamente como corre a sério — o motor de importação
 * (`features/import/server.ts`) chama-o na mesma e passa `dryRun: true` no contexto. É
 * cada importador que tem de recusar escrever. Um importador sem essa guarda faz uma
 * "pré-visualização" que grava mesmo: contratos financeiros, faturas, tempos de horário.
 *
 * Este teste dá a cada importador um cliente de base de dados que rebenta se alguém
 * tentar `insert`, `update`, `upsert` ou `delete`, e uma RPC que faz o mesmo. Se o
 * importador escrever durante um dry run, o teste falha com o nome da tabela.
 */

function explodingDb(reads: Record<string, unknown> = {}) {
  const writes: string[] = [];
  const fail = (table: string, op: string) => {
    writes.push(`${op} ${table}`);
    throw new Error(`ESCRITA PROIBIDA EM DRY RUN: ${op} em ${table}`);
  };
  const client = {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        limit: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: reads[table] ?? null, error: null }),
        single: async () => ({ data: reads[table] ?? null, error: null }),
        then: (resolve: (value: { data: never[]; error: null }) => unknown) =>
          resolve({
            data: (Array.isArray(reads[table]) ? reads[table] : []) as never[],
            error: null,
          }),
        insert: () => fail(table, "insert"),
        update: () => fail(table, "update"),
        upsert: () => fail(table, "upsert"),
        delete: () => fail(table, "delete"),
      };
      return chain;
    },
    rpc: (fn: string) => fail(fn, "rpc"),
  };
  return { client, writes };
}

function commitContext(db: unknown) {
  return {
    db,
    sessionSupabase: db,
    schoolId: "school-1",
    academicYearId: "ay1",
    userId: "user-1",
    duplicateStrategy: "ignore" as const,
    dryRun: true,
  };
}

const student = {
  id: "s1",
  person_id: "p1",
  student_number: "PROC-2026-042",
  national_id: "005432190LA048",
  status: "active",
};
const enrollment = { id: "e1", student_id: "s1", academic_year_id: "ay1", status: "active" };
const feePlan = { id: "fp1", academic_year_id: "ay1", status: "active" };
const feeItem = {
  id: "fi1",
  fee_plan_id: "fp1",
  kind: "tuition",
  name: "Propina",
  is_active: true,
};

describe("dry run não escreve na base", () => {
  it("cursosImporter", async () => {
    const { client, writes } = explodingDb();
    const cache = {
      existingCourses: [],
      academicLevels: [{ id: "al1", code: "SEC", name: "Ensino Secundário" }],
    };
    const res = await cursosImporter.commitRow(
      { code: "CFB", name: "Ciências Físicas e Biológicas" },
      commitContext(client) as never,
      cache as never,
    );
    expect(res.status).toBe("will_insert");
    expect(writes).toEqual([]);
  });

  it("classesImporter", async () => {
    const { client, writes } = explodingDb();
    const cache = {
      existingGrades: [],
      programs: [{ id: "prog1", code: "CFB", name: "Ciências Físicas e Biológicas" }],
    };
    const res = await classesImporter.commitRow(
      { code: "10-CFB", name: "10ª Classe CFB" },
      commitContext(client) as never,
      cache as never,
    );
    expect(res.status).toBe("will_insert");
    expect(writes).toEqual([]);
  });

  it("disciplinasImporter", async () => {
    const { client, writes } = explodingDb();
    const cache = { existingSubjects: [] };
    const res = await disciplinasImporter.commitRow(
      { code: "MAT", name: "Matemática", annual_hours: 132 },
      commitContext(client) as never,
      cache as never,
    );
    expect(res.status).toBe("will_insert");
    expect(writes).toEqual([]);
  });

  it("horariosImporter — sem escrever a associação turma/disciplina", async () => {
    const { client, writes } = explodingDb();
    const cache = {
      classGroups: [{ id: "g1", code: "10A-M", name: "10ª Classe A" }],
      subjects: [{ id: "sub1", code: "MAT", name: "Matemática" }],
      teachers: [],
      classSubjects: [],
      existingSlots: new Set<string>(),
    };
    const res = await horariosImporter.commitRow(
      {
        class_group: "10A-M",
        subject: "MAT",
        weekday: "Segunda-feira",
        start_time: "07:30",
        end_time: "08:15",
      },
      commitContext(client) as never,
      cache as never,
    );
    expect(res.status).toBe("will_insert");
    // A associação turma/disciplina não existia: em dry run não pode ser criada.
    expect(cache.classSubjects).toHaveLength(0);
    expect(writes).toEqual([]);
  });

  it("dividasImporter — sem criar contrato financeiro nem fatura", async () => {
    const { client, writes } = explodingDb();
    const cache = {
      students: [student],
      enrollments: [enrollment],
      feePlans: [feePlan],
      feeItems: [feeItem],
      existingInvoiceNumbers: new Set<string>(),
      contractCache: new Map<string, string>(),
      invoiceYear: 2026,
      invoiceSequence: 1,
    };
    const res = await dividasImporter.commitRow(
      {
        student_identifier: "PROC-2026-042",
        amount_due: 35000,
        month_ref: "Janeiro 2026",
        due_date: "2026-01-10",
      },
      commitContext(client) as never,
      cache as never,
    );
    expect(res.status).toBe("will_insert");
    expect(cache.contractCache.size).toBe(0);
    expect(writes).toEqual([]);
  });

  it("pagamentosImporter — sem emitir recibo", async () => {
    const { client, writes } = explodingDb();
    const cache = {
      students: [student],
      openInvoices: [
        {
          id: "inv1",
          invoice_number: "FT-2026/0001",
          student_id: "s1",
          amount: 35000,
          due_date: "2026-02-10",
          remaining: 35000,
        },
      ],
      existingReceiptNumbers: new Set<string>(),
    };
    const res = await pagamentosImporter.commitRow(
      { student_identifier: "PROC-2026-042", amount: 35000, payment_method: "Multicaixa" },
      commitContext(client) as never,
      cache as never,
    );
    expect(res.status).toBe("will_insert");
    // O saldo da fatura em memória não pode mexer numa pré-visualização.
    expect(cache.openInvoices[0]!.remaining).toBe(35000);
    expect(writes).toEqual([]);
  });

  it("salasImporter", async () => {
    const { client, writes } = explodingDb();
    const cache = { existingRooms: [] };
    const res = await salasImporter.commitRow(
      { code: "S01", name: "Sala 01", capacity: 30 },
      commitContext(client) as never,
      cache as never,
    );
    expect(res.status).toBe("will_insert");
    expect(writes).toEqual([]);
  });

  it("propinasImporter — will_update quando já há parâmetros", async () => {
    const { client, writes } = explodingDb();
    const cache = { existingSettingsId: "bs1" };
    const res = await propinasImporter.commitRow(
      { due_day: 10, late_fee_percent: 5 },
      commitContext(client) as never,
      cache as never,
    );
    expect(res.status).toBe("will_update");
    expect(writes).toEqual([]);
  });

  it("pautasImporter — sem gravar a média final", async () => {
    const { client, writes } = explodingDb();
    const enrollment = { id: "e1", student_id: "s1", final_average: null };
    const cache = {
      students: [student],
      enrollmentByStudentId: new Map([["s1", enrollment]]),
    };
    const res = await pautasImporter.commitRow(
      { student_identifier: "PROC-2026-042", final_average: 15.4 },
      commitContext(client) as never,
      cache as never,
    );
    expect(res.status).toBe("will_update");
    expect(enrollment.final_average).toBeNull();
    expect(writes).toEqual([]);
  });

  it("presencasImporter — sem gravar a presença da sessão", async () => {
    const { client, writes } = explodingDb({
      enrollments: { id: "e1" },
      class_subjects: { id: "cs1", teacher_id: null },
      siga_attendance_sessions: [{ id: "session-1", status: "pending" }],
      siga_attendance_records: { id: "record-1", status: "absent", notes: null },
    });
    const cache = {
      academicYearId: "ay1",
      students: [student],
      groups: [{ id: "g1", code: "10A", name: "10ª Classe A", academic_year_id: "ay1" }],
      subjects: [{ id: "sub1", code: "MAT", name: "Matemática" }],
    };
    const res = await presencasImporter.commitRow(
      {
        student_identifier: "PROC-2026-042",
        class_group: "10A",
        subject: "MAT",
        attendance_date: "2026-09-24",
        status: "presente",
      },
      { ...commitContext(client), duplicateStrategy: "update" } as never,
      cache as never,
    );
    expect(res.status).toBe("will_update");
    expect(writes).toEqual([]);
  });

  it("nenhum importador registado escreve antes da guarda de dry run", () => {
    // A versão anterior só exigia que o ficheiro *mencionasse* `ctx.dryRun`.
    // Mencionar não é devolver: um importador que gravasse e só depois
    // verificasse a guarda passava na mesma. O que conta é a ordem — nada que
    // grave pode correr antes de a guarda devolver.
    //
    // Escrever conta directo e por interposta pessoa. Dos quatro ajudantes dos
    // núcleos que gravam, `resolveOrCreatePerson` verifica `ctx.dryRun` por
    // dentro (e por isso é seguro chamá-lo antes da guarda); os três
    // financeiros gravam sempre e têm de ficar depois dela.
    const ESCRITORES_CEGOS = [
      "ensureFinanceContract",
      "insertInvoiceWithNumber",
      "registerReceiptDirect",
    ];
    const escritaCega = new RegExp(
      String.raw`\.(?:insert|upsert|update|delete)\(|\brpc\(|\b(?:${ESCRITORES_CEGOS.join("|")})\(`,
      "g",
    );

    const problemas: string[] = [];

    for (const modulo of Object.keys(IMPORTER_REGISTRY)) {
      const ficheiro = resolve(
        __dirname,
        "../../src/features/import/importers",
        `${modulo.replace(/_/g, "-")}-importer.ts`,
      );
      let código: string;
      try {
        código = readFileSync(ficheiro, "utf8");
      } catch {
        continue; // módulos servidos por outro ficheiro (ex.: people-core)
      }

      const escritas = [...código.matchAll(escritaCega)];
      if (escritas.length === 0) continue; // nada que gravar, nada a guardar

      const primeiraEscrita = escritas[0].index ?? 0;

      // A guarda aparece em três formas no repositório: com chavetas, sem elas,
      // e com um `if` aninhado antes do return. Procurar `if (ctx.dryRun)` e
      // exigir um `return` entre ela e a primeira escrita cobre as três.
      const guardas = [...código.matchAll(/if\s*\(\s*ctx\.dryRun\s*\)/g)];
      const guarda = guardas.find((g) => (g.index ?? Infinity) < primeiraEscrita);

      if (!guarda) {
        problemas.push(`${modulo}: grava (${escritas[0][0]}) sem guarda de dry run antes`);
        continue;
      }
      const entre = código.slice(guarda.index ?? 0, primeiraEscrita);
      if (!/\breturn\b/.test(entre)) {
        problemas.push(`${modulo}: a guarda de dry run não devolve antes de gravar`);
      }
    }

    expect(
      problemas,
      `Sem uma guarda que devolva antes da primeira escrita, a pré-visualização grava mesmo ` +
        `— contratos financeiros, faturas, tempos de horário:\n${problemas.join("\n")}`,
    ).toEqual([]);
  });

  it("historicoFinanceiroImporter — sem fatura nem liquidação", async () => {
    const { client, writes } = explodingDb();
    const cache = {
      students: [student],
      academicYears: [
        { id: "ay1", name: "2023/2024", starts_on: "2023-09-01", ends_on: "2024-07-15" },
      ],
      enrollments: [{ id: "e1", student_id: "s1", academic_year_id: "ay1", status: "completed" }],
      feePlans: [feePlan],
      feeItems: [feeItem],
      existingInvoiceNumbers: new Set<string>(),
      contractCache: new Map<string, string>(),
      invoiceYear: 2026,
      invoiceSequence: 1,
    };
    const res = await historicoFinanceiroImporter.commitRow(
      {
        student_identifier: "PROC-2026-042",
        academic_year: "2023/2024",
        total_billed: 45000,
        total_paid: 45000,
      },
      commitContext(client) as never,
      cache as never,
    );
    expect(res.status).toBe("will_insert");
    expect(cache.contractCache.size).toBe(0);
    expect(writes).toEqual([]);
  });
});
