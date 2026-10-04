import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("src/features/alumni/server.ts", "utf8");
const selfService = readFileSync("src/features/alumni/self-service.ts", "utf8");
const handler = (source: string, name: string) => {
  const start = source.indexOf(`export const ${name} = createServerFn`);
  return source.slice(start, source.indexOf("export const ", start + 10));
};

describe("rede Alumni: directório só para o gabinete", () => {
  it.each(["listAlumni", "getAlumniProfile", "getAlumniOverview"])(
    "%s exige Administrador ou Secretaria",
    (name) => {
      const body = handler(server, name);
      expect(body).toContain("resolveOfficeContext(context.supabase, context.userId)");
      expect(body).not.toContain("resolveContext(context.userId)");
    },
  );

  it("o gabinete é Administrador e Secretaria no módulo pessoas", () => {
    const helper = server.slice(server.indexOf("async function resolveOfficeContext"));
    expect(helper.slice(0, 400)).toMatch(
      /requireSgaWriterFor\("pessoas"[\s\S]*"Administrador",\s*"Secretaria"/,
    );
  });
});

describe("activar o portal Alumni", () => {
  const claim = handler(selfService, "claimMyAlumniProfile");

  it("exige e-mail confirmado antes de procurar a ficha", () => {
    expect(claim.indexOf("email_confirmed_at")).toBeGreaterThan(-1);
    expect(claim.indexOf("email_confirmed_at")).toBeLessThan(claim.indexOf('.from("people")'));
  });

  it("procura o e-mail sem curingas", () => {
    expect(claim.replace(/\s+/g, " ")).toMatch(/\.ilike\( "email", email\.replace\(/);
  });
});
