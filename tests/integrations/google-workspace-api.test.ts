import { describe, expect, it, vi } from "vitest";
import { createWorkspaceApi } from "@/integrations/google/workspace-api";
import type { WorkspaceService } from "@/integrations/google/workspace-services";

const response = {
  id: "provider-confirmed-id", documentId: "google-doc-id",
  spreadsheetId: "google-sheet-id",
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/google-sheet-id",
  files: [{ id: "file-1", name: "SIGA" }],
  courses: [{ id: "course-1", name: "Matemática" }],
  items: [{ id: "item-1" }], updates: { updatedRows: 2 },
};

function mockApi(httpStatus = 200, payload: Record<string, unknown> = response) {
  const tokens: WorkspaceService[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  const api = createWorkspaceApi(
    async (service) => { tokens.push(service); return "mock-access-token"; },
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(payload), {
        status: httpStatus, headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch,
  );
  return { api, tokens, calls };
}

describe("Google Workspace: mocked functional integration", () => {
  it("scopes the Drive file list to drive.file and limits pagination", async () => {
    const { api, tokens, calls } = mockApi();
    expect(await api.driveList(900)).toEqual([{ id: "file-1", name: "SIGA" }]);
    expect(tokens).toEqual(["drive"]);
    expect(calls[0].url).toContain("pageSize=100");
    expect(calls[0].init.redirect).toBe("error");
    expect(new Headers(calls[0].init.headers).get("Authorization"))
      .toBe("Bearer mock-access-token");
  });

  it("creates a Drive folder without exposing unrestricted Drive scopes", async () => {
    const { api, calls, tokens } = mockApi();
    expect((await api.driveFolder("SIGA", "parent-id")).id).toBe("provider-confirmed-id");
    expect(tokens).toEqual(["drive"]);
    expect(JSON.parse(String(calls[0].init.body)).parents).toEqual(["parent-id"]);
  });

  it("uploads text bytes to a Drive file through the multipart endpoint", async () => {
    const { api, calls } = mockApi();
    expect((await api.driveTextFile("plano.txt", "Plano de aula")).id)
      .toBe("provider-confirmed-id");
    expect(calls[0].url).toContain("uploadType=multipart");
    expect(String(calls[0].init.body)).toContain("Plano de aula");
    expect(new Headers(calls[0].init.headers).get("Content-Type")).toContain("multipart/related");
  });

  it("creates Docs and Sheets with Google-confirmed identifiers", async () => {
    const { api, tokens } = mockApi();
    expect((await api.docsCreate("Contrato")).documentId).toBe("google-doc-id");
    expect((await api.sheetsCreate("Pauta")).spreadsheetId).toBe("google-sheet-id");
    expect(tokens).toEqual(["docs", "sheets"]);
  });

  it("appends grade data as RAW values to avoid spreadsheet formula evaluation", async () => {
    const { api, calls } = mockApi();
    expect(await api.sheetsAppend("sheet-1", "A1", [["Aluno", "Média"], ["Ana", 15]]))
      .toEqual({ updatedRows: 2 });
    expect(calls[0].url).toContain("valueInputOption=RAW");
    expect(JSON.parse(String(calls[0].init.body)).values[1][1]).toBe(15);
  });

  it("lists, creates and invites into Classroom with the user's own ownership", async () => {
    const { api, calls, tokens } = mockApi();
    expect(await api.classroomList()).toHaveLength(1);
    expect((await api.classroomCreate("10ª A", "Matemática")).id).toBe("provider-confirmed-id");
    expect(JSON.parse(String(calls[1].init.body)).ownerId).toBe("me");
    expect((await api.classroomInvite("course-1", "aluno@escola.ao", "STUDENT")).id)
      .toBe("provider-confirmed-id");
    expect(JSON.parse(String(calls[2].init.body)).role).toBe("STUDENT");
    expect(tokens).toEqual(["classroom", "classroom", "classroom"]);
  });

  it("lists and creates Calendar events with the Angola timezone", async () => {
    const { api, calls } = mockApi();
    expect(await api.calendarList("2026-09-25T10:00:00+01:00")).toHaveLength(1);
    expect((await api.calendarCreate({ title: "Exame", start: "2026-09-25T10:00:00+01:00",
      end: "2026-09-25T12:00:00+01:00" })).id).toBe("provider-confirmed-id");
    expect(JSON.parse(String(calls[1].init.body)).start.timeZone).toBe("Africa/Luanda");
  });

  it("sends real-formatted Gmail MIME only after the provider returns an ID", async () => {
    const { api, calls, tokens } = mockApi();
    expect((await api.gmailSend("destinatario@escola.ao", "Aviso", "Bom dia")).id)
      .toBe("provider-confirmed-id");
    expect(tokens).toEqual(["gmail"]);
    const raw = JSON.parse(String(calls[0].init.body)).raw;
    expect(Buffer.from(raw, "base64url").toString("utf8")).toContain("Bom dia");
  });

  it("lists and creates personal Google Tasks", async () => {
    const { api, tokens } = mockApi();
    expect(await api.tasksList()).toHaveLength(1);
    expect((await api.tasksCreate("Preparar exame")).id).toBe("provider-confirmed-id");
    expect(tokens).toEqual(["tasks", "tasks", "tasks", "tasks"]);
  });

  it.each([401, 403, 429, 500])("rejects Google HTTP %s without claiming delivery", async (status) => {
    const { api } = mockApi(status);
    await expect(api.gmailSend("x@y.ao", "Assunto", "Corpo")).rejects.toThrow();
  });

  it("rejects a forged success lacking a provider-confirmed identifier", async () => {
    const { api } = mockApi(200, {});
    await expect(api.gmailSend("x@y.ao", "Assunto", "Corpo")).rejects.toThrow("identificador");
    await expect(api.classroomCreate("Turma")).rejects.toThrow("identificador");
    await expect(api.sheetsCreate("Pauta")).rejects.toThrow("Google Sheets");
  });

  it("blocks MIME header injection", async () => {
    const { api, calls } = mockApi();
    await expect(api.gmailSend("x@y.ao\r\nBcc: outro@y.ao", "Teste", "Corpo"))
      .rejects.toThrow("Cabeçalho");
    expect(calls).toHaveLength(0);
  });

  it("stress-tests 1,400 mocked operations without sending messages or using real quota", async () => {
    const { api, calls } = mockApi();
    const scenarios = [
      () => api.driveList(2), () => api.driveFolder("Turmas"),
      () => api.driveTextFile("a.txt", "Olá"),
      () => api.docsCreate("Regulamento"), () => api.sheetsCreate("Pauta"),
      () => api.sheetsAppend("sheet", "A1", [["Nome"], ["Ana"]]),
      () => api.classroomList(), () => api.classroomCreate("10ª A"),
      () => api.classroomInvite("curso", "a@escola.ao", "STUDENT"),
      () => api.calendarList("2026-09-25T10:00:00+01:00"),
      () => api.calendarCreate({ title: "Aula", start: "2026-09-25T10:00:00+01:00",
        end: "2026-09-25T11:00:00+01:00" }),
      () => api.gmailSend("a@escola.ao", "Assunto", "Aviso"),
      () => api.tasksList(), () => api.tasksCreate("Rever pauta"),
    ];
    for (let round = 0; round < 100; round++) {
      await Promise.all(scenarios.map((scenario) => scenario()));
    }
    // Tasks resolves a real list ID before each of its two operations.
    expect(calls).toHaveLength(1_600);
    expect(calls.every(({ url }) => url.startsWith("https://"))).toBe(true);
  });
});
