import { describe, it, expect } from "vitest";
import { StudentExtensiveModal } from "@/features/students/components/StudentExtensiveModal";

describe("StudentExtensiveModal", () => {
  it("exporta componente React válido", () => {
    expect(StudentExtensiveModal).toBeDefined();
    expect(typeof StudentExtensiveModal).toBe("function");
  });
});
