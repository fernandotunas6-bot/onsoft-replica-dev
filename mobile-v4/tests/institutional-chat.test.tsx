import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  parseChatInbox,
  parseChatHistory,
  type ChatInbox,
  type ChatHistory,
} from "../src/domain/institutional-chat";
import { InstitutionalChat } from "../src/components/InstitutionalChat";
import type { Context, Gateway } from "../src/domain/model";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ctx: Context = { schoolId: id(1), userId: id(2), role: "aluno" };
const inbox = (): ChatInbox => ({
  ...ctx,
  threads: [{ id: id(3), type: "direct", name: "Professor real", unread: 2, peerLeft: false }],
});
const history = (): ChatHistory => ({
  ...ctx,
  conversationId: id(3),
  messages: [
    {
      id: id(4),
      senderId: id(5),
      senderName: "Professor real",
      body: "Trabalho publicado",
      createdAt: "2026-10-10T08:00:00.123456Z",
      deleted: false,
      status: "sent",
      reply: { id: id(6), body: "Pergunta", senderName: "Aluno" },
      attachment: { id: id(7), name: "Enunciado.pdf" },
    },
  ],
  next: null,
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("accepts scoped actual messages preserving PostgreSQL microseconds", () => {
  expect(parseChatInbox(inbox(), ctx).threads[0].unread).toBe(2);
  expect(parseChatHistory(history(), ctx, id(3)).messages[0].createdAt).toMatch(/123456Z$/);
});
it.each([
  "school",
  "user",
  "conversation",
  "private",
  "deleted",
  "timestamp",
  "duplicate",
  "reply",
  "attachment",
  "cursor",
])("rejects %s leakage/inconsistent history", (kind) => {
  const data = history(),
    m = data.messages[0];
  if (kind === "school") data.schoolId = id(99);
  if (kind === "user") data.userId = id(99);
  if (kind === "conversation") data.conversationId = id(99);
  if (kind === "private") Object.assign(m, { storagePath: "secret" });
  if (kind === "deleted") m.deleted = true;
  if (kind === "timestamp") m.createdAt = "2026-02-31T08:00:00.000Z";
  if (kind === "duplicate") data.messages.push(m);
  if (kind === "reply") Object.assign(m.reply!, { schoolId: id(99) });
  if (kind === "attachment") m.attachment!.id = "unsafe";
  if (kind === "cursor") data.next = { date: m.createdAt, id: m.id };
  expect(() => parseChatHistory(data, ctx, id(3))).toThrow("Contrato de mensagens");
});
it("renders replies, attachment names, search and refresh using existing chat classes", async () => {
  const read = vi.fn().mockResolvedValue(history());
  const stop = vi.fn();
  const gateway = {
    chatInbox: vi.fn().mockResolvedValue(inbox()),
    chatHistory: read,
    subscribeChatChanged: vi.fn().mockReturnValue(stop),
  } as unknown as Gateway;
  const view = render(<InstitutionalChat ctx={ctx} gateway={gateway} />);
  await screen.findByText("Professor real");
  fireEvent.click(screen.getByText("Professor real"));
  await screen.findByText("Trabalho publicado");
  expect(screen.getByText("Aluno: Pergunta")).toBeTruthy();
  expect(screen.getByText("Anexo: Enunciado.pdf")).toBeTruthy();
  expect(screen.getByRole("log").querySelector(".message-bubble.received")).toBeTruthy();
  fireEvent.click(screen.getByText("Actualizar conversas"));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Voltar às conversas" }));
  fireEvent.change(screen.getByLabelText("Pesquisar conversas"), { target: { value: "ausente" } });
  expect(screen.queryByText("Professor real")).toBeNull();
  view.unmount();
  expect(stop).toHaveBeenCalled();
});
it("hides previous-school messages immediately while new request is pending", async () => {
  const gateway = {
    chatInbox: vi
      .fn()
      .mockResolvedValueOnce(inbox())
      .mockImplementation(() => new Promise(() => {})),
    chatHistory: vi.fn().mockResolvedValue(history()),
  } as unknown as Gateway;
  const view = render(<InstitutionalChat ctx={ctx} gateway={gateway} />);
  fireEvent.click(await screen.findByText("Professor real"));
  await screen.findByText("Trabalho publicado");
  view.rerender(<InstitutionalChat ctx={{ ...ctx, schoolId: id(99) }} gateway={gateway} />);
  expect(screen.queryByText("Trabalho publicado")).toBeNull();
});

it("keeps the same idempotency key when retrying a failed send; replies and delete/read use server commands", async () => {
  const read = vi.fn().mockResolvedValue(history());
  const command = vi
    .fn()
    .mockRejectedValueOnce(new Error("Rede interrompida"))
    .mockImplementation((_ctx, _key, c) =>
      Promise.resolve({ type: c.type, conversationId: id(3), messageId: id(10) }),
    );
  const gateway = {
    chatInbox: vi.fn().mockResolvedValue(inbox()),
    chatHistory: read,
    chatCapabilities: vi.fn().mockResolvedValue({ writes: true }),
    chatContacts: vi.fn().mockResolvedValue([]),
    chatCommand: command,
  } as unknown as Gateway;
  render(<InstitutionalChat ctx={ctx} gateway={gateway} />);
  fireEvent.click(await screen.findByText("Professor real"));
  await screen.findByText("Trabalho publicado");
  fireEvent.click(screen.getByText("Responder"));
  fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Resposta concreta" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
  await screen.findByText("Rede interrompida");
  const first = command.mock.calls[0];
  expect(first[2]).toEqual({
    type: "send",
    conversationId: id(3),
    body: "Resposta concreta",
    replyTo: id(4),
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
  await waitFor(() => expect(command).toHaveBeenCalledTimes(2));
  expect(command.mock.calls[1][1]).toBe(first[1]);
  await waitFor(() =>
    expect((screen.getByLabelText("Mensagem") as HTMLTextAreaElement).value).toBe(""),
  );
  fireEvent.click(screen.getByText("Marcar como lida"));
  await waitFor(() =>
    expect(command.mock.calls.at(-1)![2]).toEqual({
      type: "read",
      conversationId: id(3),
      messageId: id(4),
    }),
  );
});
it("does not offer writable success before the installed backend reports capability", async () => {
  const command = vi.fn();
  const gateway = {
    chatInbox: vi.fn().mockResolvedValue(inbox()),
    chatHistory: vi.fn().mockResolvedValue(history()),
    chatCapabilities: vi.fn().mockResolvedValue({ writes: false }),
    chatCommand: command,
  } as unknown as Gateway;
  render(<InstitutionalChat ctx={ctx} gateway={gateway} />);
  fireEvent.click(await screen.findByText("Professor real"));
  await screen.findByText("Trabalho publicado");
  expect(
    (screen.getByRole("button", { name: "Enviar mensagem" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(command).not.toHaveBeenCalled();
});
it("signs an attachment on demand without retaining URLs across a school change", async () => {
  const gateway = {
    chatInbox: vi.fn().mockResolvedValue(inbox()),
    chatHistory: vi.fn().mockResolvedValue(history()),
    chatAttachment: vi.fn().mockResolvedValue({
      url: "https://xodgfmxiaunpamctfeea.supabase.co/storage/v1/object/sign/siga-files/enunciado.pdf?token=temporary",
    }),
  } as unknown as Gateway;
  const view = render(<InstitutionalChat ctx={ctx} gateway={gateway} />);
  fireEvent.click(await screen.findByText("Professor real"));
  await screen.findByText("Trabalho publicado");
  fireEvent.click(screen.getByText("Abrir anexo"));
  await screen.findByRole("link", { name: "Abrir Enunciado.pdf" });
  expect(gateway.chatAttachment).toHaveBeenCalledWith(ctx, id(4));
  view.rerender(<InstitutionalChat ctx={{ ...ctx, schoolId: id(99) }} gateway={gateway} />);
  expect(screen.queryByRole("link", { name: "Abrir Enunciado.pdf" })).toBeNull();
});
