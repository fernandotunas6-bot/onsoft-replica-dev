import { describe, expect, it, vi, beforeEach } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import {
  listVirtualClassrooms,
  scheduleVirtualClassroom,
} from "@/features/virtual-classroom/classroom-api";

describe("BigBlueButton classroom API", () => {
  beforeEach(() => invoke.mockReset());

  it("requests sessions scoped to the selected school", async () => {
    invoke.mockResolvedValue({ data: { sessions: [] }, error: null });
    await expect(listVirtualClassrooms("school-1")).resolves.toEqual([]);
    expect(invoke).toHaveBeenCalledWith("bbb-classroom", {
      body: { action: "list", schoolId: "school-1" },
    });
  });

  it("rejects malformed lists rather than silently showing an empty school", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(listVirtualClassrooms("school-1")).rejects.toThrow("Lista de aulas inválida.");
  });

  it("fails closed on transport errors", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("network") });
    await expect(listVirtualClassrooms("school-1")).rejects.toThrow("Não foi possível comunicar");
  });

  it("rejects a schedule response without a session", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(
      scheduleVirtualClassroom({
        schoolId: "school-1",
        classGroupId: "class-1",
        teacherId: "teacher-1",
        title: "Matemática",
        startsAt: "2026-10-10T10:00:00Z",
        endsAt: "2026-10-10T11:00:00Z",
      }),
    ).rejects.toThrow("A aula não foi criada.");
  });
});
