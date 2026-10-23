import { describe, expect, it } from "vitest";
import {
  blogPostInputSchema,
  contactMessageInputSchema,
  faqInputSchema,
  resolvePublishedAt,
  slugify,
} from "@/features/saas/web-site-schemas";

describe("conteúdo do site gerido no ADMIN", () => {
  it("gera endereços só com minúsculas, números e hífens", () => {
    expect(slugify("Novo ano lectivo 2026/27 — Inscrições!")).toBe(
      "novo-ano-lectivo-2026-27-inscricoes",
    );
    expect(slugify("Pautas: MAC, NPP & NPT")).toBe("pautas-mac-npp-npt");
    expect(slugify("   ")).toBe("");
  });

  it("artigo: título obrigatório, capa só https, estado por omissão rascunho", () => {
    const ok = blogPostInputSchema.parse({ title: "Novidades", coverUrl: "" });
    expect(ok.status).toBe("draft");
    expect(ok.coverUrl).toBeNull();
    expect(blogPostInputSchema.safeParse({ title: "x" }).success).toBe(false);
    expect(
      blogPostInputSchema.safeParse({ title: "Capa", coverUrl: "http://x.ao/a.png" }).success,
    ).toBe(false);
    expect(blogPostInputSchema.safeParse({ title: "Slug", slug: "Com Espaço" }).success).toBe(
      false,
    );
  });

  it("data de publicação: fica a primeira, e só ao publicar", () => {
    const now = new Date("2026-10-07T10:00:00Z");
    expect(resolvePublishedAt("draft", null, now)).toBeNull();
    expect(resolvePublishedAt("published", null, now)).toBe(now.toISOString());
    expect(resolvePublishedAt("published", "2026-01-01T00:00:00Z", now)).toBe(
      "2026-01-01T00:00:00Z",
    );
    expect(resolvePublishedAt("archived", "2026-01-01T00:00:00Z", now)).toBe(
      "2026-01-01T00:00:00Z",
    );
  });

  it("contacto: e-mail normalizado, mensagem mínima e campo-armadilha vazio", () => {
    const parsed = contactMessageInputSchema.parse({
      name: "Ana",
      email: " Ana@Escola.AO ",
      subject: "Planos",
      message: "Queria saber os preços.",
    });
    expect(parsed.email).toBe("ana@escola.ao");
    expect(parsed.school).toBe("");
    expect(contactMessageInputSchema.safeParse({ ...parsed, message: "curta" }).success).toBe(
      false,
    );
    // O campo-armadilha passa a validação: o servidor descarta a mensagem sem o dizer.
    expect(contactMessageInputSchema.parse({ ...parsed, website: "spam" }).website).toBe("spam");
  });

  it("pergunta frequente: valores por omissão publicados e fora do destaque", () => {
    const faq = faqInputSchema.parse({ question: "Há avaliação?", answer: "Sim, 14 dias." });
    expect(faq).toMatchObject({
      category: "Geral",
      featured: false,
      isPublished: true,
      sortOrder: 0,
    });
  });
});
