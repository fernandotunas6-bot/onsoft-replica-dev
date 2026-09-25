import type { WorkspaceService } from "./workspace-services";

/**
 * Real Google REST operations. All URLs are fixed trusted Google endpoints,
 * tokens are supplied by the encrypted server-side vault and never returned.
 * This module is also testable with a mocked fetch (no paid API calls).
 */
type GoogleFetch = typeof fetch;
type ServiceToken = (service: WorkspaceService) => Promise<string>;
type JsonObject = Record<string, unknown>;
type FileRecord = { id: string; name?: string; webViewLink?: string; mimeType?: string };
const BASE = {
  drive: "https://www.googleapis.com/drive/v3",
  driveUpload: "https://www.googleapis.com/upload/drive/v3",
  docs: "https://docs.googleapis.com/v1",
  sheets: "https://sheets.googleapis.com/v4",
  classroom: "https://classroom.googleapis.com/v1",
  calendar: "https://www.googleapis.com/calendar/v3",
  gmail: "https://gmail.googleapis.com/gmail/v1",
  tasks: "https://tasks.googleapis.com/tasks/v1",
} as const;

function requiredId(value: unknown, action: string): string {
  if (!value || typeof value !== "object" ||
    typeof (value as JsonObject)["id"] !== "string" ||
    !(value as JsonObject)["id"]) {
    throw new Error(`O Google não confirmou ${action} (identificador em falta).`);
  }
  return (value as { id: string }).id;
}

function cleanHeader(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error("Cabeçalho de e-mail inválido.");
  return value;
}

export function createWorkspaceApi(tokenFor: ServiceToken, fetcher: GoogleFetch = fetch) {
  async function request<T>(
    service: WorkspaceService, endpoint: string, init: RequestInit = {},
  ): Promise<T> {
    // No arbitrary URLs or redirects can be supplied by app users.
    const token = await tokenFor(service);
    if (!token) throw new Error("Autorização Google em falta.");
    const response = await fetcher(endpoint, {
      ...init,
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.body && !(init.headers && new Headers(init.headers).has("Content-Type"))
          ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error("Autorização Google expirada ou revogada.");
      if (response.status === 403) throw new Error("A conta Google não tem permissão ou quota disponível.");
      if (response.status === 429) throw new Error("Limite de pedidos Google atingido. Tente mais tarde.");
      throw new Error(`Operação ${service} rejeitada pelo Google (HTTP ${response.status}).`);
    }
    return (await response.json()) as T;
  }
  const enc = encodeURIComponent;
  return {
    async driveList(pageSize = 50): Promise<FileRecord[]> {
      const params = new URLSearchParams({
        pageSize: String(Math.min(Math.max(pageSize, 1), 100)),
        fields: "nextPageToken,files(id,name,mimeType,webViewLink)",
        q: "trashed = false",
      });
      const data = await request<{ files?: FileRecord[] }>("drive", `${BASE.drive}/files?${params}`);
      return data.files ?? [];
    },
    async driveFolder(name: string, parentId?: string): Promise<FileRecord> {
      const data = await request<FileRecord>("drive", `${BASE.drive}/files?fields=id,name,webViewLink`, {
        method: "POST",
        body: JSON.stringify({
          name,
          mimeType: "application/vnd.google-apps.folder",
          ...(parentId ? { parents: [parentId] } : {}),
        }),
      });
      requiredId(data, "a criação da pasta");
      return data;
    },
    async driveTextFile(name: string, text: string, parentId?: string): Promise<FileRecord> {
      const boundary = `siga-${crypto.randomUUID()}`;
      const metadata = JSON.stringify({ name, mimeType: "text/plain",
        ...(parentId ? { parents: [parentId] } : {}) });
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--\r\n`;
      const data = await request<FileRecord>("drive",
        `${BASE.driveUpload}/files?uploadType=multipart&fields=id,name,webViewLink`, {
          method: "POST",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body,
        });
      requiredId(data, "a gravação do ficheiro");
      return data;
    },
    async docsCreate(title: string): Promise<{ documentId: string; title?: string }> {
      const data = await request<{ documentId?: string; title?: string }>("docs",
        `${BASE.docs}/documents`, { method: "POST", body: JSON.stringify({ title }) });
      if (!data.documentId) throw new Error("O Google Docs não devolveu um documento.");
      return { documentId: data.documentId, title: data.title };
    },
    async sheetsCreate(title: string): Promise<{ spreadsheetId: string; spreadsheetUrl?: string }> {
      const data = await request<{ spreadsheetId?: string; spreadsheetUrl?: string }>("sheets",
        `${BASE.sheets}/spreadsheets`, {
          method: "POST",
          body: JSON.stringify({ properties: { title } }),
        });
      if (!data.spreadsheetId) throw new Error("O Google Sheets não devolveu uma folha.");
      return { spreadsheetId: data.spreadsheetId, spreadsheetUrl: data.spreadsheetUrl };
    },
    async sheetsAppend(spreadsheetId: string, range: string, rows: (string | number)[][]) {
      // RAW prevents imported academic data from being interpreted as formulas.
      const params = new URLSearchParams({ valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" });
      const data = await request<{ updates?: { updatedRows?: number } }>("sheets",
        `${BASE.sheets}/spreadsheets/${enc(spreadsheetId)}/values/${enc(range)}:append?${params}`, {
          method: "POST",
          body: JSON.stringify({ range, majorDimension: "ROWS", values: rows }),
        });
      return { updatedRows: data.updates?.updatedRows ?? 0 };
    },
    async classroomList(): Promise<Array<{ id: string; name: string; section?: string }>> {
      const data = await request<{ courses?: Array<{ id: string; name: string; section?: string }> }>(
        "classroom", `${BASE.classroom}/courses?pageSize=50`);
      return data.courses ?? [];
    },
    async classroomCreate(name: string, section?: string) {
      const data = await request<{ id: string; name?: string; alternateLink?: string }>(
        "classroom", `${BASE.classroom}/courses`, {
          method: "POST",
          body: JSON.stringify({ name, section, ownerId: "me", courseState: "PROVISIONED" }),
        });
      requiredId(data, "a criação da turma Classroom");
      return data;
    },
    async classroomInvite(courseId: string, email: string, role: "STUDENT" | "TEACHER") {
      const data = await request<{ id: string; courseId?: string }>(
        "classroom", `${BASE.classroom}/invitations`, {
          method: "POST",
          body: JSON.stringify({ courseId, userId: email, role }),
        });
      requiredId(data, "o convite Classroom");
      return data;
    },
    async calendarList(timeMin: string) {
      const params = new URLSearchParams({ timeMin, maxResults: "100",
        singleEvents: "true", orderBy: "startTime" });
      const data = await request<{ items?: JsonObject[] }>("calendar",
        `${BASE.calendar}/calendars/primary/events?${params}`);
      return data.items ?? [];
    },
    async calendarCreate(input: { title: string; start: string; end: string; description?: string }) {
      const data = await request<{ id: string; htmlLink?: string }>("calendar",
        `${BASE.calendar}/calendars/primary/events`, {
          method: "POST",
          body: JSON.stringify({
            summary: input.title, description: input.description,
            start: { dateTime: input.start, timeZone: "Africa/Luanda" },
            end: { dateTime: input.end, timeZone: "Africa/Luanda" },
          }),
        });
      requiredId(data, "o evento Calendar");
      return data;
    },
    async gmailSend(to: string, subject: string, bodyText: string) {
      cleanHeader(to);
      cleanHeader(subject);
      const raw = Buffer.from(
        `To: ${to}\r\nSubject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(bodyText, "utf8").toString("base64")}\r\n`,
        "utf8",
      ).toString("base64url");
      const data = await request<{ id: string; threadId?: string }>(
        "gmail", `${BASE.gmail}/users/me/messages/send`, {
          method: "POST", body: JSON.stringify({ raw }),
        });
      requiredId(data, "o envio do e-mail");
      return data;
    },
    async tasksList() {
      const data = await request<{ items?: JsonObject[] }>(
        "tasks", `${BASE.tasks}/lists/@default/tasks?maxResults=100`);
      return data.items ?? [];
    },
    async tasksCreate(title: string, notes?: string) {
      const data = await request<{ id: string; title?: string }>(
        "tasks", `${BASE.tasks}/lists/@default/tasks`, {
          method: "POST", body: JSON.stringify({ title, notes }),
        });
      requiredId(data, "a criação da tarefa");
      return data;
    },
  };
}
