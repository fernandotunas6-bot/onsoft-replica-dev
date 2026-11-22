/**
 * O teste que importa: um fragmento de outra escola nunca pode entrar numa
 * resposta. O filtro de pesquisa é construído no servidor a partir da
 * membership — nunca do que o cliente envia — e este teste fixa a sua forma.
 */
import { describe, expect, it } from "vitest";
import { buildSchoolFilter, KB_COLLECTION } from "@/lib/siga-ai/qdrant-client.server";

const SCHOOL = "11111111-1111-1111-1111-111111111111";
const OTHER_SCHOOL = "22222222-2222-2222-2222-222222222222";
const USER = "33333333-3333-3333-3333-333333333333";
const OTHER_USER = "44444444-4444-4444-4444-444444444444";

describe("isolamento entre escolas na base vectorial", () => {
  const filter = buildSchoolFilter(SCHOOL, USER);

  it("exige sempre a escola em `must`", () => {
    expect(filter.must).toEqual([{ key: "school_id", match: { value: SCHOOL } }]);
    expect(JSON.stringify(filter)).not.toContain(OTHER_SCHOOL);
  });

  it("exclui fragmentos desactivados", () => {
    expect(filter.must_not).toEqual([{ key: "active", match: { value: false } }]);
  });

  it("deixa passar escola e público, e pessoal só do dono", () => {
    expect(filter.min_should).toBe(1);
    expect(filter.should).toEqual([
      { key: "scope", match: { value: "school" } },
      { key: "scope", match: { value: "public" } },
      {
        must: [
          { key: "scope", match: { value: "personal" } },
          { key: "owner_user_id", match: { value: USER } },
        ],
      },
    ]);
  });

  it("muda com o utilizador: o pessoal de outro não entra", () => {
    expect(JSON.stringify(buildSchoolFilter(SCHOOL, USER))).not.toContain(OTHER_USER);
    expect(JSON.stringify(buildSchoolFilter(SCHOOL, OTHER_USER))).toContain(OTHER_USER);
  });

  it("usa uma colecção única do SIGA, não a global do NOMAD", () => {
    expect(KB_COLLECTION).toBe("siga_ai_kb");
    expect(KB_COLLECTION).not.toBe("nomad_knowledge_base");
  });
});
