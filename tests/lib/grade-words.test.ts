import { describe, expect, it } from "vitest";
import { gradeInWords } from "@/lib/grade-words";

describe("nota por extenso", () => {
  it("inteiros e uma casa decimal", () => {
    expect(gradeInWords(14).text).toBe("14 (catorze) valores");
    expect(gradeInWords(13.5).text).toBe("13,5 (treze vírgula cinco) valores");
    expect(gradeInWords(16.04).text).toBe("16 (dezasseis) valores");
    expect(gradeInWords(20).words).toBe("vinte");
    expect(gradeInWords(9.96).digits).toBe("10");
  });
});
