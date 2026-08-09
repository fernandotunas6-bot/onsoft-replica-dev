/**
 * Medição de Web Vitals (sem dependências): FCP, LCP, CLS, INP e TTFB.
 * Os valores ficam em `window.__sigaVitals` para auditoria (Lighthouse/manual)
 * e servem para calibrar a pré-busca de rotas e dados.
 */
export type Vitals = Record<string, number>;

declare global {
  interface Window {
    __sigaVitals?: Vitals;
  }
}

export function measureVitals() {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;
  if (window.__sigaVitals) return;
  const vitals: Vitals = {};
  window.__sigaVitals = vitals;

  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (nav) vitals["TTFB"] = Math.round(nav.responseStart);

  const observe = (type: string, cb: (entry: PerformanceEntry) => void) => {
    try {
      const po = new PerformanceObserver((list) => list.getEntries().forEach(cb));
      po.observe({ type, buffered: true } as PerformanceObserverInit);
    } catch {
      /* tipo não suportado neste browser */
    }
  };

  observe("paint", (e) => {
    if (e.name === "first-contentful-paint") vitals["FCP"] = Math.round(e.startTime);
  });
  observe("largest-contentful-paint", (e) => {
    vitals["LCP"] = Math.round(e.startTime);
  });
  observe("layout-shift", (e) => {
    const shift = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
    if (shift.hadRecentInput) return;
    vitals["CLS"] = Number(((vitals["CLS"] ?? 0) + shift.value).toFixed(4));
  });
  observe("event", (e) => {
    const dur = Math.round(e.duration);
    if (dur > (vitals["INP"] ?? 0)) vitals["INP"] = dur;
  });
}
