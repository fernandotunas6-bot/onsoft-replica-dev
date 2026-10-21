import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  admin: vi.fn(),
  update: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  insert: vi.fn(),
  programs: [] as { id: string }[],
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
  requireSgaWriterFor: mocks.read,
  requireSgaWriterForWrite: mocks.write,
  loadSgaAdminClient: mocks.admin,
}));
vi.mock("@/features/school/settings-domains", () => ({ updateSettingsDomainValue: mocks.update }));
import {
  changeSchoolWebsite,
  getSchoolWebsiteEditor,
} from "@/features/school-website/content-server";
import { websiteTemplate } from "@/features/school-website/content-model";
const invoke = (fn: unknown, input: unknown) => (fn as (input: unknown) => Promise<unknown>)(input);
const context = { supabase: {}, userId: "admin-a" };
const draft = {
  templateVersion: websiteTemplate.version,
  websiteUrl: "https://school.example",
  values: {},
  programBindings: {},
  campaignSlug: "",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.programs = [];
  mocks.read.mockResolvedValue({ schoolId: "school-a" });
  mocks.write.mockResolvedValue({ schoolId: "school-a" });
  const chain = {
    select: () => chain,
    eq: (...args: unknown[]) => {
      mocks.eq(...args);
      return chain;
    },
    in: async () => ({ data: mocks.programs, error: null }),
    insert: mocks.insert,
  };
  mocks.from.mockReturnValue(chain);
  mocks.admin.mockResolvedValue({ from: mocks.from });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.update.mockImplementation(async (_db, _school, _domain, change) => change(null));
});
describe("autorização e âmbito do editor", () => {
  it("recusa leituras e escritas antes de tocar nos dados quando a permissão falha", async () => {
    mocks.read.mockRejectedValue(Error("Sem permissão"));
    mocks.write.mockRejectedValue(Error("Sem permissão"));
    await expect(invoke(getSchoolWebsiteEditor, { context })).rejects.toThrow(/permissão/);
    await expect(
      invoke(changeSchoolWebsite, {
        context,
        data: { action: "save", expectedRevision: 0, draft },
      }),
    ).rejects.toThrow(/permissão/);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("grava apenas a escola activa validada e exige Administrador com escrita em Gestão", async () => {
    await invoke(changeSchoolWebsite, {
      context,
      data: { action: "save", expectedRevision: 0, draft },
    });
    expect(mocks.write).toHaveBeenCalledWith("gestao", context.supabase, "admin-a", [
      "Administrador",
    ]);
    expect(mocks.update.mock.calls[0][1]).toBe("school-a");
    expect(mocks.update.mock.calls[0][2]).toBe("school_website");
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      school_id: "school-a",
      actor_user_id: "admin-a",
      action: "school.website.save_requested",
    });
  });
  it("recusa uma ligação a curso de outra escola ou inactivo", async () => {
    await expect(
      invoke(changeSchoolWebsite, {
        context,
        data: {
          action: "publish",
          expectedRevision: 0,
          draft: {
            ...draft,
            programBindings: { "data.courses.0.name": "11111111-1111-4111-8111-111111111111" },
          },
        },
      }),
    ).rejects.toThrow(/activo nesta escola/);
    expect(mocks.eq).toHaveBeenCalledWith("school_id", "school-a");
    expect(mocks.eq).toHaveBeenCalledWith("is_active", true);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("uma falha na auditoria impede a publicação", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "unavailable" } });
    await expect(
      invoke(changeSchoolWebsite, {
        context,
        data: { action: "publish", expectedRevision: 0, draft },
      }),
    ).rejects.toThrow(/auditoria/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
