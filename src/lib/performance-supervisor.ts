import type { QueryClient } from "@tanstack/react-query";

export type SlowQueryEntry = {
  queryKey: string;
  durationMs: number;
  at: number;
};

export type PerfSnapshot = {
  vitals: Record<string, number>;
  slowQueries: SlowQueryEntry[];
  samples: number;
  avgQueryMs: number;
  p95QueryMs: number;
  lastTapMs: number | null;
  grade: "good" | "ok" | "slow";
};

const SLOW_MS = 400;
const MAX_SLOW = 24;
const MAX_SAMPLES = 120;

let slowQueries: SlowQueryEntry[] = [];
const queryTimings: number[] = [];
const queryStart = new Map<string, number>();
let lastTapMs: number | null = null;

declare global {
  interface Window {
    __sigaPerf?: PerfSnapshot;
  }
}

function queryHash(key: unknown) {
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx] ?? 0;
}

function gradeFromSnapshot(vitals: Record<string, number>, p95: number): PerfSnapshot["grade"] {
  const inp = vitals["INP"] ?? 0;
  const lcp = vitals["LCP"] ?? 0;
  if (inp > 200 || p95 > 900 || lcp > 2500) return "slow";
  if (inp > 120 || p95 > 500 || lcp > 1800) return "ok";
  return "good";
}

export function markPerfTap() {
  if (typeof performance === "undefined") return;
  lastTapMs = performance.now();
}

export function getPerfSnapshot(): PerfSnapshot {
  const vitals =
    typeof window !== "undefined" && window.__sigaVitals ? { ...window.__sigaVitals } : {};
  const avgQueryMs = queryTimings.length
    ? Math.round(queryTimings.reduce((sum, ms) => sum + ms, 0) / queryTimings.length)
    : 0;
  const p95QueryMs = percentile(queryTimings, 95);
  const snapshot: PerfSnapshot = {
    vitals,
    slowQueries: [...slowQueries],
    samples: queryTimings.length,
    avgQueryMs,
    p95QueryMs,
    lastTapMs,
    grade: gradeFromSnapshot(vitals, p95QueryMs),
  };
  if (typeof window !== "undefined") window.__sigaPerf = snapshot;
  return snapshot;
}

export function attachPerformanceSupervisor(queryClient: QueryClient) {
  if (typeof window === "undefined") return () => {};

  const onTap = () => {
    if (document.visibilityState !== "visible") return;
    markPerfTap();
  };
  window.addEventListener("pointerdown", onTap, { passive: true });

  const unsub = queryClient.getQueryCache().subscribe((event) => {
    if (document.visibilityState !== "visible") return;
    const query = event?.query;
    if (!query || event.type !== "updated") return;

    const hash = queryHash(query.queryKey);
    const { fetchStatus, status, dataUpdatedAt, errorUpdatedAt } = query.state;

    if (fetchStatus === "fetching") {
      if (!queryStart.has(hash)) queryStart.set(hash, performance.now());
      return;
    }

    if (fetchStatus !== "idle") return;
    const start = queryStart.get(hash);
    if (!start) return;
    queryStart.delete(hash);

    const endedAt = Math.max(dataUpdatedAt, errorUpdatedAt);
    if (!endedAt) return;

    const durationMs = Math.round(performance.now() - start);
    queryTimings.push(durationMs);
    if (queryTimings.length > MAX_SAMPLES) queryTimings.shift();

    if (durationMs >= SLOW_MS) {
      slowQueries.unshift({ queryKey: hash, durationMs, at: Date.now() });
      if (slowQueries.length > MAX_SLOW) slowQueries.pop();
    }

    getPerfSnapshot();
  });

  getPerfSnapshot();

  return () => {
    window.removeEventListener("pointerdown", onTap);
    unsub();
  };
}
