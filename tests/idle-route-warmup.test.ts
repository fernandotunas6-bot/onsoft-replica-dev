import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  resetIdleRouteWarmupForTests,
  scheduleIdleRouteWarmup,
} from "@/lib/idle-route-warmup";

describe("idle route warmup", () => {
  beforeEach(() => {
    resetIdleRouteWarmupForTests();
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("preloads at most four routes once per session", () => {
    const loaded: string[] = [];
    scheduleIdleRouteWarmup(
      ["/a", "/b", "/c", "/d", "/e"],
      (path) => loaded.push(path),
      { maxRoutes: 4 },
    );

    vi.advanceTimersByTime(5000);
    expect(loaded).toEqual(["/a", "/b", "/c", "/d"]);

    scheduleIdleRouteWarmup(["/x"], (path) => loaded.push(path));
    vi.advanceTimersByTime(5000);
    expect(loaded).toEqual(["/a", "/b", "/c", "/d"]);
  });
});
