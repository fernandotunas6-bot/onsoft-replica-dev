import * as React from "react";

/**
 * Pontos de corte do SIGA. O tablet tem o seu próprio degrau de propósito
 * (§63): a 768–1023px não queremos telemóvel esticado nem desktop apertado,
 * queremos master/detail.
 */
export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

function read(): Breakpoint {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w >= BREAKPOINTS.desktop) return "desktop";
  if (w >= BREAKPOINTS.tablet) return "tablet";
  return "mobile";
}

/**
 * Devolve o degrau actual. No servidor e no primeiro render devolve `desktop`
 * e `false` em `ready`: quem precisa de trocar de *componente* (tabela ↔ lista)
 * deve esperar por `ready` para não montar a árvore errada e voltar a montar.
 */
export function useBreakpoint(): { breakpoint: Breakpoint; ready: boolean } {
  const [state, setState] = React.useState<{ breakpoint: Breakpoint; ready: boolean }>({
    breakpoint: "desktop",
    ready: false,
  });

  React.useEffect(() => {
    const update = () => setState({ breakpoint: read(), ready: true });
    update();
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return state;
}

/** Atalho: verdadeiro abaixo de 768px, já depois da hidratação. */
export function useIsMobileViewport(): boolean {
  const { breakpoint, ready } = useBreakpoint();
  return ready && breakpoint === "mobile";
}

/** Verdadeiro em telemóvel **e** tablet — quem só quer saber "não é desktop". */
export function useIsCompactViewport(): boolean {
  const { breakpoint, ready } = useBreakpoint();
  return ready && breakpoint !== "desktop";
}

/** Estado da ligação, para o banner offline (§46). */
export function useOnlineStatus(): { online: boolean; wasOffline: boolean } {
  const [online, setOnline] = React.useState(true);
  const [wasOffline, setWasOffline] = React.useState(false);

  React.useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => {
      setOnline(false);
      setWasOffline(true);
    };
    setOnline(navigator.onLine);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return { online, wasOffline };
}
