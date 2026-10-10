import { expect, it } from "vitest";
import { readMobileNotifications } from "@/features/mobile-v4/notifications.server";
const ctx = {
  userId: "00000000-0000-4000-8000-000000000001",
  schoolId: "00000000-0000-4000-8000-000000000002",
  role: "aluno" as const,
};
function database(foreign = false, failure = false) {
  const calls: [string, unknown[]][][] = [];
  const db = {
    from: () => {
      const operations: [string, unknown[]][] = [];
      calls.push(operations);
      const q: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "limit", "is", "neq"])
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
            : {
                error: failure ? {} : null,
                data: [
                  {
                    id: "00000000-0000-4000-8000-000000000003",
                    school_id: foreign ? "other" : ctx.schoolId,
                    user_id: ctx.userId,
                    title: "Aviso",
                    body: "Real",
                    event_type: "test",
                    status: "sent",
                    read_at: null,
                    created_at: "2026-10-10T08:00:00Z",
                  },
                ],
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
  expect(calls[0]).toContainEqual(["limit", [50]]);
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
