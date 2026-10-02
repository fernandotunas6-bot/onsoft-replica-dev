// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import { applicationRoles } from "@/features/auth/access-policy";
import {
  activeDestinationTo,
  getMobileDestinations,
  getMoreHubGroups,
  MORE_DESTINATION_TO,
} from "@/components/mobile/mobile-nav-model";
import { resolveStatus, STATUS_REGISTRY } from "@/lib/status-registry";
import { MoneyValue } from "@/components/ui/money-value";
import { StatusBadge } from "@/components/ui/status-badge";
import { EntityList } from "@/components/mobile/EntityList";
import { ResponsiveEntityView } from "@/components/mobile/ResponsiveEntityView";

/**
 * Contrato do design system mobile.
 *
 * O que estes testes protegem não é aparência — é aquilo que, se se quebrar,
 * deixa um ecrã de telemóvel sem saída: uma barra inferior que não acende nada,
 * um módulo que desaparece das duas navegações ao mesmo tempo, um estado sem
 * tom, ou uma lista que continua a montar a tabela do computador.
 */

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to ?? "#"}>{children}</a>
  ),
}));

afterEach(() => {
  cleanup();
  setViewport(1024);
});

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
}

describe("barra de navegação inferior", () => {
  it("dá no máximo cinco destinos e o último é sempre «Mais»", () => {
    for (const role of applicationRoles) {
      const destinations = getMobileDestinations(role);
      expect(destinations.length, role).toBeLessThanOrEqual(5);
      expect(destinations.at(-1)?.to, role).toBe(MORE_DESTINATION_TO);
    }
  });

  it("nenhum papel repete um destino — dois ícones para a mesma rota não é escolha", () => {
    for (const role of applicationRoles) {
      const keys = getMobileDestinations(role).map(
        (destination) => `${destination.to}?${JSON.stringify(destination.search ?? {})}`,
      );
      expect(new Set(keys).size, role).toBe(keys.length);
    }
  });

  it("um caminho fora dos módulos da barra acende «Mais», nunca nada", () => {
    const destinations = getMobileDestinations("Administrador");
    expect(activeDestinationTo("/", destinations)).toBe("/");
    expect(activeDestinationTo("/alunos/abc-123", destinations)).toBe("/alunos");
    expect(activeDestinationTo("/configuracoes", destinations)).toBe(MORE_DESTINATION_TO);
  });
});

describe("hub «Mais»", () => {
  it("cada papel tem módulos no hub e nenhum grupo vazio", () => {
    for (const role of applicationRoles) {
      const groups = getMoreHubGroups(role);
      for (const group of groups)
        expect(group.items.length, `${role}/${group.title}`).toBeGreaterThan(0);
    }
  });

  it("não repete a mesma entrada dentro de um grupo", () => {
    for (const role of applicationRoles) {
      for (const group of getMoreHubGroups(role)) {
        const keys = group.items.map((item) => `${item.to}?${JSON.stringify(item.search ?? {})}`);
        expect(new Set(keys).size, `${role}/${group.title}`).toBe(keys.length);
      }
    }
  });

  it("o «Início» da barra inferior não volta a aparecer no hub", () => {
    for (const role of applicationRoles) {
      const inHub = getMoreHubGroups(role).flatMap((group) => group.items);
      expect(
        inHub.filter((item) => item.to === "/" && !item.search),
        role,
      ).toEqual([]);
    }
  });
});

describe("registo de estados", () => {
  it("todo o estado tem rótulo em português e um tom conhecido", () => {
    const tones = new Set(["neutral", "primary", "success", "warning", "danger", "info"]);
    for (const [key, definition] of Object.entries(STATUS_REGISTRY)) {
      expect(definition.label.trim(), key).not.toBe("");
      expect(tones.has(definition.tone), `${key}=${definition.tone}`).toBe(true);
    }
  });

  it("os sinónimos da base de dados caem na chave canónica", () => {
    expect(resolveStatus("applicant").key).toBe("candidate");
    expect(resolveStatus("ATIVO").key).toBe("active");
    expect(resolveStatus("late").key).toBe("overdue");
  });

  it("um estado desconhecido mostra o valor recebido, não «Desconhecido»", () => {
    const resolved = resolveStatus("estado_novo_do_servidor");
    expect(resolved.key).toBeNull();
    expect(resolved.label).toBe("estado_novo_do_servidor");
    expect(resolved.tone).toBe("neutral");
  });

  it("o badge usa tokens do tema, nunca cores cruas do Tailwind", () => {
    render(<StatusBadge status="overdue" />);
    const badge = screen.getByRole("status");
    expect(badge.className).toContain("bg-destructive/10");
    expect(badge.className).not.toMatch(/\b(emerald|rose|amber|sky|purple)-/);
  });
});

describe("valor monetário", () => {
  it("alinha os dígitos e não parte a linha", () => {
    render(<MoneyValue amount={35000} />);
    const node = screen.getByText(/35[.\s]?000/);
    expect(node.className).toContain("tnum");
    expect(node.className).toContain("whitespace-nowrap");
  });

  it("um valor negativo mostra o sinal menos, não parênteses nem um menos duplicado", () => {
    render(<MoneyValue amount={-1500} />);
    expect(screen.getByText(/^−1[.\s]?500/)).toBeTruthy();
  });

  it("sem valor mostra um travessão em vez de «0 Kz»", () => {
    render(<MoneyValue amount={null} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("lista de entidades", () => {
  const items = [
    { id: "a", title: "Ana Manuel", subtitle: "10ª Classe · Turma A", status: <span>Activa</span> },
    { id: "b", title: "José Pedro", subtitle: "9ª Classe" },
  ];

  it("mostra identidade e contexto de cada entidade", () => {
    render(<EntityList items={items} />);
    expect(screen.getByText("Ana Manuel")).toBeTruthy();
    expect(screen.getByText("10ª Classe · Turma A")).toBeTruthy();
  });

  it("só mostra caixas de selecção quando a selecção múltipla é pedida", () => {
    const { rerender } = render(<EntityList items={items} />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    rerender(<EntityList items={items} selectable onToggleSelect={() => {}} />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(2);
  });

  it("cada caixa de selecção diz a quem pertence", () => {
    render(<EntityList items={items} selectable onToggleSelect={() => {}} />);
    expect(screen.getByLabelText("Seleccionar Ana Manuel")).toBeTruthy();
  });
});

describe("troca de vista por degrau", () => {
  it("no servidor e no primeiro render monta a vista de computador", () => {
    setViewport(375);
    render(<ResponsiveEntityView mobile={<p>lista</p>} desktop={<p>tabela</p>} />);
    // Já passou o efeito de montagem: a 375px tem de ser a lista.
    expect(screen.getByText("lista")).toBeTruthy();
    expect(screen.queryByText("tabela")).toBeNull();
  });

  it("acima de 1024px monta a tabela", () => {
    setViewport(1280);
    render(<ResponsiveEntityView mobile={<p>lista</p>} desktop={<p>tabela</p>} />);
    expect(screen.getByText("tabela")).toBeTruthy();
  });

  it("o tablet cai na vista de computador quando não tem uma própria", () => {
    setViewport(820);
    const { rerender } = render(
      <ResponsiveEntityView mobile={<p>lista</p>} desktop={<p>tabela</p>} />,
    );
    expect(screen.getByText("tabela")).toBeTruthy();
    rerender(
      <ResponsiveEntityView
        mobile={<p>lista</p>}
        tablet={<p>master-detail</p>}
        desktop={<p>tabela</p>}
      />,
    );
    expect(screen.getByText("master-detail")).toBeTruthy();
  });

  it("reage à rotação do telemóvel", () => {
    setViewport(1280);
    render(<ResponsiveEntityView mobile={<p>lista</p>} desktop={<p>tabela</p>} />);
    expect(screen.getByText("tabela")).toBeTruthy();
    act(() => {
      setViewport(375);
      window.dispatchEvent(new Event("orientationchange"));
    });
    expect(screen.getByText("lista")).toBeTruthy();
  });
});
