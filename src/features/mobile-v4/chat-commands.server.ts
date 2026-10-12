import type { requireMobileAcademicAccess } from "./authorization";
import type { z } from "zod";
import { mobileChatCommandRequestSchema } from "./schemas";
import { MobileApiError } from "./errors";
type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];
/** Only the isolated RPC can commit: never fall back to legacy unaudited inserts. */
export async function applyMobileChatCommand(
  db: Db,
  userId: string,
  input: z.infer<typeof mobileChatCommandRequestSchema>,
) {
  const data = mobileChatCommandRequestSchema.parse(input);
  type Rpc = (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
  const { data: result, error } = await (db.rpc as unknown as Rpc)("mobile_v4_chat_command", {
    p_school_id: data.schoolId,
    p_actor_id: userId,
    p_role: data.role,
    p_request_id: data.requestId,
    p_command: data.command,
  });
  if (error) {
    if (error.message?.includes("IDEMPOTENCY_CONFLICT"))
      throw new MobileApiError(409, "IDEMPOTENCY_CONFLICT");
    if (error.message?.includes("CHAT_FORBIDDEN")) throw new MobileApiError(403, "CHAT_FORBIDDEN");
    if (error.message?.includes("CHAT_VALIDATION_FAILED"))
      throw new MobileApiError(422, "CHAT_VALIDATION_FAILED");
    if (error.code === "PGRST202" || error.code === "42883")
      throw new MobileApiError(503, "CHAT_WRITES_NOT_READY");
    throw new MobileApiError(503, "CHAT_WRITE_UNAVAILABLE");
  }
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    !("type" in result) ||
    result.type !== data.command.type ||
    !("conversationId" in result) ||
    !("messageId" in result) ||
    Object.keys(result).length !== 3
  )
    throw new MobileApiError(503, "CHAT_WRITE_INCONSISTENT");
  const uuid = (s: unknown) =>
    typeof s === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
  if (
    !uuid(result.conversationId) ||
    (data.command.type !== "start" && result.conversationId !== data.command.conversationId) ||
    (data.command.type === "start" ? result.messageId !== null : !uuid(result.messageId)) ||
    (["delete", "read"].includes(data.command.type) &&
      result.messageId !== (data.command as { messageId: string }).messageId)
  )
    throw new MobileApiError(503, "CHAT_WRITE_INCONSISTENT");
  return result;
}

export async function readMobileChatCapabilities(db: Db) {
  type Rpc = (name: string) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
  const r = await (db.rpc as unknown as Rpc)("mobile_v4_chat_capabilities");
  if (r.error?.code === "PGRST202" || r.error?.code === "42883") return { writes: false };
  if (
    r.error ||
    !r.data ||
    typeof r.data !== "object" ||
    !("writes" in r.data) ||
    r.data.writes !== true ||
    Object.keys(r.data).length !== 1
  )
    throw new MobileApiError(503, "CHAT_CAPABILITIES_UNAVAILABLE");
  return { writes: true };
}
