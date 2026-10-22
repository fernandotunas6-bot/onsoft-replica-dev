/** @vitest-environment jsdom */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  change: vi.fn(),
  navigate: vi.fn(),
  schoolId: "school-a",
}));
vi.mock("@/lib/settings-deep-link", () => ({ openSettingsPanel: mocks.navigate }));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({ school: { id: mocks.schoolId } }),
}));
vi.mock("@/features/school-website/content-server", () => ({
  getSchoolWebsiteEditor: mocks.load,
  changeSchoolWebsite: mocks.change,
}));
import { WebsiteThemePanel } from "@/features/school-website/WebsiteThemePanel";
import type { WebsiteDraft } from "@/features/school-website/content-model";
import { WebsiteSettingsPanel } from "@/features/school-website/WebsiteSettingsPanel";
import {
  changeWebsiteState,
  readWebsiteState,
  websiteTemplate,
} from "@/features/school-website/content-model";
const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <WebsiteSettingsPanel />
      </QueryClientProvider>,
    ),
  };
};
const mountAppearance = (initial: WebsiteDraft = readWebsiteState(null).draft) => {
  let current = initial;
  function Harness() {
    const [draft, setDraft] = useState(initial);
    return (
      <WebsiteThemePanel
        draft={draft}
        schoolName="ISPAB"
        busy={false}
        onChange={(next) => {
          current = next;
          setDraft(next);
        }}
      />
    );
  }
  return { ...render(<Harness />), getDraft: () => current };
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.schoolId = "school-a";
  mocks.load.mockResolvedValue({
    school: { name: "ISPAB", public_code: "ISPAB" },
    state: readWebsiteState(null),
    programs: [{ id: "11111111-1111-4111-8111-111111111111", name: "Engenharia oficial" }],
    campaigns: [{ slug: "admissao", title: "Admissão", is_open: true }],
    links: {
      websiteUrl: "https://school.example",
      fallbackUrl: "https://platform.example/escolas/school",
    },
  });
  mocks.change.mockResolvedValue({ ...readWebsiteState(null), revision: 1 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
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
  it.each(["Administrar blog", "Gerir domínio próprio"])(
    "protege alterações antes de %s",
    async (button) => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      mount();
      const input = await screen.findByLabelText("Domínio para hospedagem externa (opcional)");
      fireEvent.change(input, { target: { value: "https://school.example" } });
      fireEvent.click(screen.getByRole("button", { name: button }));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(mocks.navigate).not.toHaveBeenCalled();
      expect((input as HTMLInputElement).value).toBe("https://school.example");
      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name: button }));
      expect(mocks.navigate).toHaveBeenCalledTimes(1);
    },
  );
  it("conserva o rascunho durante uma falha de actualização e permite retentar", async () => {
    const { client } = mount();
    fireEvent.change(await screen.findByLabelText("Domínio para hospedagem externa (opcional)"), {
      target: { value: "https://school.example" },
    });
    mocks.load.mockRejectedValueOnce(Error("Ligação interrompida"));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["school-website"] });
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Ligação interrompida");
    expect(
      (screen.getByLabelText("Domínio para hospedagem externa (opcional)") as HTMLInputElement)
        .value,
    ).toBe("https://school.example");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(
      (screen.getByLabelText("Domínio para hospedagem externa (opcional)") as HTMLInputElement)
        .value,
    ).toBe("https://school.example");
  });
  it.each([
    "Domínio para hospedagem externa (opcional)",
    "Candidaturas oficiais",
    "Sincronizar com um curso do SIGA",
  ])("limpa a confirmação de gravação ao editar %s", async (label) => {
    mount();
    await screen.findByLabelText("Página ou conteúdo");
    fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
    await screen.findByText(/Rascunho guardado. O site mantém/);
    if (label.startsWith("Sincronizar"))
      fireEvent.change(screen.getByLabelText("Página ou conteúdo"), {
        target: { value: "Cursos · Engenharia Informática" },
      });
    fireEvent.change(screen.getByLabelText(label), {
      target: {
        value: label.startsWith("Sincronizar")
          ? "11111111-1111-4111-8111-111111111111"
          : label === "Candidaturas oficiais"
            ? "admissao"
            : "https://school.example",
      },
    });
    expect(screen.queryByText(/Rascunho guardado. O site mantém/)).toBeNull();
    expect(screen.getByText(/Tem alterações por guardar/)).toBeTruthy();
  });
  it("mantém alterações locais ao retirar a publicação e usa a nova revisão ao guardar", async () => {
    const published = changeWebsiteState(readWebsiteState(null), {
      expectedRevision: 0,
      action: "publish",
      draft: { ...readWebsiteState(null).draft, websiteUrl: "https://published.example" },
    });
    mocks.load.mockResolvedValue({
      school: { name: "ISPAB", public_code: "ISPAB" },
      state: published,
      programs: [],
    });
    let persisted = published;
    mocks.change.mockImplementation(async ({ data }) => {
      persisted = changeWebsiteState(persisted, data);
      return persisted;
    });
    mount();
    fireEvent.change(await screen.findByLabelText("Domínio para hospedagem externa (opcional)"), {
      target: { value: "https://school.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retirar publicação da API" }));
    await screen.findByText(/Publicação retirada/);
    expect(
      (screen.getByLabelText("Domínio para hospedagem externa (opcional)") as HTMLInputElement)
        .value,
    ).toBe("https://school.example");
    fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
    await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(2));
    expect(mocks.change.mock.calls[1][0].data).toMatchObject({
      expectedRevision: 2,
      draft: { websiteUrl: "https://school.example" },
    });
    await screen.findByText(/Rascunho guardado. O site mantém/);
    expect(persisted.draft.websiteUrl).toBe("https://school.example");
  });
  it("navega sem confirmação quando não há alterações e limpa o aviso após mudar de escola", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const view = mount();
    const input = await screen.findByLabelText("Domínio para hospedagem externa (opcional)");
    fireEvent.click(screen.getByRole("button", { name: "Administrar blog" }));
    expect(mocks.navigate).toHaveBeenCalledWith("website.blog");
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "https://school-a.example" } });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    mocks.schoolId = "school-b";
    view.rerender(
      <QueryClientProvider client={view.client}>
        <WebsiteSettingsPanel />
      </QueryClientProvider>,
    );
    expect(
      (
        (await screen.findByLabelText(
          "Domínio para hospedagem externa (opcional)",
        )) as HTMLInputElement
      ).value,
    ).toBe("");
    const nextEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(nextEvent);
    expect(nextEvent.defaultPrevented).toBe(false);
  });
});

it("guarda a taxa e o estilo por escola sem os publicar antecipadamente", async () => {
  mount();
  fireEvent.change(await screen.findByLabelText("Taxa de candidatura (Kz)"), {
    target: { value: "24000" },
  });
  fireEvent.change(screen.getByLabelText("Estilo dos destaques"), { target: { value: "prism" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
  await waitFor(() => expect(mocks.change).toHaveBeenCalled());
  expect(mocks.change.mock.calls[0][0].data).toMatchObject({
    action: "save",
    draft: { admissionFeeAmount: 24000, bannerStyle: "prism" },
  });
});

it("selecciona um tema e opções por página no rascunho, preservando os campos e sem publicar automaticamente", async () => {
  mount();
  await screen.findByText("Temas e personalização");
  fireEvent.click(screen.getByRole("button", { name: "Aplicar Editorial" }));
  fireEvent.change(screen.getByLabelText("Personalizar aparência de"), {
    target: { value: "/cursos/" },
  });
  fireEvent.change(screen.getByLabelText("Efeitos de entrada"), { target: { value: "none" } });
  expect(mocks.change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
  await waitFor(() => expect(mocks.change).toHaveBeenCalled());
  expect(mocks.change.mock.calls[0][0].data).toMatchObject({
    action: "save",
    draft: {
      values: {},
      design: { activeTheme: "editorial", pages: { "/cursos/": { motion: "none" } } },
    },
  });
});

it("instala um pacote compatível, rejeita código e mantém o tema activo até ser escolhido", async () => {
  const { builtInThemes } = await import("../../painel/escolas/src/design.mjs");
  mount();
  const upload = await screen.findByLabelText("Instalar tema compatível (.json)");
  const packageFile = (value: unknown) => {
    const file = new File([JSON.stringify(value)], "tema.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => JSON.stringify(value) });
    return file;
  };
  fireEvent.change(upload, {
    target: {
      files: [packageFile({ ...builtInThemes[1], id: "custom-academia", name: "Academia" })],
    },
  });
  await screen.findByRole("button", { name: "Aplicar Academia" });
  expect(
    screen.getByRole("button", { name: "Seleccionado no rascunho" }).getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.change(upload, {
    target: {
      files: [packageFile({ ...builtInThemes[1], id: "custom-malicioso", script: "alert(1)" })],
    },
  });
  expect((await screen.findByText(/opções desconhecidas/)).textContent).toBeTruthy();
  expect(screen.getByRole("button", { name: "Aplicar Academia" })).toBeTruthy();
  expect(mocks.change).not.toHaveBeenCalled();
});

it("organiza opções avançadas e repõe apenas a secção escolhida no rascunho", async () => {
  const view = mountAppearance();
  await screen.findByText("Temas e personalização");
  fireEvent.click(screen.getByText("Cabeçalho e identidade", { exact: true }));
  fireEvent.change(screen.getByLabelText("Superfície do cabeçalho"), {
    target: { value: "glass" },
  });
  fireEvent.change(screen.getByLabelText("Formato da marca"), { target: { value: "text" } });
  fireEvent.click(screen.getByText("Botões e ligações", { exact: true }));
  fireEvent.change(screen.getByLabelText("Forma dos botões"), { target: { value: "pill" } });
  fireEvent.click(screen.getByRole("button", { name: "Repor cabeçalho e identidade" }));
  expect((screen.getByLabelText("Formato da marca") as HTMLSelectElement).value).toBe("");
  expect((screen.getByLabelText("Forma dos botões") as HTMLSelectElement).value).toBe("pill");
  expect(view.getDraft().design?.overrides).toEqual({ buttonShape: "pill" });
  expect(mocks.change).not.toHaveBeenCalled();
});

it("pesquisa opções sem acentos e filtra apenas as personalizações sem publicar", async () => {
  mountAppearance();
  const search = await screen.findByLabelText("Pesquisar opções de aparência");
  fireEvent.change(search, { target: { value: "rodape" } });
  expect(screen.getByLabelText("Composição do rodapé")).toBeTruthy();
  expect(screen.queryByLabelText("Tipo de letra do corpo")).toBeNull();
  fireEvent.change(search, { target: { value: "botões cápsula" } });
  fireEvent.change(screen.getByLabelText("Forma dos botões"), { target: { value: "pill" } });
  fireEvent.change(search, { target: { value: "" } });
  fireEvent.click(screen.getByLabelText("Mostrar apenas opções personalizadas"));
  expect(screen.getByLabelText("Forma dos botões")).toBeTruthy();
  expect(screen.queryByLabelText("Cor principal")).toBeNull();
  expect(mocks.change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Repor botões e ligações" }));
  expect(screen.getByText(/Nenhuma opção corresponde/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
  expect(screen.getByLabelText("Cor principal")).toBeTruthy();
});
it("mostra a herança real da página e permite remover uma cor personalizada individualmente", async () => {
  const state = readWebsiteState(null);
  const { parseWebsiteDesign } = await import("../../painel/escolas/src/design.mjs");
  state.draft.design = parseWebsiteDesign({
    activeTheme: "campus",
    overrides: { buttonShape: "pill", primary: "#183d70" },
    pages: { "/cursos/": { buttonShape: "square", primary: "#1558ee" } },
  });
  mountAppearance(state.draft);
  fireEvent.change(await screen.findByLabelText("Personalizar aparência de"), {
    target: { value: "/cursos/" },
  });
  const shape = screen.getByLabelText("Forma dos botões") as HTMLSelectElement;
  expect(shape.value).toBe("square");
  expect(shape.options[0].text).toBe("Herdar (Cápsula)");
  fireEvent.click(screen.getByRole("button", { name: "Herdar cor principal" }));
  expect((screen.getByLabelText("Cor principal") as HTMLInputElement).value).toBe("#183d70");
  expect((screen.getByLabelText("Página para pré-visualizar") as HTMLSelectElement).value).toBe(
    "/cursos/",
  );
  expect(mocks.change).not.toHaveBeenCalled();
});

it("copia estilos para o rascunho e desfaz a cópia sem perder conteúdos ou outras páginas", async () => {
  const { parseWebsiteDesign } = await import("../../painel/escolas/src/design.mjs");
  const input = {
    ...readWebsiteState(null).draft,
    values: { "data.courses.0.name": "Nome preservado" },
    design: parseWebsiteDesign({
      activeTheme: "campus",
      pages: {
        "/ingresso/": { buttonShape: "pill", motion: "fade" },
        "/cursos/": { fontBody: "editorial" },
      },
    }),
  };
  const view = mountAppearance(input);
  fireEvent.change(screen.getByLabelText("Personalizar aparência de"), {
    target: { value: "/cursos/" },
  });
  fireEvent.change(screen.getByLabelText("Copiar personalizações de"), {
    target: { value: "/ingresso/" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Copiar personalizações" }));
  expect(view.getDraft().design?.pages["/cursos/"]).toEqual({
    fontBody: "editorial",
    buttonShape: "pill",
    motion: "fade",
  });
  expect(view.getDraft().values).toEqual(input.values);
  expect(mocks.change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Desfazer cópia" }));
  expect(view.getDraft().design).toEqual(input.design);
  fireEvent.change(screen.getByLabelText("Como aplicar os estilos"), {
    target: { value: "replace" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Copiar personalizações" }));
  expect(view.getDraft().design?.pages["/cursos/"]).toEqual({
    buttonShape: "pill",
    motion: "fade",
  });
  fireEvent.change(screen.getByLabelText("Tipo de letra do corpo"), {
    target: { value: "humanist" },
  });
  expect(screen.queryByRole("button", { name: "Desfazer cópia" })).toBeNull();
  expect(view.getDraft().design?.pages["/cursos/"]?.fontBody).toBe("humanist");
});
it("um atalho abre o grupo de conteúdos da página e dá foco ao selector", async () => {
  mount();
  fireEvent.change(await screen.findByLabelText("Personalizar aparência de"), {
    target: { value: "/ingresso/" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Editar textos e imagens desta página" }));
  const selector = screen.getByLabelText("Página ou conteúdo") as HTMLSelectElement;
  expect(selector.value).toBe("Como candidatar-se · /ingresso/");
  expect(document.activeElement).toBe(selector);
  expect(mocks.change).not.toHaveBeenCalled();
});

it("desfaz e refaz a apresentação no rascunho mantendo os textos e sem publicar", () => {
  const view = mountAppearance({
    ...readWebsiteState(null).draft,
    values: { "data.courses.0.name": "Curso preservado" },
  });
  expect(
    (screen.getByRole("button", { name: "Desfazer ajuste visual" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Aplicar Editorial" }));
  fireEvent.click(screen.getByRole("button", { name: "Aplicar Essencial" }));
  fireEvent.click(screen.getByRole("button", { name: "Desfazer ajuste visual" }));
  expect(view.getDraft().design?.activeTheme).toBe("editorial");
  fireEvent.click(screen.getByRole("button", { name: "Refazer ajuste visual" }));
  expect(view.getDraft().design?.activeTheme).toBe("minimal");
  fireEvent.click(screen.getByRole("button", { name: "Desfazer ajuste visual" }));
  fireEvent.click(screen.getByRole("button", { name: "Desfazer ajuste visual" }));
  expect(view.getDraft().design).toBeUndefined();
  expect(view.getDraft().values["data.courses.0.name"]).toBe("Curso preservado");
  expect(mocks.change).not.toHaveBeenCalled();
});
it("oferece comparação apenas quando existe uma publicação e não altera o rascunho ao escolher a versão", async () => {
  const published = changeWebsiteState(null, {
    expectedRevision: 0,
    action: "publish",
    draft: { ...readWebsiteState(null).draft, websiteUrl: "https://school.example" },
  });
  mocks.load.mockResolvedValue({ ...(await mocks.load()), state: published });
  mount();
  const picker = await screen.findByLabelText("Versão para comparar");
  fireEvent.change(picker, { target: { value: "published" } });
  expect(screen.getByRole("button", { name: "Pré-visualizar publicação" })).toBeTruthy();
  expect(mocks.change).not.toHaveBeenCalled();
  fireEvent.change(picker, { target: { value: "draft" } });
  expect(screen.getByRole("button", { name: "Pré-visualizar rascunho" })).toBeTruthy();
});
