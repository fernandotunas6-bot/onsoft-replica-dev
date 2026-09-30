import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  membership: { schoolId: "school-a", appRole: "Administrador" },
  db: { from: vi.fn(), rpc: vi.fn() },
  year: {
    id: "year-a",
    name: "2026/2027",
    status: "active",
    starts_on: "2026-09-01",
    ends_on: "2027-07-31",
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  resolveSgaMembershipAdmin: async () => mocks.membership,
  requireSgaWriterForWrite: async () => mocks.membership,
  loadSgaAdminClient: async () => mocks.db,
}));
import { listAcademicCalendar, saveAcademicCalendar } from "@/features/academic/academic-calendar";

type Handler = (args: {
  data: Record<string, unknown>;
  context: { userId: string; supabase: unknown };
}) => Promise<unknown>;
const context = { userId: "user-a", supabase: {} };
let filters: Array<[string, unknown]>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.year.status = "active";
  filters = [];
  mocks.db.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      },
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: mocks.year, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: table === "terms" ? [] : mocks.year, error: null }),
    };
    return query;
  });
});

describe("calendar server context", () => {
  it("scopes a selected historical year to the authenticated school", async () => {
    mocks.year.status = "closed";
    await (listAcademicCalendar as unknown as Handler)({
      data: { academicYearId: "year-a" },
      context,
    });
    expect(filters).toContainEqual(["school_id", "school-a"]);
    expect(filters).toContainEqual(["id", "year-a"]);
    expect(filters).not.toContainEqual(["status", "active"]);
    expect(filters).toContainEqual(["academic_year_id", "year-a"]);
  });

  it("uses the active year only when no year is requested", async () => {
    await (listAcademicCalendar as unknown as Handler)({ data: {}, context });
    expect(filters).toContainEqual(["status", "active"]);
  });

  it("does not call the activating RPC for a closed year", async () => {
    mocks.year.status = "closed";
    await expect(
      (saveAcademicCalendar as unknown as Handler)({ data: { academicYearId: "year-a" }, context }),
    ).rejects.toThrow(/ano lectivo activo/);
    expect(mocks.db.rpc).not.toHaveBeenCalled();
    expect(filters).toContainEqual(["school_id", "school-a"]);
  });
});
