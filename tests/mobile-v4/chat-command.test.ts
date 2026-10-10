import { expect, it, vi } from "vitest";
import {
  applyMobileChatCommand,
  readMobileChatCapabilities,
} from "@/features/mobile-v4/chat-commands.server";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Db = Parameters<typeof applyMobileChatCommand>[0];
const input = {
  schoolId: id(1),
  role: "aluno" as const,
  requestId: id(2),
  command: { type: "send" as const, conversationId: id(3), body: "Mensagem" },
};
it("uses the verified actor, requested tenant and service-only RPC", async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: { type: "send", conversationId: id(3), messageId: id(4) },
    error: null,
  });
  await expect(applyMobileChatCommand({ rpc } as unknown as Db, id(5), input)).resolves.toEqual({
    type: "send",
    conversationId: id(3),
    messageId: id(4),
  });
  expect(rpc).toHaveBeenCalledWith("mobile_v4_chat_command", {
    p_school_id: id(1),
    p_actor_id: id(5),
    p_role: "aluno",
    p_request_id: id(2),
    p_command: input.command,
  });
});
it.each([
  ["PGRST202", "missing function", 503, "CHAT_WRITES_NOT_READY"],
  ["P0001", "IDEMPOTENCY_CONFLICT", 409, "IDEMPOTENCY_CONFLICT"],
  ["P0001", "CHAT_FORBIDDEN", 403, "CHAT_FORBIDDEN"],
  ["P0001", "CHAT_VALIDATION_FAILED", 422, "CHAT_VALIDATION_FAILED"],
  ["XX000", "sensitive internal SQL", 503, "CHAT_WRITE_UNAVAILABLE"],
])("does not fall back for %s", async (code, message, status, errorCode) => {
  const db = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: { code, message } }),
  } as unknown as Db;
  await expect(applyMobileChatCommand(db, id(5), input)).rejects.toMatchObject({
    status,
    code: errorCode,
  });
});
it("reports no write capability when the staged RPC is not installed", async () => {
  const db = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202" } }),
  } as unknown as Db;
  await expect(readMobileChatCapabilities(db)).resolves.toEqual({ writes: false });
});
it("rejects a mismatched receipt rather than displaying a successful write", async () => {
  const db = {
    rpc: vi.fn().mockResolvedValue({
      data: { type: "send", conversationId: id(99), messageId: id(4) },
      error: null,
    }),
  } as unknown as Db;
  await expect(applyMobileChatCommand(db, id(5), input)).rejects.toMatchObject({
    status: 503,
    code: "CHAT_WRITE_INCONSISTENT",
  });
});
