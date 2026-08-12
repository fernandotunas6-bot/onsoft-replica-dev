import { describe, expect, it } from "vitest";
import { getPerfSnapshot, markPerfTap } from "@/lib/performance-supervisor";

describe("performance supervisor", () => {
  it("grades fast sessions as good by default", () => {
    const snapshot = getPerfSnapshot();
    expect(snapshot.grade).toBe("good");
    expect(snapshot.samples).toBeGreaterThanOrEqual(0);
  });

  it("records tap timestamps", () => {
    markPerfTap();
    const snapshot = getPerfSnapshot();
    expect(snapshot.lastTapMs).toBeTypeOf("number");
  });
});
