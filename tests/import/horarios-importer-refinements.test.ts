import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseImportFile } from "@/features/import/engine/parse";
import {
  horariosImporter,
  parseTimeToMinutes,
  parseWeekday,
} from "@/features/import/importers/horarios-importer";

type Row = Record<string, unknown>;

/** Cliente mínimo: guarda filtros e escritas, devolve as linhas da tabela pedida. */
function fakeDb(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; op: "insert" | "update"; payload: Row }> = [];
  const queries: Array<{ table: string; filters: Row }> = [];
  let seq = 0;
  const from = (table: string) => {
    const filters: Row = {};
    let op: "select" | "insert" | "update" = "select";
    let payload: Row = {};
    const rows = () =>
      (tables[table] ?? []).filter((row) =>
        Object.entries(filters).every(([column, value]) =>
          Array.isArray(value) ? value.includes(row[column]) : row[column] === value,
        ),
      );
    const result = () =>
      op === "select" ? { data: rows(), error: null } : { data: null, error: null };
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (column: string, value: unknown) => ((filters[column] = value), api),
      in: (column: string, values: unknown[]) => ((filters[column] = values), api),
      order: () => api,
      range: () => {
        queries.push({ table, filters: { ...filters } });
        return Promise.resolve(result());
      },
      insert: (body: Row) => {
        op = "insert";
        payload = body;
        writes.push({ table, op, payload });
        return api;
      },
      update: (body: Row) => {
        op = "update";
        payload = body;
        writes.push({ table, op, payload });
        return api;
      },
      single: () => Promise.resolve({ data: { id: `${table}-${++seq}`, ...payload }, error: null }),
      then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => {
        if (op === "select") queries.push({ table, filters: { ...filters } });
        return Promise.resolve(result()).then(resolve, reject);
      },
    };
    return api;
  };
  return { client: { from } as never, writes, queries };
}

const school = "school-1";
const baseTables = (): Record<string, Row[]> => ({
  class_groups: [
    {
      id: "g-10a",
      code: "10A",
      name: "10ª A",
      status: "active",
      academic_year_id: "y-26",
      school_id: school,
    },
    {
      id: "g-10a-old",
      code: "10A",
      name: "10ª A",
      status: "closed",
      academic_year_id: "y-25",
      school_id: school,
    },
  ],
  subjects: [
    { id: "s-mat", code: "MAT", name: "Matemática", school_id: school },
    { id: "s-fis", code: "FIS", name: "Física", school_id: school },
  ],
  teachers: [
    { id: "t-ana", person_id: "p-ana", employee_number: "DOC-000001", school_id: school },
    { id: "t-rui", person_id: "p-rui", employee_number: "DOC-000002", school_id: school },
  ],
  people: [
    { id: "p-ana", full_name: "Ana Sapalo", national_id: "001LA", school_id: school },
    { id: "p-rui", full_name: "Rui Ndala", national_id: "002LA", school_id: school },
  ],
  class_subjects: [
    {
      id: "cs-mat",
      class_group_id: "g-10a",
      subject_id: "s-mat",
      teacher_id: "t-ana",
      weekly_periods: 2,
      status: "active",
      school_id: school,
    },
  ],
  timetable_slots: [
    // Activa: ocupa segunda 07:00–07:45.
    {
      id: "slot-1",
      class_subject_id: "cs-mat",
      weekday: 1,
      starts_at: "07:00:00",
      ends_at: "07:45:00",
      room: "Sala D101",
      room_id: "r-101",
      status: "active",
      school_id: school,
    },
    // Cancelada: não pode contar como conflito nem como repetida.
    {
      id: "slot-2",
      class_subject_id: "cs-mat",
      weekday: 2,
      starts_at: "07:00:00",
      ends_at: "07:45:00",
      room: "Sala D101",
      room_id: "r-101",
      status: "cancelled",
      school_id: school,
    },
  ],
  rooms: [
    { id: "r-101", code: "D101", name: "Sala D101", status: "active", school_id: school },
    {
      id: "r-lab",
      code: "LABF",
      name: "Laboratório de Física",
      status: "active",
      school_id: school,
    },
  ],
  school_shifts: [
    { id: "sh-m", starts_at: "07:00:00", ends_at: "12:30:00", status: "active", school_id: school },
    { id: "sh-t", starts_at: "13:00:00", ends_at: "18:00:00", status: "active", school_id: school },
  ],
});

async function loadCache(tables = baseTables()) {
  const db = fakeDb(tables);
  const cache = await horariosImporter.loadRefCache({
    db: db.client,
    schoolId: school,
    academicYearId: "y-26",
  });
  return { cache, db };
}

const line = (overrides: Row = {}): Row => ({
  class_group: "10A",
  subject: "FIS",
  teacher_identifier: "DOC-000002",
  weekday: "Terça-feira",
  start_time: "07:00",
  end_time: "07:45",
  room: "LABF",
  ...overrides,
});

const commitContext = (db: ReturnType<typeof fakeDb>, dryRun: boolean) => ({
  db: db.client,
  sessionSupabase: db.client,
  schoolId: school,
  academicYearId: "y-26",
  userId: "user-1",
  duplicateStrategy: "ignore" as const,
  dryRun,
});

describe("dias e horas como as escolas os escrevem", () => {
  it("lê o dia por extenso, abreviado, em ordinal português, em inglês e em número", () => {
    expect(parseWeekday("Segunda-feira")).toBe(1);
    expect(parseWeekday("seg.")).toBe(1);
    expect(parseWeekday("2ª feira")).toBe(1);
    expect(parseWeekday("3.ª-feira")).toBe(2);
    expect(parseWeekday("4a feira")).toBe(3);
    expect(parseWeekday("TERÇA")).toBe(2);
    expect(parseWeekday("Friday")).toBe(5);
    expect(parseWeekday("Sábado")).toBe(6);
    expect(parseWeekday("domingo")).toBe(7);
    expect(parseWeekday("3")).toBe(3);
    expect(parseWeekday("feriado")).toBeNull();
  });

  it("lê a hora com dois pontos, com «h», com ponto e em número do Excel", () => {
    expect(parseTimeToMinutes("07:30")).toBe(450);
    expect(parseTimeToMinutes("7:30:00")).toBe(450);
    expect(parseTimeToMinutes("7h30")).toBe(450);
    expect(parseTimeToMinutes("07h")).toBe(420);
    expect(parseTimeToMinutes("7.30")).toBe(450);
    expect(parseTimeToMinutes(0.3125)).toBe(450); // célula de hora
    expect(parseTimeToMinutes("0.3125")).toBe(450);
    expect(parseTimeToMinutes(46000.3125)).toBe(450); // data e hora
    expect(parseTimeToMinutes(7.3)).toBe(450); // «7.30» numa célula de número
    expect(parseTimeToMinutes("25:00")).toBeNull();
    expect(parseTimeToMinutes("7h75")).toBeNull();
  });

  it("uma célula de hora do Excel chega como HH:MM, não como 1899-12-30", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Horário");
    sheet.addRow(["Turma", "Hora de Início"]);
    const row = sheet.addRow(["10A", new Date(Date.UTC(1899, 11, 30, 7, 30))]);
    row.getCell(2).numFmt = "hh:mm";
    const parsed = await parseImportFile(Buffer.from(await workbook.xlsx.writeBuffer()), "h.xlsx");
    expect(parsed.sheets[0]!.rows[0]!["Hora de Início"]).toBe("07:30");
  });
});

describe("referências carregadas uma vez por lote", () => {
  it("só conta aulas activas e só turmas do ano da importação que ainda recebem horário", async () => {
    const { cache, db } = await loadCache();
    const slotQuery = db.queries.find((q) => q.table === "timetable_slots");
    expect(slotQuery?.filters["status"]).toBe("active");
    const groupQuery = db.queries.find((q) => q.table === "class_groups");
    expect(groupQuery?.filters["academic_year_id"]).toBe("y-26");

    // A aula cancelada de terça às 07:00 não bloqueia Física no mesmo tempo.
    expect(horariosImporter.analyzeRow(line(), cache).status).toBe("valid");
  });
});

describe("salas, professores e conflitos", () => {
  it("liga a sala do cadastro pelo código e avisa quando a sala não existe", async () => {
    const { cache } = await loadCache();
    expect(horariosImporter.analyzeRow(line(), cache).warnings).toEqual([]);
    const unknown = horariosImporter.analyzeRow(
      line({ weekday: "quarta", room: "Sala 99" }),
      cache,
    );
    expect(unknown.status).toBe("warning");
    expect(unknown.warnings.join(" ")).toContain("Sala «Sala 99» não está no cadastro");
  });

  it("detecta a sala ocupada sem olhar a maiúsculas e ignora «A definir»", async () => {
    const { cache } = await loadCache();
    const busy = horariosImporter.analyzeRow(
      line({ weekday: "segunda", room: "sala d101", teacher_identifier: "" }),
      cache,
    );
    expect(busy.status).toBe("error");
    expect(busy.errors[0]).toContain("Conflito de horário: a turma já tem aula");

    const tables = baseTables();
    tables.class_groups!.push({
      id: "g-10b",
      code: "10B",
      name: "10ª B",
      status: "active",
      academic_year_id: "y-26",
      school_id: school,
    });
    const { cache: other } = await loadCache(tables);
    const roomClash = horariosImporter.analyzeRow(
      line({ class_group: "10B", weekday: "segunda", room: "SALA D101" }),
      other,
    );
    expect(roomClash.errors[0]).toBe(
      "Conflito de horário: a sala já está ocupada neste intervalo.",
    );
    const placeholder = horariosImporter.analyzeRow(
      line({ class_group: "10B", weekday: "segunda", room: "A definir" }),
      other,
    );
    expect(placeholder.status).toBe("valid");
  });

  it("reconhece o professor pelo nome e recusa um nome repetido", async () => {
    const { cache } = await loadCache();
    expect(
      horariosImporter.analyzeRow(line({ teacher_identifier: "rui ndala" }), cache).status,
    ).toBe("valid");
    const tables = baseTables();
    tables.teachers!.push({
      id: "t-rui2",
      person_id: "p-rui2",
      employee_number: "DOC-000003",
      school_id: school,
    });
    tables.people!.push({
      id: "p-rui2",
      full_name: "Rui Ndala",
      national_id: "003LA",
      school_id: school,
    });
    const { cache: twins } = await loadCache(tables);
    const ambiguous = horariosImporter.analyzeRow(line({ teacher_identifier: "Rui Ndala" }), twins);
    expect(ambiguous.errors[0]).toContain("é ambíguo; use o nº de agente");
  });

  it("na pré-visualização vê o conflito e a repetição com outra linha do mesmo ficheiro", async () => {
    const { cache } = await loadCache();
    expect(horariosImporter.analyzeRow(line(), cache).status).toBe("valid");
    const repeated = horariosImporter.analyzeRow(line(), cache);
    expect(repeated.status).toBe("duplicate");
    expect(repeated.warnings[0]).toContain("repete outra linha do ficheiro");
    const clash = horariosImporter.analyzeRow(
      line({
        subject: "MAT",
        teacher_identifier: "",
        room: "D101",
        start_time: "07:30",
        end_time: "08:15",
      }),
      cache,
    );
    expect(clash.status).toBe("error");
    expect(clash.errors[0]).toBe(
      "Conflito de horário: a turma já tem aula neste intervalo noutra linha do ficheiro.",
    );
  });

  it("avisa quando o horário ultrapassa a carga semanal definida", async () => {
    const { cache } = await loadCache();
    // Matemática: 2 tempos definidos e 1 já no horário.
    const second = horariosImporter.analyzeRow(
      line({ subject: "MAT", teacher_identifier: "", weekday: "quarta", room: "D101" }),
      cache,
    );
    expect(second.status).toBe("valid");
    const third = horariosImporter.analyzeRow(
      line({ subject: "MAT", teacher_identifier: "", weekday: "quinta", room: "D101" }),
      cache,
    );
    expect(third.status).toBe("warning");
    expect(third.warnings[0]).toBe(
      "Matemática passa a ter 3 aulas por semana nesta turma, mas a carga definida é 2; ajuste a carga antes de publicar.",
    );
  });
});

describe("gravação", () => {
  it("grava sala e turno, cria a disciplina com a carga das aulas importadas", async () => {
    const { cache, db } = await loadCache();
    const ctx = commitContext(db, false);
    const first = await horariosImporter.commitRow(line(), ctx, cache);
    const second = await horariosImporter.commitRow(
      line({ weekday: "quinta", start_time: "13:50", end_time: "14:35" }),
      ctx,
      cache,
    );
    expect([first.status, second.status]).toEqual(["imported", "imported"]);

    const created = db.writes.find((w) => w.table === "class_subjects" && w.op === "insert");
    expect(created?.payload["weekly_periods"]).toBe(1);
    const grown = db.writes.find((w) => w.table === "class_subjects" && w.op === "update");
    expect(grown?.payload["weekly_periods"]).toBe(2);

    const slots = db.writes.filter((w) => w.table === "timetable_slots");
    expect(
      slots.map((w) => [w.payload["room"], w.payload["room_id"], w.payload["shift_id"]]),
    ).toEqual([
      ["Laboratório de Física", "r-lab", "sh-m"],
      ["Laboratório de Física", "r-lab", "sh-t"],
    ]);
    expect(
      second.audits.some((a) => a.table_name === "class_subjects" && a.action_type === "updated"),
    ).toBe(true);

    // A mesma linha outra vez é repetida, não uma terceira aula.
    expect((await horariosImporter.commitRow(line(), ctx, cache)).status).toBe("duplicate");
  });

  it("a simulação conta as linhas anteriores e não escreve", async () => {
    const { cache, db } = await loadCache();
    const ctx = commitContext(db, true);
    expect((await horariosImporter.commitRow(line(), ctx, cache)).status).toBe("will_insert");
    const clash = await horariosImporter.commitRow(
      line({ subject: "MAT", teacher_identifier: "", room: "D101" }),
      ctx,
      cache,
    );
    expect(clash.status).toBe("error");
    expect(db.writes).toEqual([]);
  });
});
