import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/school-date", () => ({ schoolTodayIso: () => "2026-10-17" }));

import {
  isOwnSubmissionPath,
  prepareMobileSubmissionUpload,
  readMobileSubmissions,
  registerMobileSubmission,
  safeFileName,
  signMobileSubmissionFile,
} from "@/features/mobile-v4/submissions.server";
import type { MobileAcademicScope } from "@/features/mobile-v4/academic-scope.server";

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const SCHOOL = id(1);
const USER = id(2);
const STUDENT = id(3);
const TASK = id(4);
const CS = id(5);
const student: MobileAcademicScope = {
  schoolId: SCHOOL,
  role: "aluno",
  teacherId: null,
  studentId: STUDENT,
  classGroupIds: [id(6)],
  classSubjectIds: [CS],
  enrollmentIds: [id(7)],
};
const teacher: MobileAcademicScope = {
  ...student,
  role: "professor",
  teacherId: id(8),
  studentId: null,
};

type Op = [string, ...unknown[]];
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
let queries: { table: string; ops: Op[] }[];
let storage: { op: string; args: unknown[] }[];
let pdf: Uint8Array;
let downloadedFile: Blob | undefined;
let cleanupThrows = false;

function database(answer: (table: string, ops: Op[]) => Answer) {
  return {
    from(table: string) {
      const ops: Op[] = [];
      queries.push({ table, ops });
      const chain: Record<string, unknown> = {};
      for (const name of [
        "select",
        "eq",
        "in",
        "limit",
        "insert",
        "update",
        "maybeSingle",
        "single",
      ]) {
        chain[name] = (...args: unknown[]) => {
          ops.push([name, ...args]);
          return chain;
        };
      }
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({ error: null, ...answer(table, ops) });
      return chain;
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async (...args: unknown[]) => {
          storage.push({ op: "upload", args });
          return { data: { signedUrl: "https://sga.test/upload?token=t" }, error: null };
        },
        download: async (...args: unknown[]) => {
          storage.push({ op: "download", args });
          return {
            data: downloadedFile ?? new Blob([pdf as Uint8Array<ArrayBuffer>]),
            error: null,
          };
        },
        remove: async (...args: unknown[]) => {
          storage.push({ op: "remove", args });
          if (cleanupThrows) throw new Error("Storage temporariamente indisponível");
          return { data: [], error: null };
        },
        createSignedUrl: async (...args: unknown[]) => {
          storage.push({ op: "sign", args });
          return { data: { signedUrl: "https://sga.test/read" }, error: null };
        },
      }),
    },
  } as never;
}

const task = { id: TASK, class_subject_id: CS, due_on: "2026-10-20" };
const row = {
  id: id(9),
  task_id: TASK,
  student_id: STUDENT,
  storage_path: `${SCHOOL}/2026/10/submissions/${USER}/${id(10)}-antigo.pdf`,
  file_name: "antigo.pdf",
  size_bytes: 100,
  version: 1,
  status: "submitted",
  submitted_at: "2026-10-16T10:00:00Z",
};
function happy(
  over: Partial<Record<string, (ops: Op[]) => Answer>> = {},
  linked: typeof row | null = null,
) {
  return database((table, ops) => {
    // A busca pelo caminho verifica se o Blob já pertence a uma entrega,
    // independentemente do mock usado para a consulta por tarefa/aluno.
    if (
      table === "siga_task_submissions" &&
      ops.some((op) => op[0] === "eq" && op[1] === "storage_path")
    ) {
      return { data: linked };
    }
    if (over[table]) return over[table]!(ops);
    if (table === "siga_task_submissions") {
      if (ops.some((o) => o[0] === "insert" || o[0] === "update"))
        return { data: { ...row, version: 2, file_name: "trabalho.pdf" } };
      if (ops.some((o) => o[0] === "maybeSingle")) return { data: null };
      return { data: [] };
    }
    if (table === "siga_class_tasks") return { data: task };
    throw new Error(`tabela inesperada: ${table}`);
  });
}
const ownPath = `${SCHOOL}/2026/10/submissions/${USER}/${id(11)}-trabalho.pdf`;

beforeEach(() => {
  queries = [];
  storage = [];
  pdf = new TextEncoder().encode("%PDF-1.7 conteúdo");
  downloadedFile = undefined;
  cleanupThrows = false;
});

describe("caminhos e nomes", () => {
  it("só aceita o caminho da escola e do utilizador da sessão", () => {
    expect(isOwnSubmissionPath(ownPath, SCHOOL, USER)).toBe(true);
    expect(isOwnSubmissionPath(ownPath, SCHOOL, id(99))).toBe(false);
    expect(isOwnSubmissionPath(ownPath.replace(SCHOOL, id(98)), SCHOOL, USER)).toBe(false);
    expect(isOwnSubmissionPath(ownPath.replace("submissions", "chat"), SCHOOL, USER)).toBe(false);
    expect(isOwnSubmissionPath(ownPath.replace(".pdf", ".exe"), SCHOOL, USER)).toBe(false);
    expect(isOwnSubmissionPath(`${ownPath}/../x.pdf`, SCHOOL, USER)).toBe(false);
  });
  it("nome seguro termina sempre em .pdf", () => {
    expect(safeFileName("Trabalho final (v2).pdf")).toBe("Trabalho_final_v2_.pdf");
    expect(safeFileName("relatório")).toBe("relat_rio.pdf");
  });
});

describe("pedir o URL de envio", () => {
  it("devolve um caminho da escola e do aluno, com URL assinado", async () => {
    const out = await prepareMobileSubmissionUpload(happy(), student, USER, {
      taskId: TASK,
      fileName: "trabalho.pdf",
      sizeBytes: 2048,
    });
    expect(isOwnSubmissionPath(out.path, SCHOOL, USER)).toBe(true);
    expect(out.path.startsWith(`${SCHOOL}/2026/10/submissions/${USER}/`)).toBe(true);
    expect(out.uploadUrl).toBe("https://sga.test/upload?token=t");
  });
  it.each([
    [{ fileName: "foto.jpg", sizeBytes: 10 }, "PDF_REQUIRED"],
    [{ fileName: "a.pdf", sizeBytes: 10 * 1024 * 1024 + 1 }, "FILE_TOO_LARGE"],
  ])("recusa %j", async (input, code) => {
    await expect(
      prepareMobileSubmissionUpload(happy(), student, USER, { taskId: TASK, ...input }),
    ).rejects.toMatchObject({ code });
  });
  it("recusa tarefa de outra disciplina, prazo terminado e professor", async () => {
    await expect(
      prepareMobileSubmissionUpload(
        happy({ siga_class_tasks: () => ({ data: { ...task, class_subject_id: id(77) } }) }),
        student,
        USER,
        { taskId: TASK, fileName: "a.pdf", sizeBytes: 5 },
      ),
    ).rejects.toMatchObject({ code: "TASK_FORBIDDEN" });
    await expect(
      prepareMobileSubmissionUpload(
        happy({ siga_class_tasks: () => ({ data: { ...task, due_on: "2026-10-16" } }) }),
        student,
        USER,
        { taskId: TASK, fileName: "a.pdf", sizeBytes: 5 },
      ),
    ).rejects.toMatchObject({ code: "SUBMISSION_CLOSED" });
    await expect(
      prepareMobileSubmissionUpload(happy(), teacher, USER, {
        taskId: TASK,
        fileName: "a.pdf",
        sizeBytes: 5,
      }),
    ).rejects.toMatchObject({ code: "ROLE_FORBIDDEN" });
  });
  it("sem a migração aplicada responde «não pronto», sem URL", async () => {
    const db = happy({
      siga_task_submissions: () => ({ error: { code: "42P01", message: "does not exist" } }),
    });
    await expect(
      prepareMobileSubmissionUpload(db, student, USER, {
        taskId: TASK,
        fileName: "a.pdf",
        sizeBytes: 5,
      }),
    ).rejects.toMatchObject({ status: 503, code: "SUBMISSIONS_NOT_READY" });
    expect(storage).toEqual([]);
  });
});

describe("registar a entrega", () => {
  it("recusa um caminho que não é do aluno", async () => {
    await expect(
      registerMobileSubmission(happy(), student, USER, {
        taskId: TASK,
        path: ownPath.replace(USER, id(99)),
      }),
    ).rejects.toMatchObject({ code: "SUBMISSION_PATH_FORBIDDEN" });
  });
  it("registar de novo o mesmo caminho da própria tarefa é idempotente", async () => {
    const linked = { ...row, storage_path: ownPath };
    const out = await registerMobileSubmission(happy({}, linked), student, USER, {
      taskId: TASK,
      path: ownPath,
    });
    expect(out.submission).toMatchObject({ id: linked.id, version: linked.version });
    expect(storage).toEqual([]);
    expect(queries.some((q) => q.ops.some((op) => op[0] === "insert" || op[0] === "update"))).toBe(
      false,
    );
  });

  it("não permite usar o PDF já registado numa tarefa diferente", async () => {
    await expect(
      registerMobileSubmission(
        happy({}, { ...row, task_id: id(90), storage_path: ownPath }),
        student,
        USER,
        { taskId: TASK, path: ownPath },
      ),
    ).rejects.toMatchObject({ status: 409, code: "SUBMISSION_PATH_IN_USE" });
    expect(storage).toEqual([]);
  });

  it("não permite usar o PDF de outro aluno e nunca remove esse ficheiro", async () => {
    await expect(
      registerMobileSubmission(
        happy({}, { ...row, student_id: id(91), storage_path: ownPath }),
        student,
        USER,
        { taskId: TASK, path: ownPath },
      ),
    ).rejects.toMatchObject({ status: 409, code: "SUBMISSION_PATH_IN_USE" });
    expect(storage).toEqual([]);
  });

  it("apaga e recusa um ficheiro que não é PDF", async () => {
    pdf = new TextEncoder().encode("MZ executável");
    await expect(
      registerMobileSubmission(happy(), student, USER, { taskId: TASK, path: ownPath }),
    ).rejects.toMatchObject({ code: "PDF_REQUIRED" });
    expect(storage.find((s) => s.op === "remove")?.args).toEqual([[ownPath]]);
    expect(queries.some((q) => q.ops.some((o) => o[0] === "insert"))).toBe(false);
  });
  it("confirma o cabeçalho sem copiar o Blob completo", async () => {
    const blob = new Blob([pdf as Uint8Array<ArrayBuffer>]);
    const fullRead = vi.spyOn(blob, "arrayBuffer").mockRejectedValue(new Error("leitura completa"));
    downloadedFile = blob;
    const result = await registerMobileSubmission(happy(), student, USER, {
      taskId: TASK,
      path: ownPath,
    });
    expect(result.submission.taskId).toBe(TASK);
    expect(fullRead).not.toHaveBeenCalled();
  });

  it("recusa ficheiros acima de 10 MB sem ler o conteúdo", async () => {
    const slice = vi.fn(() => {
      throw new Error("não deve ler ficheiro acima do limite");
    });
    downloadedFile = { size: 10 * 1024 * 1024 + 1, slice } as unknown as Blob;
    await expect(
      registerMobileSubmission(happy(), student, USER, { taskId: TASK, path: ownPath }),
    ).rejects.toMatchObject({ status: 413, code: "FILE_TOO_LARGE" });
    expect(slice).not.toHaveBeenCalled();
    expect(storage.find((item) => item.op === "remove")?.args).toEqual([[ownPath]]);
    expect(queries.some((q) => q.ops.some((op) => op[0] === "insert"))).toBe(false);
  });

  it("devolve o erro original quando a limpeza de PDF inválido falha", async () => {
    cleanupThrows = true;
    pdf = new TextEncoder().encode("MZ executável");
    await expect(
      registerMobileSubmission(happy(), student, USER, { taskId: TASK, path: ownPath }),
    ).rejects.toMatchObject({ status: 422, code: "PDF_REQUIRED" });
    expect(storage.some((item) => item.op === "remove")).toBe(true);
  });

  it("recusa PDF vazio antes de registar a entrega", async () => {
    downloadedFile = new Blob([]);
    await expect(
      registerMobileSubmission(happy(), student, USER, { taskId: TASK, path: ownPath }),
    ).rejects.toMatchObject({ status: 422, code: "PDF_REQUIRED" });
    expect(queries.some((q) => q.ops.some((op) => op[0] === "insert"))).toBe(false);
  });

  it("primeira entrega: insere com o aluno, a tarefa e o tamanho real", async () => {
    const out = await registerMobileSubmission(happy(), student, USER, {
      taskId: TASK,
      path: ownPath,
    });
    const insert = queries.flatMap((q) => q.ops).find((o) => o[0] === "insert")?.[1] as Record<
      string,
      unknown
    >;
    expect(insert).toMatchObject({
      school_id: SCHOOL,
      task_id: TASK,
      student_id: STUDENT,
      storage_path: ownPath,
      file_name: "trabalho.pdf",
      size_bytes: pdf.byteLength,
      submitted_by: USER,
    });
    expect(out.submission.taskId).toBe(TASK);
  });
  it("reenvio concorrente recusa versão desactualizada sem apagar o último PDF válido", async () => {
    const db = happy({
      siga_task_submissions: (ops) =>
        ops.some((op) => op[0] === "update")
          ? { data: null }
          : ops.some((op) => op[0] === "maybeSingle")
            ? { data: row }
            : { data: [] },
    });

    await expect(
      registerMobileSubmission(db, student, USER, { taskId: TASK, path: ownPath }),
    ).rejects.toMatchObject({ status: 409, code: "SUBMISSION_CONFLICT" });

    const update = queries.find(
      (q) => q.table === "siga_task_submissions" && q.ops.some((op) => op[0] === "update"),
    );
    expect(update?.ops).toContainEqual(["eq", "school_id", SCHOOL]);
    expect(update?.ops).toContainEqual(["eq", "student_id", STUDENT]);
    expect(update?.ops).toContainEqual(["eq", "version", row.version]);
    expect(storage.some((item) => item.op === "remove")).toBe(false);
  });

  it("primeira entrega concorrente informa conflito em vez de erro genérico", async () => {
    const db = happy({
      siga_task_submissions: (ops) =>
        ops.some((op) => op[0] === "insert")
          ? { error: { code: "23505", message: "duplicate key" } }
          : ops.some((op) => op[0] === "maybeSingle")
            ? { data: null }
            : { data: [] },
    });

    await expect(
      registerMobileSubmission(db, student, USER, { taskId: TASK, path: ownPath }),
    ).rejects.toMatchObject({ status: 409, code: "SUBMISSION_CONFLICT" });
    expect(storage.some((item) => item.op === "remove")).toBe(false);
  });

  it("falha de limpeza do ficheiro anterior não invalida a nova entrega guardada", async () => {
    cleanupThrows = true;
    const db = happy({
      siga_task_submissions: (ops) =>
        ops.some((op) => op[0] === "update")
          ? { data: { ...row, storage_path: ownPath, version: 2 } }
          : ops.some((op) => op[0] === "maybeSingle")
            ? { data: row }
            : { data: [] },
    });
    const result = await registerMobileSubmission(db, student, USER, {
      taskId: TASK,
      path: ownPath,
    });
    expect(result.submission).toMatchObject({ version: 2 });
    expect(storage.find((item) => item.op === "remove")?.args).toEqual([[row.storage_path]]);
  });

  it("reenvio: actualiza a versão e apaga o ficheiro anterior", async () => {
    const db = happy({
      siga_task_submissions: (ops) =>
        ops.some((o) => o[0] === "update")
          ? { data: { ...row, version: 2 } }
          : ops.some((o) => o[0] === "maybeSingle")
            ? { data: row }
            : { data: [] },
    });
    await registerMobileSubmission(db, student, USER, { taskId: TASK, path: ownPath });
    const update = queries.flatMap((q) => q.ops).find((o) => o[0] === "update")?.[1] as Record<
      string,
      unknown
    >;
    expect(update).toMatchObject({ version: 2, storage_path: ownPath });
    expect(storage.find((s) => s.op === "remove")?.args).toEqual([[row.storage_path]]);
  });
});

describe("ler entregas", () => {
  it("professor: precisa da tarefa e vê os nomes dos alunos", async () => {
    await expect(readMobileSubmissions(happy(), teacher, USER)).rejects.toMatchObject({
      code: "TASK_REQUIRED",
    });
    const db = happy({
      siga_task_submissions: () => ({ data: [row] }),
      students: () => ({ data: [{ id: STUDENT, person_id: id(12) }] }),
      people: () => ({ data: [{ id: id(12), full_name: "Ana Souza" }] }),
    });
    const out = await readMobileSubmissions(db, teacher, USER, TASK);
    expect(out.submissions).toEqual([
      expect.objectContaining({ id: row.id, studentName: "Ana Souza", fileName: "antigo.pdf" }),
    ]);
  });
  it("aluno: só as suas, sem nomes de outros", async () => {
    const out = await readMobileSubmissions(
      happy({ siga_task_submissions: () => ({ data: [row] }) }),
      student,
      USER,
    );
    expect(out.submissions[0]).not.toHaveProperty("studentName");
    const filter = queries
      .find(
        (q) =>
          q.table === "siga_task_submissions" &&
          q.ops.some((o) => o[0] === "limit" && o[1] === 1000),
      )
      ?.ops.filter((o) => o[0] === "eq");
    expect(filter).toContainEqual(["eq", "student_id", STUDENT]);
  });
  it("aluno não abre o ficheiro de outro aluno", async () => {
    const db = happy({
      siga_task_submissions: (ops) =>
        ops.some((o) => o[0] === "maybeSingle")
          ? { data: { ...row, student_id: id(55) } }
          : { data: [] },
    });
    await expect(signMobileSubmissionFile(db, student, row.id)).rejects.toMatchObject({
      code: "SUBMISSION_FORBIDDEN",
    });
    expect(storage).toEqual([]);
  });
});
