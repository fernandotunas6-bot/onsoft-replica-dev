/**
 * Utilitários partilhados pelos testes de render de rotas.
 *
 * **Regra desta pasta:** mocka-se apenas (a) a fronteira de rede — as server
 * functions do TanStack Start, que num teste não têm servidor — e (b) as duas
 * peças que exigem contexto de aplicação que aqui não existe:
 * `@tanstack/react-router` e o `AppShell`. Tudo o resto corre a sério: os
 * hooks reais, os componentes de UI reais, as derivações com `useMemo` e a
 * árvore JSX completa da página. É exactamente aí que vivem os crashes de
 * render que os ~1.100 testes de lógica não vêem, porque nenhum monta nada.
 *
 * Não é ficheiro de teste (`include` do Vitest só apanha `*.test.{ts,tsx}`).
 */

import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType, ReactNode } from "react";

/**
 * Polyfills que o jsdom não traz e de que a UI real depende: o `recharts` usa
 * `ResizeObserver` no `ResponsiveContainer`, o Radix usa `matchMedia` e
 * `scrollIntoView`, e as listas longas usam `IntersectionObserver`. Sem isto o
 * teste rebentava no efeito de montagem em vez de testar a página.
 *
 * Ficam aqui — e não num `setupFiles` global — para não custarem nada aos
 * ~160 ficheiros de teste que correm em ambiente `node`.
 */
if (typeof window !== "undefined") {
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }

  /**
   * `IntersectionObserver` NÃO pode ser um noop: o `LazyVisible` só mostra os
   * filhos quando o observer reporta intersecção (e renderiza-os de imediato
   * se a API nem existir). Um noop deixava painéis inteiros — tabelas de
   * contas, listas de equipa — presos no placeholder, e os testes falhavam a
   * dizer que o conteúdo não existia. Aqui tudo conta como visível à cabeça,
   * que é o comportamento certo num DOM sem viewport.
   */
  class ImmediateIntersectionObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [{ isIntersecting: true, target, intersectionRatio: 1 } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }

  const globalWithObservers = globalThis as unknown as Record<string, unknown>;
  globalWithObservers["ResizeObserver"] ??= NoopObserver;
  globalWithObservers["IntersectionObserver"] ??= ImmediateIntersectionObserver;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  Element.prototype.scrollIntoView ??= () => {};
}

let routeSearch: Record<string, unknown> = {};
let routeParams: Record<string, string> = {};

/**
 * Define o que `Route.useSearch()` devolve no próximo render. Rotas como
 * `/pedagogica` leem a aba activa e os filtros profundos da query string, e
 * sem isto ficariam presas no ramo por omissão. Chamar antes de `renderRoute`.
 */
export function setRouteSearch(next: Record<string, unknown>) {
  routeSearch = next;
}

/** Equivalente de `setRouteSearch` para `Route.useParams()`. */
export function setRouteParams(next: Record<string, string>) {
  routeParams = next;
}

/** Repõe search e params — chamar no `afterEach` para não contaminar testes. */
export function resetRouteLocation() {
  routeSearch = {};
  routeParams = {};
}

/**
 * Substituto de `@tanstack/react-router` para rotas montadas fora do router.
 *
 * `createFileRoute` devolve as próprias opções acrescidas da API que as rotas
 * consomem por `Route.*` (`useSearch`, `useParams`, …), o que deixa o teste
 * chegar ao componente via `Route.component` sem registar nada num router real.
 */
export function reactRouterMock() {
  const routeApi = {
    useSearch: () => routeSearch,
    useParams: () => routeParams,
    useNavigate: () => () => {},
    useLoaderData: () => ({}),
    useRouteContext: () => ({}),
  };
  const fileRoute = () => (options: Record<string, unknown>) => ({ ...options, ...routeApi });
  return {
    createFileRoute: fileRoute,
    createLazyFileRoute: fileRoute,
    Link: ({ children }: { children?: ReactNode }) => <a href="#">{children}</a>,
    useRouter: () => ({ navigate: () => {}, invalidate: () => Promise.resolve() }),
    useRouterState: () => ({ location: { pathname: "/", search: {}, href: "/" } }),
    ...routeApi,
  };
}

/**
 * `useCurrentAccount` real depende da sessão Supabase do `AuthGate`, que num
 * teste não existe — sem sessão devolve um papel vazio e as rotas escondem
 * tudo o que é interessante atrás das verificações de permissão. Aqui entra um
 * Administrador; `overrides` serve para exercitar outros papéis.
 *
 * O `as never` é deliberado e está confinado a este ponto: o retorno real tem
 * ~20 campos e setters que nenhuma rota usa no caminho de render.
 */
export function currentAccountMock(overrides: Record<string, unknown> = {}) {
  return {
    useCurrentAccount: () =>
      ({
        id: "user-teste",
        email: "admin@escola.ao",
        name: "Admin Teste",
        firstName: "Admin",
        lastName: "Teste",
        phone: null,
        role: "Administrador",
        primaryRole: "Administrador",
        roles: ["Administrador"],
        setActiveRole: () => {},
        avatarUrl: null,
        initials: "AT",
        grants: {},
        schoolId: "escola-teste",
        schoolName: "Escola Teste",
        schoolSlug: "escola-teste",
        schools: [],
        activeSchool: null,
        setActiveSchoolId: () => {},
        linkedEntities: [],
        activeStudentId: null,
        activeStudent: null,
        setActiveStudentId: () => {},
        profile: { data: null, isLoading: false, isError: false },
        ...overrides,
      }) as never,
  };
}

/**
 * O `AppShell` real arrasta sidebar, command palette, launcher, contexto de
 * tenant e aparência — nada disso é o objecto do teste, e montá-lo obrigaria a
 * mockar mais do que se testa. Aqui é um passthrough do `children`.
 */
export function appShellMock() {
  return {
    AppShell: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  };
}

/** `MediaAvatar`/`MediaFrame` fazem medição de layout que o jsdom não tem. */
export function mediaFrameMock() {
  return {
    MediaAvatar: () => <div data-testid="media-avatar" />,
    MediaFrame: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  };
}

/**
 * `retry: false` e `gcTime: 0` — sem isto uma query que rejeita fica a tentar
 * de novo em background e o teste acaba com handles pendentes.
 */
export function renderRoute(Component: ComponentType) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Component />
    </QueryClientProvider>,
  );
}

/**
 * Extrai o componente de um módulo de rota. O `Route` exportado é, sob o mock
 * do router acima, o próprio objecto de opções passado a `createFileRoute`.
 */
export function routeComponentOf(mod: unknown): ComponentType {
  const route = (mod as { Route?: { component?: ComponentType } }).Route;
  if (!route?.component) {
    throw new Error("Módulo de rota sem `Route.component` — o mock do router mudou?");
  }
  return route.component;
}
