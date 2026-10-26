import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let membership: { schoolId: string; appRole: string } | null = null;
let ownTeacher: string | null = null;
let visibleStudent: string | null = null;
let tenantBlocked = false;
let storedObjects: Record<string, unknown> = {};
let failSubmissionInsert = false;
const writeAssessmentScores = vi.fn();
const assertCanStoreBytes = vi.fn();
const notifyTaskReturned = vi.fn();

/** Base em memória com o que este módulo usa: leituras, insert e update. */
function memoryDb() {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let patch: Row | null = null;
      let inserted: Row | null = null;
      let removing = false;
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
      const run = () => {
        if (removing) {
          tables[table] = (tables[table] ?? []).filter((row) => !filters.every((f) => f(row)));
          return { data: null, error: null };
        }
        if (inserted) {
          if (table === "siga_class_task_submissions" && failSubmissionInsert) {
            return { data: null, error: { code: "XX000", message: "falhou" } };
          }
          const list = (tables[table] ??= []);
          const clash = list.some(
            (r) =>
              r.task_id === inserted!.task_id &&
              r.enrollment_id === inserted!.enrollment_id &&
              r.attempt === inserted!.attempt,
          );
          if (clash) return { data: null, error: { code: "23505", message: "duplicate" } };
          list.push({
            id: `00000000-0000-0000-0000-${String(list.length + 1).padStart(12, "0")}`,
            ...inserted,
          });
          return { data: null, error: null };
        }
        const found = rows();
        if (patch) for (const row of found) Object.assign(row, patch);
        return { data: found, error: null };
      };
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return chain;
        },
        is: (column: string, value: unknown) => {
          filters.push((row) => (row[column] ?? null) === value);
          return chain;
        },
        delete: () => {
          removing = true;
          return chain;
        },
        insert: (row: Row) => {
          inserted = row;
          return chain;
        },
        update: (row: Row) => {
          patch = row;
          return chain;
        },
        maybeSingle: () => {
          const result = run();
          return Promise.resolve({
            data: Array.isArray(result.data) ? (result.data[0] ?? null) : null,
            error: result.error,
          });
        },
        then: (resolve: (value: unknown) => unknown) => resolve(run()),
      };
      return chain;
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: unknown) => {
          storedObjects[`${bucket}/${path}`] = body;
          return { error: null };
        },
        remove: async (paths: string[]) => {
          for (const path of paths) delete storedObjects[`${bucket}/${path}`];
          return { error: null };
        },
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://signed/${bucket}/${path}` },
          error: null,
        }),
      }),
    },
  };
}

const assertTenant = async () => {
  if (tenantBlocked) throw new Error("A assinatura desta escola está suspensa.");
};
vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => memoryDb(),
  resolveSgaMembershipAdmin: async () => membership,
  assertTenantAllowsWrites: assertTenant,
  requireSgaWriterForWrite: async (_module: string, _userId: string, roles: string[]) => {
    if (!membership || !roles.includes(membership.appRole)) {
      throw new Error("Sem permissão para esta operação na escola.");
    }
    await assertTenant();
    return membership;
  },
}));
vi.mock("@/features/academic/task-notify", () => ({
  notifyTaskReturned: (...args: unknown[]) => notifyTaskReturned(...args),
}));
vi.mock("@/features/saas/tenant-limits-server", () => ({
  assertCanStoreBytesForSchool: (...args: unknown[]) => assertCanStoreBytes(...args),
}));
vi.mock("@/features/academic/assessment-score-write", () => ({
  writeAssessmentScores: (...args: unknown[]) => writeAssessmentScores(...args),
}));
vi.mock("./own-teacher", () => ({ ownTeacherId: async () => ownTeacher }));
vi.mock("@/features/academic/own-teacher", () => ({ ownTeacherId: async () => ownTeacher }));
vi.mock("@/features/dashboard/student-access", () => ({
  resolveVisibleStudent: async () =>
    visibleStudent && membership
      ? { db: memoryDb(), schoolId: membership.schoolId, studentId: visibleStudent }
      : null,
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = {
      validator: (parse: (input: unknown) => unknown) => {
        fn.parse = parse;
        return fn;
      },
      middleware: () => fn,
      handler:
        (h: (ctx: { data: unknown; context: { userId: string } }) => unknown) =>
        (call: { data: unknown }) =>
          h({ data: fn.parse(call.data), context: { userId: "u1" } }),
      parse: (input: unknown) => input,
    };
    return fn;
  },
}));

const server = await import("@/features/academic/task-submissions-server");

const S = "00000000-0000-0000-0000-00000000000a";
const TASK = "00000000-0000-0000-0000-0000000000f1";
const E1 = "00000000-0000-0000-0000-0000000000e1";
const E2 = "00000000-0000-0000-0000-0000000000e2";
const ITEM = "00000000-0000-0000-0000-0000000000a1";
const OTHER_ITEM = "00000000-0000-0000-0000-0000000000a2";

beforeEach(() => {
  membership = { schoolId: S, appRole: "Aluno" };
  ownTeacher = null;
  visibleStudent = "st1";
  tenantBlocked = false;
  storedObjects = {};
  failSubmissionInsert = false;
  assertCanStoreBytes.mockReset();
  notifyTaskReturned.mockReset();
  writeAssessmentScores.mockReset();
  writeAssessmentScores.mockResolvedValue({ saved: 1 });
  tables = {
    siga_class_tasks: [
      {
        id: TASK,
        school_id: S,
        class_subject_id: "cs1",
        status: "published",
        due_on: "2099-12-31",
        accepts_late: false,
        title: "Resumo",
      },
    ],
    class_subjects: [
      { id: "cs1", school_id: S, class_group_id: "cg1", subject_id: "mat", teacher_id: "t1" },
    ],
    siga_assessment_items: [
      {
        id: ITEM,
        school_id: S,
        class_group_id: "cg1",
        subject_id: "mat",
        term: 1,
        name: "Trabalho 1",
        max_score: 20,
      },
      {
        id: OTHER_ITEM,
        school_id: S,
        class_group_id: "cg1",
        subject_id: "por",
        term: 1,
        name: "Redacção",
        max_score: 20,
      },
    ],
    siga_assessment_scores: [],
    enrollments: [
      { id: E1, school_id: S, student_id: "st1", class_group_id: "cg1", status: "active" },
      { id: E2, school_id: S, student_id: "st2", class_group_id: "cg2", status: "active" },
    ],
    students: [{ id: "st1", school_id: S, person_id: "p1" }],
    people: [{ id: "p1", school_id: S, full_name: "Ana" }],
    siga_class_task_submissions: [],
  };
});

describe("entregas no servidor", () => {
  it("o aluno entrega e reenvia na sua matrícula; a nota fica escondida até devolver", async () => {
    expect(await server.submitTaskWork({ data: { taskId: TASK, body: "v1" } })).toEqual({
      attempt: 1,
      late: false,
    });
    expect(await server.submitTaskWork({ data: { taskId: TASK, body: "v2" } })).toMatchObject({
      attempt: 2,
    });
    const mine = await server.getMyTaskSubmission({ data: { taskId: TASK } });
    expect(mine).toMatchObject({ canSubmit: true, submission: { attempt: 2, grade: null } });
  });

  it("o encarregado vê, mas não entrega", async () => {
    membership = { schoolId: S, appRole: "Encarregado" };
    await expect(server.submitTaskWork({ data: { taskId: TASK, body: "x" } })).rejects.toThrow(
      "Só o aluno pode entregar o trabalho.",
    );
    expect(await server.getMyTaskSubmission({ data: { taskId: TASK } })).toMatchObject({
      canSubmit: false,
    });
  });

  it("aluno de outra turma não vê nem entrega", async () => {
    visibleStudent = "st2";
    await expect(server.submitTaskWork({ data: { taskId: TASK, body: "x" } })).rejects.toThrow(
      "Tarefa não encontrada.",
    );
  });

  it("depois do prazo, numa tarefa que não aceita atrasos, recusa", async () => {
    tables.siga_class_tasks![0]!.due_on = "2000-01-01";
    await expect(server.submitTaskWork({ data: { taskId: TASK, body: "x" } })).rejects.toThrow(
      "não aceita entregas atrasadas",
    );
  });

  it("professor de outra disciplina é recusado; o da disciplina vê e devolve uma vez", async () => {
    await server.submitTaskWork({ data: { taskId: TASK, body: "v1" } });
    membership = { schoolId: S, appRole: "Professor" };
    ownTeacher = "t9";
    await expect(server.listTaskSubmissions({ data: { taskId: TASK } })).rejects.toThrow(
      "Só o professor desta disciplina",
    );

    ownTeacher = "t1";
    const listed = await server.listTaskSubmissions({ data: { taskId: TASK } });
    expect(listed).toMatchObject({ title: "Resumo", acceptsLate: false });
    const [line] = listed.lines;
    expect(line).toMatchObject({ studentName: "Ana", attempts: 1 });
    const submissionId = String(line!.submission!.id);
    await server.returnTaskSubmission({ data: { taskId: TASK, submissionId, grade: 15 } });
    await expect(
      server.returnTaskSubmission({ data: { taskId: TASK, submissionId, grade: 18 } }),
    ).rejects.toThrow("já foi devolvida");

    membership = { schoolId: S, appRole: "Aluno" };
    expect(await server.getMyTaskSubmission({ data: { taskId: TASK } })).toMatchObject({
      submission: { status: "returned", grade: 15 },
    });
    await expect(server.submitTaskWork({ data: { taskId: TASK, body: "v2" } })).rejects.toThrow(
      "já devolveu",
    );
  });

  it("entrega em papel só para alunos matriculados na turma da tarefa", async () => {
    membership = { schoolId: S, appRole: "Secretaria" };
    expect(
      await server.recordPaperSubmission({ data: { taskId: TASK, enrollmentId: E1 } }),
    ).toEqual({ attempt: 1 });
    await expect(
      server.recordPaperSubmission({ data: { taskId: TASK, enrollmentId: E2 } }),
    ).rejects.toThrow("não está matriculado nesta turma");
  });

  it("escola suspensa: o aluno não entrega e o professor não devolve", async () => {
    tenantBlocked = true;
    await expect(server.submitTaskWork({ data: { taskId: TASK, body: "x" } })).rejects.toThrow(
      "suspensa",
    );
    membership = { schoolId: S, appRole: "Secretaria" };
    await expect(
      server.recordPaperSubmission({ data: { taskId: TASK, enrollmentId: E1 } }),
    ).rejects.toThrow("suspensa");
    expect(tables.siga_class_task_submissions).toHaveLength(0);
  });

  it("a tarefa só conta para avaliações da mesma turma e disciplina", async () => {
    membership = { schoolId: S, appRole: "Professor" };
    ownTeacher = "t1";
    await expect(
      server.linkTaskAssessment({ data: { taskId: TASK, itemId: OTHER_ITEM } }),
    ).rejects.toThrow("não é desta turma e disciplina");
    await server.linkTaskAssessment({ data: { taskId: TASK, itemId: ITEM } });
    expect(tables.siga_class_tasks![0]!.assessment_item_id).toBe(ITEM);
    const listed = await server.listTaskSubmissions({ data: { taskId: TASK } });
    expect(listed.assessment).toMatchObject({ id: ITEM, name: "Trabalho 1" });
    expect(listed.assessmentOptions.map((option) => option.id)).toEqual([ITEM]);

    ownTeacher = "t9";
    await expect(
      server.linkTaskAssessment({ data: { taskId: TASK, itemId: null } }),
    ).rejects.toThrow("Só o professor desta disciplina");
  });

  it("devolver com nota numa tarefa ligada lança a nota na pauta, antes de marcar devolvida", async () => {
    await server.submitTaskWork({ data: { taskId: TASK, body: "v1" } });
    tables.siga_class_tasks![0]!.assessment_item_id = ITEM;
    membership = { schoolId: S, appRole: "Professor" };
    ownTeacher = "t1";
    const submissionId = String(tables.siga_class_task_submissions![0]!.id);

    // A pauta recusa (ex.: período fechado): a entrega fica por devolver.
    writeAssessmentScores.mockRejectedValueOnce(new Error("O 1º trimestre está fechado."));
    await expect(
      server.returnTaskSubmission({ data: { taskId: TASK, submissionId, grade: 15 } }),
    ).rejects.toThrow("fechado");
    // A entrega volta exactamente ao que era: sem nota nem data de devolução.
    expect(tables.siga_class_task_submissions![0]).toMatchObject({
      status: "submitted",
      grade: null,
      returned_at: null,
    });

    expect(
      await server.returnTaskSubmission({ data: { taskId: TASK, submissionId, grade: 15 } }),
    ).toEqual({ ok: true, pauta: true });
    expect(writeAssessmentScores).toHaveBeenLastCalledWith(expect.anything(), {
      schoolId: S,
      userId: "u1",
      itemId: ITEM,
      rows: [{ enrollmentId: E1, score: 15 }],
    });
    expect(tables.siga_class_task_submissions![0]!.status).toBe("returned");
    // Só depois de devolvida (a tentativa recusada pela pauta não avisou ninguém).
    expect(notifyTaskReturned).toHaveBeenCalledTimes(1);
    expect(notifyTaskReturned).toHaveBeenCalledWith(expect.anything(), {
      schoolId: S,
      taskId: TASK,
      taskTitle: "Resumo",
      subjectId: "mat",
      enrollmentId: E1,
      grade: 15,
      feedback: null,
      toPauta: true,
    });
  });

  it("dois professores a devolver ao mesmo tempo: só um ganha, e a pauta leva a nota dele", async () => {
    await server.submitTaskWork({ data: { taskId: TASK, body: "v1" } });
    tables.siga_class_tasks![0]!.assessment_item_id = ITEM;
    membership = { schoolId: S, appRole: "Professor" };
    ownTeacher = "t1";
    const submissionId = String(tables.siga_class_task_submissions![0]!.id);

    const results = await Promise.allSettled([
      server.returnTaskSubmission({ data: { taskId: TASK, submissionId, grade: 12 } }),
      server.returnTaskSubmission({ data: { taskId: TASK, submissionId, grade: 15 } }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(writeAssessmentScores).toHaveBeenCalledTimes(1);
    const pautaScore = writeAssessmentScores.mock.calls[0]![1].rows[0].score;
    expect(tables.siga_class_task_submissions![0]!.grade).toBe(pautaScore);
  });

  it("sem nota, ou sem avaliação ligada, a pauta não é tocada", async () => {
    await server.submitTaskWork({ data: { taskId: TASK, body: "v1" } });
    membership = { schoolId: S, appRole: "Administrador" };
    const submissionId = String(tables.siga_class_task_submissions![0]!.id);
    expect(
      await server.returnTaskSubmission({ data: { taskId: TASK, submissionId, grade: 12 } }),
    ).toEqual({ ok: true, pauta: false });
    expect(writeAssessmentScores).not.toHaveBeenCalled();
  });

  it("configuração: o professor da disciplina edita, arquiva e reabre", async () => {
    membership = { schoolId: S, appRole: "Professor" };
    ownTeacher = "t1";
    const settings = {
      taskId: TASK,
      title: "Resumo do cap. 4",
      kind: "pesquisa" as const,
      description: "Duas páginas",
      dueOn: "2099-06-30",
      acceptsLate: true,
      archived: false,
    };
    await server.updateTaskSettings({ data: settings });
    expect(tables.siga_class_tasks![0]).toMatchObject({
      title: "Resumo do cap. 4",
      kind: "pesquisa",
      description: "Duas páginas",
      due_on: "2099-06-30",
      accepts_late: true,
      status: "published",
    });
    const listed = await server.listTaskSubmissions({ data: { taskId: TASK } });
    expect(listed).toMatchObject({
      kind: "pesquisa",
      description: "Duas páginas",
      archived: false,
    });

    await server.updateTaskSettings({ data: { ...settings, archived: true } });
    expect(tables.siga_class_tasks![0]!.status).toBe("archived");
    // Arquivado: o aluno já não entrega.
    membership = { schoolId: S, appRole: "Aluno" };
    await expect(server.submitTaskWork({ data: { taskId: TASK, body: "x" } })).rejects.toThrow(
      "já não aceita entregas",
    );

    membership = { schoolId: S, appRole: "Professor" };
    ownTeacher = "t9";
    await expect(server.updateTaskSettings({ data: settings })).rejects.toThrow(
      "Só o professor desta disciplina",
    );
    // O validador lança antes de haver promessa: envolvê-lo numa.
    await expect(
      Promise.resolve().then(() =>
        server.updateTaskSettings({ data: { ...settings, kind: "exame" as never } }),
      ),
    ).rejects.toThrow("Invalid option");
  });

  it("a lista leva todas as tentativas de cada aluno e o resumo da turma", async () => {
    await server.submitTaskWork({ data: { taskId: TASK, body: "v1" } });
    await server.submitTaskWork({ data: { taskId: TASK, body: "v2" } });
    membership = { schoolId: S, appRole: "Secretaria" };
    const listed = await server.listTaskSubmissions({ data: { taskId: TASK } });
    const [line] = listed.lines;
    expect(line!.history.map((sub) => sub.body)).toEqual(["v2", "v1"]);
    expect(listed.summary).toMatchObject({ total: 1, delivered: 1, returned: 0 });
  });

  const pdf = (text = "%PDF-1.7 trabalho") => Buffer.from(text).toString("base64");

  it("o aluno entrega só com a foto ou o PDF; fica na sua área pessoal, privado", async () => {
    const attachment = { name: "../caderno.pdf", contentType: "application/pdf", base64: pdf() };
    expect(await server.submitTaskWork({ data: { taskId: TASK, attachment } })).toMatchObject({
      attempt: 1,
    });
    const [file] = tables.siga_files!;
    expect(file).toMatchObject({
      school_id: S,
      owner_user_id: "u1",
      name: "caderno.pdf",
      mime: "application/pdf",
      area: "pessoal",
      visibility: "private",
      storage_backend: "sga",
      class_group_id: "cg1",
    });
    expect(String(file!.storage_path)).toMatch(
      new RegExp(`^${S}/trabalhos/${TASK}/${E1}/.+\\.pdf$`),
    );
    expect(Object.keys(storedObjects)).toEqual([`siga-files/${file!.storage_path}`]);
    expect(assertCanStoreBytes).toHaveBeenCalledWith(S, 17);
    const [sub] = tables.siga_class_task_submissions!;
    expect(sub).toMatchObject({ file_id: file!.id, body: null });

    const mine = await server.getMyTaskSubmission({ data: { taskId: TASK } });
    expect(mine.submission?.file).toMatchObject({ name: "caderno.pdf", sizeBytes: 17 });
  });

  it("sem texto nem anexo, ou com bytes que não são do tipo, recusa sem guardar nada", async () => {
    await expect(
      Promise.resolve().then(() => server.submitTaskWork({ data: { taskId: TASK } })),
    ).rejects.toThrow("Escreva a resposta ou anexe o trabalho.");
    const fake = {
      name: "x.pdf",
      contentType: "application/pdf",
      base64: Buffer.from("<html>").toString("base64"),
    };
    await expect(
      server.submitTaskWork({ data: { taskId: TASK, attachment: fake } }),
    ).rejects.toThrow("não é um PDF nem uma imagem");
    await expect(
      Promise.resolve().then(() =>
        server.submitTaskWork({
          data: { taskId: TASK, attachment: { ...fake, contentType: "text/html" } },
        }),
      ),
    ).rejects.toThrow("Envie um PDF ou uma imagem");
    expect(tables.siga_files ?? []).toHaveLength(0);
    expect(storedObjects).toEqual({});
  });

  it("quota do plano esgotada, ou a entrega falha: o anexo não fica órfão", async () => {
    const attachment = { name: "a.pdf", contentType: "application/pdf", base64: pdf() };
    assertCanStoreBytes.mockRejectedValueOnce(new Error("O espaço de arquivo do plano acabou."));
    await expect(server.submitTaskWork({ data: { taskId: TASK, attachment } })).rejects.toThrow(
      "espaço de arquivo",
    );
    expect(storedObjects).toEqual({});

    failSubmissionInsert = true;
    await expect(server.submitTaskWork({ data: { taskId: TASK, attachment } })).rejects.toThrow();
    expect(tables.siga_files ?? []).toHaveLength(0);
    expect(storedObjects).toEqual({});
  });

  it("abrir o anexo: o aluno e o professor da disciplina; outro aluno ou professor não", async () => {
    await server.submitTaskWork({
      data: {
        taskId: TASK,
        attachment: { name: "a.pdf", contentType: "application/pdf", base64: pdf() },
      },
    });
    const submissionId = String(tables.siga_class_task_submissions![0]!.id);
    const open = () => server.openTaskSubmissionFile({ data: { taskId: TASK, submissionId } });

    expect(await open()).toMatchObject({ name: "a.pdf" });
    expect((await open()).url).toContain("https://signed/siga-files/");

    visibleStudent = null; // aluno ou encarregado sem acesso a este aluno
    await expect(open()).rejects.toThrow("Sem permissão");

    membership = { schoolId: S, appRole: "Professor" };
    ownTeacher = "t9";
    await expect(open()).rejects.toThrow("Só o professor desta disciplina");
    ownTeacher = "t1";
    expect(await open()).toMatchObject({ name: "a.pdf" });

    // Ficheiro apagado nos Arquivos: deixa de abrir.
    tables.siga_files![0]!.deleted_at = "2026-11-01T00:00:00Z";
    await expect(open()).rejects.toThrow("já não existe");
  });

  it("o professor regista a entrega em papel com a foto do caderno", async () => {
    membership = { schoolId: S, appRole: "Professor" };
    ownTeacher = "t1";
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64");
    await server.recordPaperSubmission({
      data: {
        taskId: TASK,
        enrollmentId: E1,
        attachment: { name: "IMG_0001.jpg", contentType: "image/jpeg", base64: jpg },
      },
    });
    const [sub] = tables.siga_class_task_submissions!;
    const [file] = tables.siga_files!;
    expect(sub).toMatchObject({ on_paper: true, file_id: file!.id });
    expect(file).toMatchObject({ owner_user_id: "u1", mime: "image/jpeg", name: "IMG_0001.jpg" });
    // O aluno vê a foto da sua entrega.
    membership = { schoolId: S, appRole: "Aluno" };
    const mine = await server.getMyTaskSubmission({ data: { taskId: TASK } });
    expect(mine.submission).toMatchObject({ onPaper: true, file: { name: "IMG_0001.jpg" } });
  });

  it("ligada à pauta depois de devolver: as notas já devolvidas vão para a pauta", async () => {
    await server.submitTaskWork({ data: { taskId: TASK, body: "v1" } });
    membership = { schoolId: S, appRole: "Professor" };
    ownTeacher = "t1";
    const submissionId = String(tables.siga_class_task_submissions![0]!.id);
    await server.returnTaskSubmission({ data: { taskId: TASK, submissionId, grade: 14 } });
    expect(writeAssessmentScores).not.toHaveBeenCalled();

    await expect(server.syncTaskGradesToPauta({ data: { taskId: TASK } })).rejects.toThrow(
      "Ligue primeiro",
    );
    await server.linkTaskAssessment({ data: { taskId: TASK, itemId: ITEM } });
    expect(await server.syncTaskGradesToPauta({ data: { taskId: TASK } })).toEqual({ saved: 1 });
    expect(writeAssessmentScores).toHaveBeenCalledWith(expect.anything(), {
      schoolId: S,
      userId: "u1",
      itemId: ITEM,
      rows: [{ enrollmentId: E1, score: 14 }],
    });

    ownTeacher = "t9";
    await expect(server.syncTaskGradesToPauta({ data: { taskId: TASK } })).rejects.toThrow(
      "Só o professor desta disciplina",
    );
  });
});
