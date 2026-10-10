import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  parseNotificationInbox,
  parseNotificationReadReceipt,
  type NotificationInbox,
  type NotificationReadReceipt,
} from "../src/domain/notifications";
import { ApiError } from "../src/services/api";
import { InstitutionalNotifications } from "../src/components/InstitutionalNotifications";
import type { Context, Gateway } from "../src/domain/model";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ctx: Context = { userId: id(1), schoolId: id(2), role: "aluno" };
const inbox = (): NotificationInbox => ({
  ...ctx,
  unread: 17,
  items: [
    {
      id: id(3),
      title: "Horário publicado",
      body: "Consultar o horário da escola.",
      eventType: "schedule",
      read: false,
      createdAt: "2026-10-10T08:00:00Z",
    },
    {
      id: id(4),
      title: "Trabalho publicado",
      body: "Instruções disponíveis.",
      eventType: "task",
      read: true,
      createdAt: "2026-10-09T08:00:00Z",
    },
  ],
  next: null,
});
const gateway = (
  notifications: Gateway["notifications"],
  markNotificationsRead?: Gateway["markNotificationsRead"],
): Gateway => ({
  notifications,
  ...(markNotificationsRead ? { markNotificationsRead } : {}),
  session: async () => null,
  workspace: async () => {
    throw Error("unused");
  },
  execute: async () => {},
  signOut: async () => {},
});
afterEach(cleanup);
it.each(["schoolId", "userId", "role"])("rejects another %s before display", (field) => {
  expect(() => parseNotificationInbox({ ...inbox(), [field]: "other" }, ctx)).toThrow();
});
it.each([-1, 1.5, Infinity])("rejects invalid count %s", (unread) =>
  expect(() => parseNotificationInbox({ ...inbox(), unread }, ctx)).toThrow(),
);
it("rejects duplicate items, extra fields and invalid dates", () => {
  const data = inbox();
  expect(() =>
    parseNotificationInbox({ ...data, items: [data.items[0], data.items[0]] }, ctx),
  ).toThrow();
  expect(() => parseNotificationInbox({ ...data, secret: "no" }, ctx)).toThrow();
  expect(() =>
    parseNotificationInbox({ ...data, items: [{ ...data.items[0], createdAt: "bad" }] }, ctx),
  ).toThrow();
});
it("shows real counter independently of recent list, filters and refreshes without writes", async () => {
  const get = vi.fn().mockResolvedValue(inbox());
  render(<InstitutionalNotifications ctx={ctx} gateway={gateway(get)} />);
  await screen.findByText("17 não lidas nesta escola");
  fireEvent.click(screen.getByLabelText("Apenas não lidas"));
  expect(screen.queryByText("Trabalho publicado")).toBeNull();
  fireEvent.change(screen.getByLabelText("Pesquisar avisos"), { target: { value: "horário" } });
  expect(screen.getByText("Horário publicado")).toBeTruthy();
  fireEvent.click(screen.getByText("Actualizar avisos"));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
});
it("discards late responses after school change", async () => {
  let resolve!: (data: NotificationInbox) => void;
  const get = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<NotificationInbox>((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValue({ ...inbox(), schoolId: id(9), items: [] });
  const g = gateway(get);
  const view = render(<InstitutionalNotifications ctx={ctx} gateway={g} />);
  view.rerender(<InstitutionalNotifications ctx={{ ...ctx, schoolId: id(9) }} gateway={g} />);
  await screen.findByText("Nenhum aviso encontrado.");
  resolve(inbox());
  await Promise.resolve();
  expect(screen.queryByText("Horário publicado")).toBeNull();
});

const page = (from: number, count: number, more: boolean): NotificationInbox => {
  const items = Array.from({ length: count }, (_, i) => ({
    id: id(100 + from + i),
    title: `Aviso ${from + i}`,
    body: "Texto",
    eventType: "info",
    read: false,
    createdAt: new Date(Date.UTC(2026, 9, 10, 8) - (from + i) * 60000).toISOString(),
  }));
  const last = items[items.length - 1]!;
  return { ...ctx, unread: 70, items, next: more ? { date: last.createdAt, id: last.id } : null };
};
it("accepts a cursor only when it points at the last item of a full page", () => {
  expect(parseNotificationInbox(page(0, 50, true), ctx).next).toBeTruthy();
  const full = page(0, 50, true);
  expect(() =>
    parseNotificationInbox({ ...full, next: { ...full.next!, id: full.items[0]!.id } }, ctx),
  ).toThrow();
  expect(() =>
    parseNotificationInbox({ ...full, next: { ...full.next!, date: "2020-01-01T00:00:00Z" } }, ctx),
  ).toThrow();
  const short = page(0, 10, false);
  expect(() =>
    parseNotificationInbox(
      { ...short, next: { date: short.items[9]!.createdAt, id: short.items[9]!.id } },
      ctx,
    ),
  ).toThrow();
  const withoutNext: Partial<NotificationInbox> = inbox();
  delete withoutNext.next;
  expect(() => parseNotificationInbox(withoutNext, ctx)).toThrow();
});
it("rejects a read receipt for another context or more items than asked", () => {
  const ok = { ...ctx, updated: 1, unread: 3 };
  expect(parseNotificationReadReceipt(ok, ctx, { ids: [id(3)] })).toEqual(ok);
  expect(() =>
    parseNotificationReadReceipt({ ...ok, schoolId: id(9) }, ctx, { ids: [id(3)] }),
  ).toThrow();
  expect(() =>
    parseNotificationReadReceipt({ ...ok, updated: 2 }, ctx, { ids: [id(3)] }),
  ).toThrow();
  expect(parseNotificationReadReceipt({ ...ok, updated: 40 }, ctx, { all: true }).updated).toBe(40);
  expect(() => parseNotificationReadReceipt({ ...ok, extra: 1 }, ctx, { all: true })).toThrow();
});
it("marks one notice as read and uses the server counter", async () => {
  const mark = vi.fn().mockResolvedValue({ ...ctx, updated: 1, unread: 16 });
  render(
    <InstitutionalNotifications
      ctx={ctx}
      gateway={gateway(vi.fn().mockResolvedValue(inbox()), mark)}
    />,
  );
  await screen.findByText("17 não lidas nesta escola");
  fireEvent.click(screen.getByLabelText("Marcar «Horário publicado» como lido"));
  await screen.findByText("16 não lidas nesta escola");
  expect(mark).toHaveBeenCalledWith(ctx, { ids: [id(3)] });
  expect(screen.queryByLabelText("Marcar «Horário publicado» como lido")).toBeNull();
  // Um aviso já lido não oferece o botão.
  expect(screen.queryByLabelText("Marcar «Trabalho publicado» como lido")).toBeNull();
});
it("marks all as read and hides the action when nothing is unread", async () => {
  const mark = vi.fn().mockResolvedValue({ ...ctx, updated: 17, unread: 0 });
  render(
    <InstitutionalNotifications
      ctx={ctx}
      gateway={gateway(vi.fn().mockResolvedValue(inbox()), mark)}
    />,
  );
  await screen.findByText("17 não lidas nesta escola");
  fireEvent.click(screen.getByText("Marcar todos como lidos"));
  await screen.findByText("0 não lidas nesta escola");
  expect(mark).toHaveBeenCalledWith(ctx, { all: true });
  expect(screen.queryByText("Marcar todos como lidos")).toBeNull();
  expect(screen.queryByText("Marcar como lido")).toBeNull();
});
it("offers no write actions when the connection cannot mark notices", async () => {
  render(
    <InstitutionalNotifications ctx={ctx} gateway={gateway(vi.fn().mockResolvedValue(inbox()))} />,
  );
  await screen.findByText("17 não lidas nesta escola");
  expect(screen.queryByText("Marcar todos como lidos")).toBeNull();
  expect(screen.queryByText("Marcar como lido")).toBeNull();
});
it("explains a refused write without leaving the school", async () => {
  const onAccessError = vi.fn();
  const mark = vi
    .fn()
    .mockRejectedValue(new ApiError(403, "Sem autorização para esta escola ou operação."));
  render(
    <InstitutionalNotifications
      ctx={ctx}
      gateway={gateway(vi.fn().mockResolvedValue(inbox()), mark)}
      onAccessError={onAccessError}
    />,
  );
  await screen.findByText("17 não lidas nesta escola");
  fireEvent.click(screen.getByText("Marcar todos como lidos"));
  expect((await screen.findByRole("alert")).textContent).toMatch(/segundo factor/);
  expect(onAccessError).not.toHaveBeenCalled();
  expect(screen.getByText("17 não lidas nesta escola")).toBeTruthy();
});
it("loads older notices with the cursor and appends them", async () => {
  const first = page(0, 50, true);
  const get = vi
    .fn()
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(page(50, 3, false));
  render(<InstitutionalNotifications ctx={ctx} gateway={gateway(get)} />);
  await screen.findByText("Aviso 0");
  fireEvent.click(screen.getByText("Mostrar avisos mais antigos"));
  await screen.findByText("Aviso 52");
  expect(get).toHaveBeenLastCalledWith(ctx, undefined, first.next);
  expect(screen.getByText("Aviso 49")).toBeTruthy();
  expect(screen.queryByText("Mostrar avisos mais antigos")).toBeNull();
});
it("discards a read receipt that arrives after the school changed", async () => {
  let resolve!: (v: NotificationReadReceipt) => void;
  const mark = vi.fn().mockImplementation(() => new Promise((r) => (resolve = r)));
  const other = { ...ctx, schoolId: id(9) };
  const get = vi
    .fn()
    .mockResolvedValueOnce(inbox())
    .mockResolvedValue({ ...inbox(), schoolId: id(9), unread: 5 });
  const g = gateway(get, mark);
  const view = render(<InstitutionalNotifications ctx={ctx} gateway={g} />);
  await screen.findByText("17 não lidas nesta escola");
  fireEvent.click(screen.getByText("Marcar todos como lidos"));
  view.rerender(<InstitutionalNotifications ctx={other} gateway={g} />);
  await screen.findByText("5 não lidas nesta escola");
  resolve({ ...ctx, updated: 17, unread: 0 });
  await Promise.resolve();
  expect(screen.getByText("5 não lidas nesta escola")).toBeTruthy();
});
