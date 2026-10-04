import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { submitPublicEnrollmentInputSchema } from "@/features/enrollment/schemas";

const source = readFileSync("src/features/enrollment/server.ts", "utf8");
const fn = (name: string) => {
  const start = source.indexOf(`export const ${name}`);
  return source.slice(start, source.indexOf("export const", start + 1));
};

describe("curso pretendido na candidatura pública", () => {
  it("é opcional e tem de ser um id válido", () => {
    const base = { slug: "escola-matricula", person: { full_name: "Ana Silva" } };
    expect(submitPublicEnrollmentInputSchema.safeParse(base).success).toBe(true);
    expect(
      submitPublicEnrollmentInputSchema.safeParse({ ...base, desiredProgramId: "x" }).success,
    ).toBe(false);
  });

  it("o servidor só aceita cursos activos do Superior da própria escola", () => {
    const body = fn("submitPublicEnrollment");
    expect(body).toContain('.eq("school_id", form.school_id)');
    expect(body).toContain('.in("kind", ["undergraduate", "postgraduate"])');
    expect(body).toContain('.eq("is_active", true)');
    expect(fn("getPublicEnrollmentForm")).toContain('.eq("school_id", form.school_id)');
  });
});
