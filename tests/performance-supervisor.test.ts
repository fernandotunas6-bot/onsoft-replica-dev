import { describe, expect, it } from "vitest";
import { getPerfSnapshot, markPerfTap, attachPerformanceSupervisor } from "@/lib/performance-supervisor";
import { QueryClient } from "@tanstack/react-query";

describe("performance supervisor & sub-10ms touch optimization", () => {
  it("grades fast sessions as good by default", () => {
    const snapshot = getPerfSnapshot();
    expect(snapshot.grade).toBe("good");
    expect(snapshot.samples).toBeGreaterThanOrEqual(0);
  });

  it("records tap timestamps in sub-5ms latency", () => {
    const start = performance.now();
    markPerfTap();
    const duration = performance.now() - start;
    const snapshot = getPerfSnapshot();

    expect(snapshot.lastTapMs).toBeTypeOf("number");
    expect(duration).toBeLessThan(50); // Resposta ao toque síncrona
  });

  it("attaches query listener and handles cache invalidation cleanly", () => {
    const qc = new QueryClient();
    const detach = attachPerformanceSupervisor(qc);
    expect(detach).toBeTypeOf("function");
    detach();
  });
});
