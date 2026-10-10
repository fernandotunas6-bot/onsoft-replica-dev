import { parseNotificationInbox } from "../domain/notifications";
import {
  parseChatReceipt,
  type ChatCommand,
  parseChatInbox,
  parseChatHistory,
  type ChatCursor,
} from "../domain/institutional-chat";
import { parseStudentFinance } from "../domain/finance";
import { parseAcademicGradebooks } from "../domain/gradebooks";
import { parseAcademicResults } from "../domain/results";
import type { AcademicAttendance, AttendanceRange } from "../domain/attendance";
import { parseAcademicAttendance } from "../domain/attendance-validation";
import type { Gateway, Session, Context, Workspace, Command, Permission } from "../domain/model";
import { authorize, scopeWorkspace, required, validateCommand } from "../domain/policy";
import { importSigaDirectMessages } from "./chat-import";
import { parseAcademicCatalog } from "../domain/catalog-validation";
import type { AcademicCatalog } from "../domain/catalog";
import { parseTeacherDay, type TeacherDay } from "../domain/teacher-day";
import type { AttendanceStatus } from "../domain/model";
const allowedPermissions: readonly Permission[] = [
  "academic.read",
  "attendance.write",
  "grades.write",
  "tasks.write",
  "submissions.write",
  "messages.write",
  "documents.request",
];
export interface SessionTransport {
  /** Supply the current access token from the existing Supabase session.
   * The gateway never stores tokens or reads tokens from URLs/localStorage.
   */
  accessToken(): Promise<string | null>;
  subscribeChatChanged?(ctx: Context, listener: () => void): () => void;
  clearSession?(): Promise<void>;
  subscribeSessionChanged?(listener: () => void): () => void;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// Authenticated transport. No production endpoint is enabled by this module.
export class ApiGateway implements Gateway {
  private current: Session | null = null;
  private sessionRevision = 0;
  private invalidateSession() {
    this.sessionRevision++;
    this.current = null;
    this.workspaceCache.clear();
    this.pendingRequests.clear();
  }
  subscribeSessionChanged(listener: () => void): () => void {
    return (
      this.transport?.subscribeSessionChanged?.(() => {
        this.invalidateSession();
        listener();
      }) || (() => {})
    );
  }
  private workspaceCache = new Map<string, Workspace>();
  private pendingRequests = new Map<string, string>();
  private key(ctx: Context) {
    return `${ctx.userId}:${ctx.schoolId}:${ctx.role}`;
  }
  constructor(
    private base = "/api/mobile-v4",
    private transport?: SessionTransport,
  ) {
    if (
      !base.startsWith("/") ||
      base.startsWith("//") ||
      base.includes("..") ||
      base.includes("?") ||
      base.includes("#") ||
      base.includes("\\")
    )
      throw new Error("A API deve usar um caminho na mesma origem.");
  }
  private async request(path: string, signal?: AbortSignal, body?: unknown) {
    const revision = this.sessionRevision;
    const assertCurrentSession = () => {
      if (revision !== this.sessionRevision)
        throw new ApiError(401, "A sessão foi alterada. Volte a seleccionar a escola.");
    };
    const token = this.transport ? await this.transport.accessToken() : null;
    assertCurrentSession();
    if (this.transport && !token) {
      this.current = null;
      this.workspaceCache.clear();
      this.pendingRequests.clear();
      throw new ApiError(401, "Sessão expirada.");
    }
    const response = await fetch(this.base + path, {
      signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      method: body ? "POST" : "GET",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assertCurrentSession();
    if (!response.ok) {
      if (response.status === 401) {
        this.current = null;
        this.workspaceCache.clear();
        this.pendingRequests.clear();
      }
      throw new ApiError(
        response.status,
        response.status === 401
          ? "Sessão expirada."
          : response.status === 403
            ? "Sem autorização para esta escola ou operação."
            : response.status === 409
              ? "Os dados foram alterados. Actualize antes de voltar a guardar."
              : response.status === 422
                ? "Os dados enviados não passaram na validação institucional."
                : "Não foi possível concluir a operação (" + response.status + ").",
      );
    }
    const data = response.status === 204 ? null : await response.json();
    assertCurrentSession();
    return data;
  }
  async session(signal?: AbortSignal): Promise<Session | null> {
    this.current = null;
    this.workspaceCache.clear();
    const data = await this.request("/session", signal);
    if (data === null) return null;
    if (
      typeof data !== "object" ||
      Array.isArray(data) ||
      typeof data.userId !== "string" ||
      !data.userId.trim() ||
      typeof data.name !== "string" ||
      !data.name.trim() ||
      !Array.isArray(data.memberships) ||
      data.memberships.some(
        (m: Record<string, unknown>) =>
          !m ||
          typeof m !== "object" ||
          Array.isArray(m) ||
          typeof m.schoolId !== "string" ||
          !m.schoolId.trim() ||
          typeof m.schoolName !== "string" ||
          !m.schoolName.trim() ||
          typeof m.active !== "boolean" ||
          !Array.isArray(m.roles) ||
          !Array.isArray(m.permissions) ||
          (m.schoolLogoUrl != null &&
            (typeof m.schoolLogoUrl !== "string" ||
              !m.schoolLogoUrl.startsWith("/") ||
              m.schoolLogoUrl.startsWith("//"))) ||
          m.roles.some((role: unknown) => role !== "professor" && role !== "aluno") ||
          m.permissions.some(
            (permission: unknown) => !allowedPermissions.includes(permission as Permission),
          ),
      )
    )
      throw new Error("Contrato de sessão inválido.");
    return (this.current = { ...data, mode: "api" });
  }
  async academicCatalog(ctx: Context, signal?: AbortSignal): Promise<AcademicCatalog> {
    authorize(this.current, ctx);
    const data = await this.request(
      "/schools/" + encodeURIComponent(ctx.schoolId) + "/academic?role=" + ctx.role,
      signal,
    );
    return parseAcademicCatalog(data, ctx);
  }
  subscribeChatChanged(ctx: Context, listener: () => void) {
    authorize(this.current, ctx);
    return this.transport?.subscribeChatChanged?.(ctx, listener) ?? (() => {});
  }
  async chatCapabilities(ctx: Context, signal?: AbortSignal) {
    authorize(this.current, ctx);
    const data = await this.request(
      `/schools/${encodeURIComponent(ctx.schoolId)}/chat-capabilities?role=${ctx.role}`,
      signal,
    );
    if (
      !data ||
      typeof data !== "object" ||
      Object.keys(data).length !== 1 ||
      !("writes" in data) ||
      typeof data.writes !== "boolean"
    )
      throw new Error("Capacidades do chat inválidas.");
    return { writes: data.writes };
  }
  async chatCommand(ctx: Context, requestId: string, command: ChatCommand, signal?: AbortSignal) {
    authorize(this.current, ctx);
    return parseChatReceipt(
      await this.request(`/schools/${encodeURIComponent(ctx.schoolId)}/chat-commands`, signal, {
        role: ctx.role,
        requestId,
        command,
      }),
      command,
    );
  }
  async chatAttachment(ctx: Context, messageId: string, signal?: AbortSignal) {
    authorize(this.current, ctx);
    const data = await this.request(
      `/schools/${encodeURIComponent(ctx.schoolId)}/attachment?${new URLSearchParams({ role: ctx.role, messageId })}`,
      signal,
    );
    if (
      !data ||
      typeof data !== "object" ||
      Object.keys(data).length !== 1 ||
      !("url" in data) ||
      typeof data.url !== "string"
    )
      throw new Error("Resposta do anexo inválida.");
    const url = new URL(data.url);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "xodgfmxiaunpamctfeea.supabase.co" ||
      !url.pathname.startsWith("/storage/v1/object/sign/siga-files/") ||
      url.username ||
      url.password ||
      !url.searchParams.get("token")
    )
      throw new Error("Ligação do anexo inválida.");
    return { url: data.url };
  }
  async chatContacts(ctx: Context, signal?: AbortSignal) {
    authorize(this.current, ctx);
    const data = (await this.request(
      `/schools/${encodeURIComponent(ctx.schoolId)}/contacts?role=${ctx.role}`,
      signal,
    )) as {
      schoolId: string;
      userId: string;
      role: string;
      contacts: { id: string; name: string }[];
    };
    if (
      !data ||
      data.schoolId !== ctx.schoolId ||
      data.userId !== ctx.userId ||
      data.role !== ctx.role ||
      Object.keys(data).length !== 4 ||
      !Array.isArray(data.contacts) ||
      data.contacts.length > 1000 ||
      new Set(data.contacts.map((c) => c.id)).size !== data.contacts.length ||
      data.contacts.some(
        (c) =>
          !c ||
          Object.keys(c).length !== 2 ||
          !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(c.id) ||
          c.id === ctx.userId ||
          typeof c.name !== "string" ||
          !c.name.trim() ||
          c.name.length > 500,
      )
    )
      throw new Error("Contrato de contactos inválido.");
    return data.contacts;
  }
  async notifications(ctx: Context, signal?: AbortSignal) {
    authorize(this.current, ctx);
    return parseNotificationInbox(
      await this.request(
        "/schools/" + encodeURIComponent(ctx.schoolId) + "/notifications?role=" + ctx.role,
        signal,
      ),
      ctx,
    );
  }
  async chatInbox(ctx: Context, signal?: AbortSignal) {
    authorize(this.current, ctx);
    return parseChatInbox(
      await this.request(
        "/schools/" + encodeURIComponent(ctx.schoolId) + "/chat?role=" + ctx.role,
        signal,
      ),
      ctx,
    );
  }
  async chatHistory(
    ctx: Context,
    conversationId: string,
    before?: ChatCursor,
    signal?: AbortSignal,
  ) {
    authorize(this.current, ctx);
    const params = new URLSearchParams({
      role: ctx.role,
      conversationId,
      ...(before ? { before: before.date, beforeId: before.id } : {}),
    });
    return parseChatHistory(
      await this.request(
        "/schools/" + encodeURIComponent(ctx.schoolId) + "/chat?" + params,
        signal,
      ),
      ctx,
      conversationId,
      before,
    );
  }
  async studentFinance(ctx: Context, signal?: AbortSignal) {
    authorize(this.current, ctx);
    if (ctx.role !== "aluno")
      throw new ApiError(403, "As propinas são consultadas apenas pelo próprio aluno.");
    const data = await this.request(
      "/schools/" + encodeURIComponent(ctx.schoolId) + "/finance?role=" + ctx.role,
      signal,
    );
    return parseStudentFinance(data, ctx);
  }
  async academicGradebooks(ctx: Context, catalog: AcademicCatalog, signal?: AbortSignal) {
    authorize(this.current, ctx);
    if (ctx.role !== "professor")
      throw new ApiError(403, "A consulta dos diários é exclusiva do professor.");
    const data = await this.request(
      "/schools/" + encodeURIComponent(ctx.schoolId) + "/gradebooks?role=" + ctx.role,
      signal,
    );
    return parseAcademicGradebooks(data, ctx, catalog);
  }
  async academicResults(ctx: Context, catalog: AcademicCatalog, signal?: AbortSignal) {
    authorize(this.current, ctx);
    if (ctx.role !== "aluno")
      throw new ApiError(403, "A consulta das pautas publicadas é exclusiva do aluno.");
    const data = await this.request(
      "/schools/" + encodeURIComponent(ctx.schoolId) + "/results?role=" + ctx.role,
      signal,
    );
    return parseAcademicResults(data, ctx, catalog);
  }
  async academicAttendance(
    ctx: Context,
    range: AttendanceRange,
    catalog: AcademicCatalog,
    signal?: AbortSignal,
  ): Promise<AcademicAttendance> {
    authorize(this.current, ctx);
    const params = new URLSearchParams({ role: ctx.role, from: range.from, to: range.to });
    const data = await this.request(
      "/schools/" + encodeURIComponent(ctx.schoolId) + "/attendance?" + params,
      signal,
    );
    return parseAcademicAttendance(data, ctx, catalog, range);
  }
  async teacherDay(
    ctx: Context,
    catalog: AcademicCatalog,
    signal?: AbortSignal,
  ): Promise<TeacherDay> {
    authorize(this.current, ctx, "attendance.write");
    if (ctx.role !== "professor") throw new ApiError(403, "A chamada é exclusiva do professor.");
    const data = await this.request(
      "/schools/" + encodeURIComponent(ctx.schoolId) + "/lessons?role=professor",
      signal,
    );
    return parseTeacherDay(data, ctx, catalog);
  }
  /** Fecha a chamada de uma aula de hoje; o servidor volta a verificar tudo. */
  async recordAttendance(
    ctx: Context,
    catalog: AcademicCatalog,
    day: TeacherDay,
    sessionId: string,
    entries: { studentId: string; status: AttendanceStatus }[],
    signal?: AbortSignal,
  ) {
    authorize(this.current, ctx, required.attendance);
    const lesson = day.lessons.find((l) => l.sessionId === sessionId);
    const group = catalog.classes.find((c) => c.classSubjectId === lesson?.classSubjectId);
    if (ctx.role !== "professor" || day.schoolId !== ctx.schoolId || !lesson || !group)
      throw new Error("Aula fora do teu horário de hoje.");
    if (lesson.status !== "pending") throw new Error("Esta chamada já não está aberta.");
    const roster = new Set(group.students.map((s) => s.studentId));
    const ids = new Set(entries.map((e) => e.studentId));
    if (
      !entries.length ||
      ids.size !== entries.length ||
      entries.some((e) => !roster.has(e.studentId))
    )
      throw new Error("A chamada só pode incluir alunos desta turma, uma vez cada.");
    const command: Command = { type: "attendance", lessonId: sessionId, entries };
    const retryKey = this.key(ctx) + ":" + JSON.stringify(command);
    const requestId = this.pendingRequests.get(retryKey) ?? crypto.randomUUID();
    this.pendingRequests.set(retryKey, requestId);
    await this.request("/schools/" + encodeURIComponent(ctx.schoolId) + "/commands", signal, {
      role: ctx.role,
      command,
      requestId,
    });
    this.pendingRequests.delete(retryKey);
  }
  async workspace(ctx: Context, signal?: AbortSignal): Promise<Workspace> {
    authorize(this.current, ctx);
    const data = await this.request(
      "/schools/" + encodeURIComponent(ctx.schoolId) + "/workspace?role=" + ctx.role,
      signal,
    );
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("Contrato académico inválido.");
    const arrays = [
      "classes",
      "lessons",
      "grades",
      "attendance",
      "tasks",
      "submissions",
      "plans",
      "messages",
      "announcements",
      "documents",
    ] as const;
    if (data.schoolId !== ctx.schoolId) throw new Error("Resposta pertence a outra escola.");
    if (arrays.some((field) => !Array.isArray(data[field])))
      throw new Error("Contrato académico inválido.");
    if (data.sigaDirectThreads !== undefined && data.sigaDirectThreads !== null) {
      if (!Array.isArray(data.sigaDirectThreads))
        throw new Error("Contrato de mensagens inválido.");
      data.messages = importSigaDirectMessages(ctx, data.sigaDirectThreads);
    }
    const scoped = scopeWorkspace(data, ctx);
    this.workspaceCache.set(this.key(ctx), scoped);
    return scoped;
  }
  async execute(ctx: Context, command: Command, signal?: AbortSignal) {
    authorize(this.current, ctx, required[command.type]);
    const workspace = this.workspaceCache.get(this.key(ctx));
    if (!workspace || !this.current)
      throw new Error("Actualize os dados da escola antes de efectuar alterações.");
    validateCommand(this.current, ctx, workspace, command);
    const retryKey = this.key(ctx) + ":" + JSON.stringify(command);
    const requestId = this.pendingRequests.get(retryKey) ?? crypto.randomUUID();
    this.pendingRequests.set(retryKey, requestId);
    await this.request("/schools/" + encodeURIComponent(ctx.schoolId) + "/commands", signal, {
      role: ctx.role,
      command,
      requestId,
    });
    this.pendingRequests.delete(retryKey);
    this.workspaceCache.delete(this.key(ctx));
  }
  async signOut() {
    try {
      await this.request("/logout", undefined, {});
    } finally {
      this.invalidateSession();
      await this.transport?.clearSession?.();
    }
  }
}
