import { expect, it } from "vitest";
import {
  markMobileNotificationsRead,
  readMobileNotifications,
} from "@/features/mobile-v4/notifications.server";
const ctx = {
  userId: "00000000-0000-4000-8000-000000000001",
  schoolId: "00000000-0000-4000-8000-000000000002",
  role: "aluno" as const,
};
const row = (i: number) => ({
  id: `00000000-0000-4000-8000-${String(100 + i).padStart(12, "0")}`,
  school_id: ctx.schoolId,
  user_id: ctx.userId,
  title: `Aviso ${i}`,
  body: "Real",
  event_type: "test",
  status: "sent",
  read_at: null,
  // Microssegundos, como o PostgREST devolve: o cursor tem de os manter.
  created_at: new Date(Date.UTC(2026, 9, 10, 8) - i * 60000)
    .toISOString()
    .replace("Z", "123+00:00"),
});
function database(foreign = false, failure = false, rowCount = 1, updated = 2) {
  const calls: [string, unknown[]][][] = [];
  const db = {
    from: () => {
      const operations: [string, unknown[]][] = [];
      calls.push(operations);
      const q: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "limit", "is", "neq", "or", "in", "update"])
        q[method] = (...args: unknown[]) => {
          operations.push([method, args]);
          return q;
        };
      q.then = (resolve: (value: unknown) => void) =>
        resolve(
          operations.some(
            ([name, args]) => name === "select" && (args[1] as { head?: boolean })?.head,
          )
            ? { error: null, count: 25 }
            : operations.some(([name]) => name === "update")
              ? {
                  error: failure ? {} : null,
                  data: failure
                    ? null
                    : Array.from({ length: updated }, (_, i) => ({ id: row(i).id })),
                }
              : {
                  error: failure ? {} : null,
                  data: Array.from({ length: rowCount }, (_, i) => ({
                    ...row(i),
                    school_id: foreign ? "other" : ctx.schoolId,
                  })),
                },
        );
      return q;
    },
  };
  return { db: db as unknown as Parameters<typeof readMobileNotifications>[0], calls };
}
it("restricts both privileged queries to selected school, verified user and in-app channel", async () => {
  const { db, calls } = database();
  const data = await readMobileNotifications(db, ctx);
  expect(data.unread).toBe(25);
  expect(data.items).toHaveLength(1);
  for (const query of calls) {
    expect(query).toContainEqual(["eq", ["school_id", ctx.schoolId]]);
    expect(query).toContainEqual(["eq", ["user_id", ctx.userId]]);
    expect(query).toContainEqual(["eq", ["channel", "in_app"]]);
  }
  expect(calls[0]).toContainEqual(["limit", [51]]);
  expect(data.next).toBeNull();
  expect(calls[1]).toContainEqual(["is", ["read_at", null]]);
});
it("fails closed for foreign rows and database errors, never returns empty success", async () => {
  for (const [foreign, failure] of [
    [true, false],
    [false, true],
  ])
    await expect(readMobileNotifications(database(foreign, failure).db, ctx)).rejects.toMatchObject(
      { status: 503 },
    );
});

it("pages beyond 50 with a cursor that keeps the database precision", async () => {
  const { db, calls } = database(false, false, 51);
  const first = await readMobileNotifications(db, ctx);
  expect(first.items).toHaveLength(50);
  // A data do cursor é ISO UTC com os microssegundos da base.
  const date = row(49).created_at.replace("+00:00", "Z");
  expect(first.next).toEqual({ date, id: row(49).id });
  expect(date).toMatch(/\.\d{6}Z$/);
  const again = database(false, false, 3);
  await readMobileNotifications(again.db, ctx, first.next!);
  expect(again.calls[0]).toContainEqual([
    "or",
    [`created_at.lt.${date},and(created_at.eq.${date},id.lt.${row(49).id})`],
  ]);
  expect(calls[0].filter(([name]) => name === "or")).toEqual([]);
});
it("marks only own unread in-app notices of the school and returns the fresh counter", async () => {
  const { db, calls } = database(false, false, 1, 2);
  const ids = [row(0).id, row(1).id];
  const receipt = await markMobileNotificationsRead(db, ctx, { ids });
  expect(receipt).toEqual({ ...ctx, updated: 2, unread: 25 });
  const update = calls[0];
  const set = update.find(([name]) => name === "update")![1][0] as Record<string, unknown>;
  expect(set.status).toBe("read");
  expect(Number.isFinite(Date.parse(String(set.read_at)))).toBe(true);
  expect(update).toContainEqual(["eq", ["school_id", ctx.schoolId]]);
  expect(update).toContainEqual(["eq", ["user_id", ctx.userId]]);
  expect(update).toContainEqual(["eq", ["channel", "in_app"]]);
  expect(update).toContainEqual(["is", ["read_at", null]]);
  expect(update).toContainEqual(["neq", ["status", "read"]]);
  expect(update).toContainEqual(["in", ["id", ids]]);
});
it("marks all without an id filter, and fails closed on errors or excess rows", async () => {
  const all = database(false, false, 1, 30);
  expect((await markMobileNotificationsRead(all.db, ctx, { all: true })).updated).toBe(30);
  expect(all.calls[0].some(([name]) => name === "in")).toBe(false);
  await expect(
    markMobileNotificationsRead(database(false, true).db, ctx, { all: true }),
  ).rejects.toMatchObject({ status: 503 });
  // A base diz que mudou mais do que o pedido: nunca se aceita em silêncio.
  await expect(
    markMobileNotificationsRead(database(false, false, 1, 3).db, ctx, { ids: [row(0).id] }),
  ).rejects.toMatchObject({ status: 503 });
});
