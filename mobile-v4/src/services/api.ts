import type { Gateway, Session, Context, Workspace, Command, Permission } from "../domain/model";
import { authorize, scopeWorkspace, required } from "../domain/policy";
import { importSigaDirectMessages } from "./chat-import";
const allowedPermissions: readonly Permission[] = [
  "academic.read",
  "attendance.write",
  "grades.write",
  "tasks.write",
  "submissions.write",
  "messages.write",
  "documents.request",
];
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// Proposed API contract. No production endpoint is enabled by this module.
export class ApiGateway implements Gateway {
  private current: Session | null = null;
  constructor(private base = "/api/mobile-v4") {
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
    const response = await fetch(this.base + path, {
      signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      method: body ? "POST" : "GET",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      if (response.status === 401) this.current = null;
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
    return response.status === 204 ? null : response.json();
  }
  async session(signal?: AbortSignal): Promise<Session | null> {
    this.current = null;
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
    return scopeWorkspace(data, ctx);
  }
  async execute(ctx: Context, command: Command, signal?: AbortSignal) {
    authorize(this.current, ctx, required[command.type]);
    await this.request("/schools/" + encodeURIComponent(ctx.schoolId) + "/commands", signal, {
      role: ctx.role,
      command,
      requestId: crypto.randomUUID(),
    });
  }
  async signOut() {
    try {
      await this.request("/logout", undefined, {});
    } finally {
      this.current = null;
    }
  }
}
