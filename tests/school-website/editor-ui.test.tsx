/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ load: vi.fn(), change: vi.fn() }));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({ school: { id: "school-a" } }),
}));
vi.mock("@/features/school-website/content-server", () => ({
  getSchoolWebsiteEditor: mocks.load,
  changeSchoolWebsite: mocks.change,
}));
import { WebsiteSettingsPanel } from "@/features/school-website/WebsiteSettingsPanel";
import { readWebsiteState, websiteTemplate } from "@/features/school-website/content-model";

// Em cache fria a avaliação dos módulos e a primeira renderização consomem o
// orçamento de 5s por omissão, e o custo cai em quem correr primeiro. Mesmo
// limite já usado nos ficheiros de tests/routes.
vi.setConfig({ testTimeout: 20_000 });
const mount = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WebsiteSettingsPanel />
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({
    school: { name: "ISPAB", public_code: "ISPAB" },
    state: readWebsiteState(null),
    programs: [{ id: "11111111-1111-4111-8111-111111111111", name: "Engenharia oficial" }],
  });
  mocks.change.mockResolvedValue({ ...readWebsiteState(null), revision: 1 });
});
afterEach(cleanup);
describe("editor no portal do administrador", () => {
  it("apresenta campos editáveis por secção e guarda rascunhos sem publicar", async () => {
    mount();
    await screen.findByLabelText("Domínio para hospedagem externa (opcional)");
    fireEvent.change(screen.getByLabelText("Página ou conteúdo"), {
      target: { value: "Cursos · Engenharia Informática" },
    });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Novo nome editorial" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
    await waitFor(() => expect(mocks.change).toHaveBeenCalled());
    expect(mocks.change.mock.calls[0][0].data).toMatchObject({
      action: "save",
      expectedRevision: 0,
      draft: {
        templateVersion: websiteTemplate.version,
        values: { "data.courses.0.name": "Novo nome editorial" },
      },
    });
    expect(await screen.findByText(/Rascunho guardado. O site mantém/)).toBeTruthy();
  });
  it("oferece apenas os cursos recebidos da escola para a ligação ao SIGA", async () => {
    mount();
    await screen.findByLabelText("Página ou conteúdo");
    fireEvent.change(screen.getByLabelText("Página ou conteúdo"), {
      target: { value: "Cursos · Engenharia Informática" },
    });
    const select = screen.getByLabelText("Sincronizar com um curso do SIGA");
    expect(select.querySelectorAll("option")).toHaveLength(2);
    fireEvent.change(select, { target: { value: "11111111-1111-4111-8111-111111111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
    await waitFor(() => expect(mocks.change).toHaveBeenCalled());
    expect(mocks.change.mock.calls[0][0].data.draft.programBindings).toEqual({
      "data.courses.0.name": "11111111-1111-4111-8111-111111111111",
    });
  });
  it("explica erros de autorização sem apresentar um editor vazio", async () => {
    mocks.load.mockRejectedValue(Error("Sem permissão para esta operação na escola."));
    mount();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Sem permissão/);
    expect(screen.queryByLabelText("Domínio para hospedagem externa (opcional)")).toBeNull();
  });
});
