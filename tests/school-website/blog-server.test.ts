import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), db: vi.fn(), update: vi.fn() }));
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
  loadSgaAdminClient: mocks.db,
  requireSgaWriterFor: mocks.read,
  requireSgaWriterForWrite: mocks.write,
}));
vi.mock("@/features/school/settings-domains", () => ({ updateSettingsDomainValue: mocks.update }));
import {
  changeSchoolBlog,
  listSchoolBlog,
  loadPublishedSchoolBlog,
} from "@/features/school-website/blog-server";
import { BLOG_PREFIX, changeSchoolBlogState } from "@/features/school-website/blog-model";
import { schoolWebsiteTestDb } from "./fake-db";
const context = { supabase: {}, userId: "admin-a", claims: { aal: "aal2" } };
const draft = {
  title: "Notícia escolar",
  excerpt: "Resumo público",
  body: "Texto público",
  category: "Novidades",
  coverUrl: "",
  coverAlt: "",
  authorName: "",
};
const invoke = (fn: unknown, input: unknown) => (fn as (input: unknown) => Promise<unknown>)(input);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ schoolId: "school-a", appRole: "Administrador" });
  mocks.write.mockResolvedValue({ schoolId: "school-a", appRole: "Administrador" });
  mocks.update.mockImplementation(async (_db, _school, _domain, change) => change(null));
});
describe("blog administrado por escola", () => {
  it("a API pública só lê publicações da escola e nunca devolve o rascunho", async () => {
    const published = changeSchoolBlogState(null, {
      slug: "noticia",
      action: "publish",
      expectedRevision: 0,
      draft,
    });
    const edited = changeSchoolBlogState(published, {
      slug: "noticia",
      action: "save",
      expectedRevision: 1,
      draft: { ...draft, body: "Rascunho secreto" },
    });
    const db = schoolWebsiteTestDb({
      school_settings: [
        { school_id: "school-a", domain: BLOG_PREFIX + "noticia", value: edited },
        {
          school_id: "school-b",
          domain: BLOG_PREFIX + "noticia",
          value: { ...published, published: { ...draft, title: "Outra escola" } },
        },
      ],
    });
    mocks.db.mockResolvedValue(db);
    const result = await loadPublishedSchoolBlog("school-a");
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].body).toBe("Texto público");
    expect(JSON.stringify(result)).not.toMatch(/secreto|Outra escola/);
    expect(db.calls[0].filters).toContainEqual(["value->>isPublished", "true"]);
  });
  it("leituras e gravações recusadas não tocam na base", async () => {
    mocks.read.mockRejectedValue(Error("Sem permissão"));
    mocks.write.mockRejectedValue(Error("Sem permissão"));
    await expect(invoke(listSchoolBlog, { context, data: { page: 0 } })).rejects.toThrow(
      /permissão/,
    );
    await expect(
      invoke(changeSchoolBlog, {
        context,
        data: { slug: "noticia", expectedRevision: 0, action: "save", draft },
      }),
    ).rejects.toThrow(/permissão/);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("escrita exige Administrador em Gestão e usa só a escola activa", async () => {
    mocks.db.mockResolvedValue(schoolWebsiteTestDb({}));
    await invoke(changeSchoolBlog, {
      context,
      data: { slug: "noticia", expectedRevision: 0, action: "save", draft },
    });
    expect(mocks.write).toHaveBeenCalledWith("gestao", context.supabase, "admin-a", [
      "Administrador",
    ]);
    expect(mocks.update.mock.calls[0][1]).toBe("school-a");
    expect(mocks.update.mock.calls[0][2]).toBe(BLOG_PREFIX + "noticia");
  });
});

describe("identidade institucional reservada ao administrador com MFA", () => {
  it.each(["Secretaria", "Professor", "Tesouraria", "Aluno", "Encarregado", ""])(
    "recusa %s mesmo quando o guarda de módulo concedeu acesso extraordinário",
    async (appRole) => {
      mocks.read.mockResolvedValue({ schoolId: "school-a", appRole });
      mocks.write.mockResolvedValue({ schoolId: "school-a", appRole });
      await expect(invoke(listSchoolBlog, { context, data: { page: 0 } })).rejects.toThrow(
        /Administrador/,
      );
      await expect(
        invoke(changeSchoolBlog, {
          context,
          data: { slug: "noticia", action: "save", expectedRevision: 0, draft },
        }),
      ).rejects.toThrow(/Administrador/);
      expect(mocks.db).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );
  it.each(["aal1", undefined, "aal3"])(
    "recusa alterações com aal=%s antes do cliente privilegiado",
    async (aal) => {
      await expect(
        invoke(changeSchoolBlog, {
          context: { ...context, claims: { aal } },
          data: { slug: "noticia", action: "save", expectedRevision: 0, draft },
        }),
      ).rejects.toThrow(/2FA/);
      expect(mocks.db).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );
});
