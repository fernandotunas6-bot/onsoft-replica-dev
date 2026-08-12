/** Pré-aquecimento de rotas em idle — uma vez por sessão, no máximo 4 rotas. */
let sessionWarmed = false;

export function scheduleIdleRouteWarmup(
  routes: readonly string[],
  preloadRoute: (path: string) => void,
  options?: { maxRoutes?: number },
) {
  if (sessionWarmed || typeof setTimeout === "undefined") return;
  sessionWarmed = true;

  const maxRoutes = options?.maxRoutes ?? 4;
  const queue = routes.slice(0, maxRoutes);
  if (!queue.length) return;

  const globalWindow = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  const ric = globalWindow.requestIdleCallback;

  let cancelled = false;
  let timer = 0;

  const step = () => {
    if (cancelled) return;
    const path = queue.shift();
    if (!path) return;
    preloadRoute(path);
    if (queue.length === 0) return;
    if (ric) ric(step, { timeout: 1500 });
    else timer = setTimeout(step, 250);
  };

  if (ric) ric(step, { timeout: 2500 });
  else timer = setTimeout(step, 600);

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

export function resetIdleRouteWarmupForTests() {
  sessionWarmed = false;
}
