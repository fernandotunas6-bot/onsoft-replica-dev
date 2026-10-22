/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ list: vi.fn(), change: vi.fn(), schoolId: "school-a" }));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({ school: { id: mocks.schoolId } }),
}));
vi.mock("@/features/school-website/blog-server", () => ({
  listSchoolBlog: mocks.list,
  changeSchoolBlog: mocks.change,
}));
import { BlogSettingsPanel } from "@/features/school-website/BlogSettingsPanel";
import { changeSchoolBlogState } from "@/features/school-website/blog-model";

// Em cache fria a avaliação dos módulos e a primeira renderização consomem o
// orçamento de 5s por omissão, e o custo cai em quem correr primeiro. Mesmo
// limite já usado nos ficheiros de tests/routes.
vi.setConfig({ testTimeout: 20_000 });
const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <BlogSettingsPanel />
      </QueryClientProvider>,
    ),
  };
};
const post = changeSchoolBlogState(null, {
  slug: "noticias-da-escola",
  expectedRevision: 0,
  action: "publish",
  draft: {
    title: "Notícias da escola",
    excerpt: "Resumo publicado",
    body: "Texto publicado",
    category: "Novidades",
    coverUrl: "",
    coverAlt: "",
    authorName: "",
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.schoolId = "school-a";
  mocks.list.mockResolvedValue({ posts: [], total: 0 });
  mocks.change.mockImplementation(async ({ data }) => changeSchoolBlogState(null, data));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("administração do blog", () => {
  it("cria um artigo com endereço próprio e guarda o rascunho", async () => {
    mount();
    await screen.findByText(/Ainda não existem artigos/);
    fireEvent.click(screen.getByRole("button", { name: "Novo artigo" }));
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Semana da comunidade" },
    });
    expect((screen.getByLabelText("Endereço do artigo") as HTMLInputElement).value).toBe(
      "semana-da-comunidade",
    );
    fireEvent.change(screen.getByLabelText("Texto do artigo"), {
      target: { value: "Um rascunho da escola." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
    await waitFor(() => expect(mocks.change).toHaveBeenCalled());
    expect(mocks.change.mock.calls[0][0].data).toMatchObject({
      action: "save",
      slug: "semana-da-comunidade",
      expectedRevision: 0,
    });
    expect(await screen.findByText(/Rascunho guardado/)).toBeTruthy();
    expect((screen.getByLabelText("Endereço do artigo") as HTMLInputElement).disabled).toBe(true);
  });
  it("erros de permissão não abrem um editor vazio", async () => {
    mocks.list.mockRejectedValue(Error("Sem permissão nesta escola"));
    mount();
    expect((await screen.findByRole("alert")).textContent).toContain("Sem permissão");
    expect(screen.queryByLabelText("Título")).toBeNull();
  });
  it.each(["Novo artigo", "Voltar à lista"])(
    "protege o rascunho ao escolher %s",
    async (button) => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      mount();
      await screen.findByText(/Ainda não existem artigos/);
      fireEvent.click(screen.getByRole("button", { name: "Novo artigo" }));
      fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Texto por guardar" } });
      fireEvent.click(screen.getByRole("button", { name: button }));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Texto por guardar");
      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name: button }));
      expect(
        button === "Novo artigo"
          ? (screen.getByLabelText("Título") as HTMLInputElement).value
          : screen.queryByLabelText("Título"),
      ).toBe(button === "Novo artigo" ? "" : null);
    },
  );
  it("avisa ao recarregar apenas enquanto houver alterações e limpa o aviso ao desmontar", async () => {
    const { unmount } = mount();
    await screen.findByText(/Ainda não existem artigos/);
    fireEvent.click(screen.getByRole("button", { name: "Novo artigo" }));
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    fireEvent.change(screen.getByLabelText("Endereço do artigo"), {
      target: { value: "endereco-manual" },
    });
    expect(unload()).toBe(true);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Artigo novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
    await screen.findByText(/Rascunho guardado/);
    expect(unload()).toBe(false);
    fireEvent.change(screen.getByLabelText("Texto do artigo"), {
      target: { value: "Outra edição" },
    });
    expect(screen.queryByText(/Rascunho guardado/)).toBeNull();
    expect(unload()).toBe(true);
    unmount();
    expect(unload()).toBe(false);
  });
  it.each(["unpublish", "archive", "restore"] as const)(
    "mantém o texto por guardar depois de %s",
    async (action) => {
      const current =
        action === "restore"
          ? changeSchoolBlogState(post, {
              slug: post.slug,
              expectedRevision: post.revision,
              action: "archive",
            })
          : post;
      mocks.list.mockResolvedValue({ posts: [current], total: 1 });
      let persisted = current;
      mocks.change.mockImplementation(async ({ data }) => {
        persisted = changeSchoolBlogState(persisted, data);
        return persisted;
      });
      mount();
      fireEvent.click(await screen.findByRole("button", { name: /Notícias da escola/ }));
      fireEvent.change(screen.getByLabelText("Texto do artigo"), {
        target: { value: "Texto ainda por guardar" },
      });
      fireEvent.click(
        screen.getByRole("button", {
          name: {
            unpublish: "Retirar publicação",
            archive: "Arquivar artigo",
            restore: "Restaurar artigo",
          }[action],
        }),
      );
      await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(
          (screen.getByRole("button", { name: "Guardar rascunho" }) as HTMLButtonElement).disabled,
        ).toBe(false),
      );
      expect((screen.getByLabelText("Texto do artigo") as HTMLTextAreaElement).value).toBe(
        "Texto ainda por guardar",
      );
      fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
      await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(2));
      expect(mocks.change.mock.calls[1][0].data).toMatchObject({
        expectedRevision: current.revision + 1,
        draft: { body: "Texto ainda por guardar" },
      });
      await screen.findByText(/Rascunho guardado/);
      expect(persisted.draft.body).toBe("Texto ainda por guardar");
      expect(persisted.isPublished).toBe(false);
    },
  );
  it("não pede para descartar um artigo vazio ou alterações revertidas", async () => {
    const confirm = vi.spyOn(window, "confirm");
    mount();
    await screen.findByText(/Ainda não existem artigos/);
    fireEvent.click(screen.getByRole("button", { name: "Novo artigo" }));
    fireEvent.change(screen.getByLabelText("Texto do artigo"), {
      target: { value: "Edição temporária" },
    });
    fireEvent.change(screen.getByLabelText("Texto do artigo"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Voltar à lista" }));
    expect(screen.queryByLabelText("Título")).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });
  it("mantém o texto e o aviso de saída quando guardar falha", async () => {
    mocks.change.mockRejectedValue(Error("Outra pessoa alterou o artigo"));
    mount();
    await screen.findByText(/Ainda não existem artigos/);
    fireEvent.click(screen.getByRole("button", { name: "Novo artigo" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Texto local" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Outra pessoa alterou");
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Texto local");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
  it("limpa o editor e o aviso ao mudar de escola", async () => {
    const view = mount();
    await screen.findByText(/Ainda não existem artigos/);
    fireEvent.click(screen.getByRole("button", { name: "Novo artigo" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Privado da escola A" } });
    mocks.schoolId = "school-b";
    view.rerender(
      <QueryClientProvider client={view.client}>
        <BlogSettingsPanel />
      </QueryClientProvider>,
    );
    await screen.findByText(/Ainda não existem artigos/);
    expect(screen.queryByLabelText("Título")).toBeNull();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Novo artigo" }));
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("");
  });
  it("conserva o editor durante uma falha na actualização da lista e permite retentar", async () => {
    const { client } = mount();
    await screen.findByText(/Ainda não existem artigos/);
    fireEvent.click(screen.getByRole("button", { name: "Novo artigo" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Rascunho local" } });
    mocks.list.mockRejectedValueOnce(Error("Ligação interrompida"));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["school-blog"] });
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Ligação interrompida");
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Rascunho local");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Rascunho local");
  });
});
