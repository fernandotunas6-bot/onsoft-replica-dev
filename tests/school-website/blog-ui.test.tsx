/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ list: vi.fn(), change: vi.fn() }));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({ school: { id: "school-a" } }),
}));
vi.mock("@/features/school-website/blog-server", () => ({
  listSchoolBlog: mocks.list,
  changeSchoolBlog: mocks.change,
}));
import { BlogSettingsPanel } from "@/features/school-website/BlogSettingsPanel";
import { changeSchoolBlogState } from "@/features/school-website/blog-model";
const mount = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BlogSettingsPanel />
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ posts: [], total: 0 });
  mocks.change.mockImplementation(async ({ data }) => changeSchoolBlogState(null, data));
});
afterEach(cleanup);
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
});
