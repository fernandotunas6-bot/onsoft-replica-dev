/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocked = vi.hoisted(() => ({
  account: { id: "admin-a", schoolId: "school-a", role: "Administrador" },
  load: vi.fn(),
  change: vi.fn(),
}));
vi.hoisted(() => {
  globalThis.ResizeObserver = class {
    observe() {
      return undefined;
    }
    unobserve() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
  };
});
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useBlocker: vi.fn(),
}));
vi.mock("@/features/auth/use-current-account", () => ({ useCurrentAccount: () => mocked.account }));
vi.mock("@/features/school-website/content-server", () => ({
  getSchoolWebsiteEditor: mocked.load,
  changeSchoolWebsite: mocked.change,
}));
import { StudioAppearance } from "@/features/school-website/studio/StudioAppearance";
import WebsiteStudio, {
  WebsiteStudioWorkspace,
} from "@/features/school-website/studio/WebsiteStudio";
import { readWebsiteState, changeWebsiteState } from "@/features/school-website/content-model";

beforeEach(() => {
  Object.assign(mocked.account, { id: "admin-a", schoolId: "school-a", role: "Administrador" });
  mocked.load.mockReset();
  mocked.change.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  });
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup(onReload?: () => Promise<Parameters<typeof WebsiteStudioWorkspace>[0]["initial"]>) {
  let saved = readWebsiteState(null);
  saved.draft.websiteUrl = "https://school.example";
  const persist = vi.fn(async (data) => {
    saved = changeWebsiteState(saved, data);
    return saved;
  });
  const view = { pagina: "/", largura: 1440, zoom: 50 };
  const onViewChange = vi.fn();
  const initial = {
    state: saved,
    school: { public_code: "QA-SCHOOL", name: "Escola A", logo_url: null },
    programs: [],
    campaigns: [],
    links: null,
  };
  const result = render(
    <WebsiteStudioWorkspace
      initial={initial}
      view={view}
      onViewChange={onViewChange}
      onPersist={persist}
      onReload={onReload}
    />,
  );
  return { ...result, initial, view, persist, onViewChange, saved: () => saved };
}
describe("Website Studio com o Puck real", () => {
  it("edita através do inspector, guarda no contrato existente e mantém a publicação separada", async () => {
    const ui = setup();
    const field = ui.container.querySelector<HTMLInputElement>(".studio-field input")!;
    expect(field).toBeTruthy();
    fireEvent.change(field, { target: { value: "Conteúdo editado pelo Puck" } });
    await screen.findByText("Alterações por guardar");
    fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
    await screen.findByText("Rascunho guardado. A publicação mantém-se.");
    expect(Object.values(ui.saved().draft.values)).toContain("Conteúdo editado pelo Puck");
    expect(ui.saved().published).toBeNull();
    expect(ui.persist.mock.calls[0][0]).not.toHaveProperty("content");
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(ui.saved().published).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar publicação" }));
    await screen.findByText("Conteúdo publicado.");
    expect(ui.saved().published?.content.values).toEqual(ui.saved().draft.values);
    await waitFor(() =>
      expect(ui.container.querySelector("iframe")?.getAttribute("sandbox")).toBe(""),
    );
  });
  it("a vista da publicação é apenas de leitura e não grava rascunhos ocultos", async () => {
    const ui = setup();
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar publicação" }));
    await screen.findByText("Conteúdo publicado.");
    expect(ui.persist).toHaveBeenCalledTimes(1);

    const field = ui.container.querySelector<HTMLInputElement>(".studio-field input")!;
    fireEvent.change(field, { target: { value: "Alteração apenas no rascunho" } });
    await screen.findByText("Alterações por guardar");
    fireEvent.click(await screen.findByText("Ver publicação", { selector: "button" }));

    const save = screen.getByRole("button", { name: "Guardar rascunho" }) as HTMLButtonElement;
    const publish = screen.getByRole("button", { name: "Publicar" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(publish.disabled).toBe(true);
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(ui.persist).toHaveBeenCalledTimes(1);
    expect(Object.values(ui.saved().draft.values)).not.toContain("Alteração apenas no rascunho");

    fireEvent.click(screen.getByText("Voltar ao rascunho", { selector: "button" }));
    expect(save.disabled).toBe(false);
    expect(ui.persist).toHaveBeenCalledTimes(1);
  });

  it("uma falha conserva a edição e mudar dispositivo não grava nem publica", async () => {
    const ui = setup();
    ui.persist.mockRejectedValueOnce(Error("Conflito de revisão; recarregue."));
    const field = ui.container.querySelector<HTMLInputElement>(".studio-field input")!;
    fireEvent.change(field, { target: { value: "Rascunho a conservar" } });
    await screen.findByText("Alterações por guardar");
    fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
    await screen.findByRole("alert");
    expect(field.value).toBe("Rascunho a conservar");
    fireEvent.change(screen.getByLabelText("Largura da pré-visualização"), {
      target: { value: "390" },
    });
    expect(ui.onViewChange).toHaveBeenCalledWith({ ...ui.view, largura: 390 });
    expect(ui.persist).toHaveBeenCalledTimes(1);
    expect(ui.saved().revision).toBe(0);
  });
});

it("inicia a aparência sem tema gravado e recusa cores sem contraste sem quebrar o editor", () => {
  const onChange = vi.fn();
  render(
    <StudioAppearance
      draft={readWebsiteState(null).draft}
      path="/contactos/"
      disabled={false}
      onChange={onChange}
    />,
  );
  expect(screen.getByLabelText("Tema de todo o website")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Fundo", { exact: true }), {
    target: { value: "#000000" },
  });
  expect(screen.getByRole("alert").textContent).toMatch(/contraste/);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Cor principal", { exact: true }), {
    target: { value: "#123456" },
  });
  expect(onChange.mock.calls[0][0].design.pages["/contactos/"].primary).toBe("#123456");
});

it("cancela a leitura anterior e ignora uma resposta atrasada ao mudar de escola", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const data = (name: string) => ({
    state: readWebsiteState(null),
    school: { public_code: name, name, logo_url: null },
    programs: [],
    campaigns: [],
    links: null,
  });
  const signals: AbortSignal[] = [];
  let finishA: (value: ReturnType<typeof data>) => void = () => undefined;
  mocked.load
    .mockImplementationOnce(({ signal }) => {
      signals.push(signal);
      return new Promise((resolve) => {
        finishA = resolve;
      });
    })
    .mockResolvedValueOnce(data("Escola B"));
  const view = { pagina: "/", largura: 1440, zoom: 50 };
  const app = () => (
    <QueryClientProvider client={client}>
      <WebsiteStudio view={view} onViewChange={vi.fn()} />
    </QueryClientProvider>
  );
  const ui = render(app());
  await waitFor(() => expect(mocked.load).toHaveBeenCalledTimes(1));
  mocked.account.schoolId = "school-b";
  ui.rerender(app());
  await screen.findByText("Escola B");
  expect(signals[0].aborted).toBe(true);
  finishA(data("Escola A atrasada"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.queryByText("Escola A atrasada")).toBeNull();
  ui.unmount();
  client.clear();
});

it("desfaz, refaz e conserva o histórico depois de guardar, sem publicar por atalho", async () => {
  const ui = setup();
  const field = ui.container.querySelector<HTMLInputElement>(".studio-field input")!;
  const before = field.value;
  fireEvent.change(field, { target: { value: "Alteração com histórico" } });
  await screen.findByText("Alterações por guardar");
  fireEvent.click(screen.getByText("Desfazer", { selector: "button" }));
  expect(ui.container.querySelector<HTMLInputElement>(".studio-field input")!.value).toBe(before);
  fireEvent.click(screen.getByText("Refazer", { selector: "button" }));
  expect(ui.container.querySelector<HTMLInputElement>(".studio-field input")!.value).toBe(
    "Alteração com histórico",
  );
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  await screen.findByText("Rascunho guardado. A publicação mantém-se.");
  expect(ui.saved().published).toBeNull();
  fireEvent.click(screen.getByText("Desfazer", { selector: "button" }));
  expect(ui.container.querySelector<HTMLInputElement>(".studio-field input")!.value).toBe(before);
  await screen.findByText("Alterações por guardar");
});
it("cancelar a revisão não envia comandos nem publica", async () => {
  const ui = setup();
  fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar a editar" }));
  expect(ui.persist).not.toHaveBeenCalled();
});

it("recarrega após conflito só com descarte explícito, conservando a edição se cancelar ou falhar", async () => {
  const reload = vi.fn<() => Promise<Parameters<typeof WebsiteStudioWorkspace>[0]["initial"]>>();
  const ui = setup(reload);
  const field = ui.container.querySelector<HTMLInputElement>(".studio-field input")!;
  const original = field.value;
  fireEvent.change(field, { target: { value: "Edição local em conflito" } });
  await screen.findByText("Alterações por guardar");
  ui.persist.mockRejectedValueOnce(Error("Conflito de revisão"));
  fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
  await screen.findByText("Conflito de revisão");
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole("button", { name: "Recarregar versão guardada" }));
  expect(reload).not.toHaveBeenCalled();
  expect(field.value).toBe("Edição local em conflito");
  reload.mockRejectedValueOnce(Error("Rede indisponível"));
  fireEvent.click(screen.getByRole("button", { name: "Recarregar versão guardada" }));
  await screen.findByText("Rede indisponível");
  expect(field.value).toBe("Edição local em conflito");
  reload.mockResolvedValueOnce({ ...ui.initial, state: { ...ui.initial.state, revision: 5 } });
  fireEvent.click(screen.getByRole("button", { name: "Recarregar versão guardada" }));
  await screen.findByText("Versão guardada carregada. Pode continuar a editar.");
  expect(ui.container.querySelector<HTMLInputElement>(".studio-field input")!.value).toBe(original);
  expect(ui.container.querySelector(".studio-edit-toolbar button")?.hasAttribute("disabled")).toBe(
    true,
  );
});

it("não aplica na cache de A uma resposta de recarregamento identificada como outra escola", async () => {
  const state = readWebsiteState(null);
  state.draft.websiteUrl = "https://school-a.example";
  const initial = {
    state,
    school: { public_code: "QA-A", name: "Escola A", logo_url: null },
    programs: [],
    campaigns: [],
    links: null,
  };
  mocked.load.mockResolvedValueOnce(initial).mockResolvedValueOnce({
    ...initial,
    school: { ...initial.school, public_code: "QA-B", name: "Escola B" },
  });
  mocked.change.mockRejectedValueOnce(Error("Conflito de revisão"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = render(
    <QueryClientProvider client={client}>
      <WebsiteStudio view={{ pagina: "/", largura: 1440, zoom: 50 }} onViewChange={vi.fn()} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(ui.container.querySelector(".studio-field input")).not.toBeNull());
  const field = ui.container.querySelector<HTMLInputElement>(".studio-field input")!;
  fireEvent.change(field, { target: { value: "Rascunho privado de A" } });
  await screen.findByText("Alterações por guardar");
  fireEvent.click(screen.getByRole("button", { name: "Guardar rascunho" }));
  await screen.findByText("Conflito de revisão");
  fireEvent.click(screen.getByRole("button", { name: "Recarregar versão guardada" }));
  await screen.findByText("A escola activa mudou. Abra novamente o estúdio antes de continuar.");
  expect(
    client.getQueryData<typeof initial>(["school-website-studio", "admin-a", "school-a"])?.school
      .public_code,
  ).toBe("QA-A");
  expect(field.value).toBe("Rascunho privado de A");
  expect(screen.queryByText("Escola B")).toBeNull();
  client.clear();
});
