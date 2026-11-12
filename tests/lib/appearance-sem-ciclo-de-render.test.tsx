/**
 * @vitest-environment jsdom
 *
 * Regressão do React #185 («Maximum update depth exceeded») que deixou todas as
 * páginas autenticadas da produção a mostrar «Esta página não carregou» a
 * 2026-10-22.
 *
 * Duas peças compunham o ciclo:
 *  1. `set()` devolvia sempre um objecto de estado novo, mesmo quando o valor
 *     não mudava — e o `SchoolBrandAppearanceSync` chama `set({ schoolBrand })`
 *     num efeito;
 *  2. o efeito que segue a preferência de tema do sistema dependia desse objecto
 *     `state` inteiro e escrevia estado (`setPrefereEscuro`).
 *
 * Juntas: cada `set` sem alteração voltava a correr o efeito, que agendava novo
 * estado, que voltava a correr o efeito.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { useEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AppearanceProvider, useAppearance } from "@/lib/appearance";

function Sonda({ onState }: { onState: (state: unknown) => void }) {
  const { set, state } = useAppearance();
  onState(state);
  // Exactamente o que o SchoolBrandAppearanceSync faz: declara a marca da
  // escola num efeito, com dependências estáveis.
  useEffect(() => {
    set({ schoolBrand: null });
  }, [set]);
  return <span data-mode={state.mode} />;
}

// O jsdom não traz `matchMedia`; o provedor segue a preferência do sistema.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

describe("AppearanceProvider", () => {
  it("um `set` que não altera nada mantém a identidade do estado", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const seen: unknown[] = [];

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AppearanceProvider>
          <Sonda onState={(state) => seen.push(state)} />
        </AppearanceProvider>,
      );
    });

    // O `state` é dependência de efeitos do provedor. Se um `set` sem alteração
    // devolver um objecto novo, esses efeitos voltam a correr e escrevem estado
    // — é o anel que dava «Maximum update depth exceeded» (React #185).
    expect(new Set(seen).size).toBe(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
