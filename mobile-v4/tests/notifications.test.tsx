import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parseNotificationInbox, type NotificationInbox } from "../src/domain/notifications";
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
});
const gateway = (notifications: Gateway["notifications"]): Gateway => ({
  notifications,
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
