// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";

/**
 * Painel lateral (RightRail): o separador «Relacionado» só aparece quando a
 * entidade em foco tem relações com destino ou acções. A fatura (e outras
 * entidades sem mapa de relações) abria um separador vazio.
 */

const state = vi.hoisted(() => ({
  focused: null as null | { type: string; id: string; label: string },
  relations: [] as Array<{
    key: string;
    label: string;
    status: "ok";
    summary: string;
    route: string | null;
    module: string;
  }>,
  suggestions: [] as unknown[],
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/features/intelligence/entity-focus-context", () => ({
  useEntityFocus: () => ({
    focusedEntity: state.focused,
    panelCollapsed: false,
    setPanelCollapsed: () => {},
  }),
}));
vi.mock("@/features/intelligence/use-relations", () => ({ useRelations: () => state.relations }));
vi.mock("@/features/intelligence/use-suggestions", () => ({
  useSuggestions: () => state.suggestions,
}));
vi.mock("@/features/messages/chat-server", () => ({ startDirectConversation: vi.fn() }));
vi.mock("@/features/messages/use-inbox-unread", () => ({ useInboxUnread: () => ({ unread: [] }) }));
vi.mock("@/features/messages/ChatDock", () => ({ ChatDock: () => <p>Conversas</p> }));
vi.mock("@/hooks/use-breakpoint", () => ({
  useBreakpoint: () => ({ breakpoint: "desktop", ready: true }),
}));

let RightRail: ComponentType;

beforeAll(async () => {
  window.innerWidth = 1600;
  RightRail = (await import("@/components/layout/RightRail")).RightRail;
}, 60_000);

afterEach(() => {
  cleanup();
  state.focused = null;
  state.relations = [];
  state.suggestions = [];
});

function rail() {
  render(<RightRail />);
  return within(screen.getByRole("complementary", { name: "Painel lateral" }));
}

describe("RightRail: separador «Relacionado»", () => {
  it("sem entidade em foco, só as mensagens", () => {
    expect(rail().queryByRole("button", { name: "Relacionado" })).toBeNull();
  });

  it("uma entidade sem relações nem acções (a fatura) não abre um separador vazio", () => {
    state.focused = { type: "invoice", id: "f1", label: "FT-2026/0299" };
    const panel = rail();
    expect(panel.queryByRole("button", { name: "Relacionado" })).toBeNull();
    expect(panel.getByRole("button", { name: "Mensagens" })).toBeDefined();
  });

  it("relações sem destino também não contam", () => {
    state.focused = { type: "invoice", id: "f1", label: "FT-2026/0299" };
    state.relations = [
      { key: "x", label: "X", status: "ok", summary: "", route: null, module: "financeiro" },
    ];
    expect(rail().queryByRole("button", { name: "Relacionado" })).toBeNull();
  });

  it("com relações, o separador aparece e mostra-as", () => {
    state.focused = { type: "teacher", id: "t1", label: "Rui Costa" };
    state.relations = [
      {
        key: "turmas",
        label: "Turmas",
        status: "ok",
        summary: "2 turma(s)",
        route: "/professores/t1",
        module: "pessoas",
      },
    ];
    const panel = rail();
    expect(panel.getByRole("button", { name: "Relacionado" })).toBeDefined();
    expect(panel.getByText("2 turma(s)")).toBeDefined();
  });
});
