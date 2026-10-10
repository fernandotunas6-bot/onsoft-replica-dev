import { describe, expect, it } from "vitest";
import { catalogSearch } from "@/features/education-catalog/api";

const run = (query: string) => catalogSearch(new URLSearchParams(query));
type Item = Record<string, unknown>;
const items = (r: ReturnType<typeof run>) => r.body["items"] as Item[];

describe("API de pesquisa do catálogo", () => {
  it("disciplinas da etapa, com o plano marcado", () => {
    const r = run("type=subjects&stage=AO-ESG2&course=SEC-CFB&grade=10");
    expect(r.status).toBe(200);
    const fis = items(r).find((i) => i["code"] === "FIS");
    expect(fis).toMatchObject({ name: "Física", inPlan: "core", statusLabel: "Em revisão" });
    expect(r.body["version"]).toBeTruthy();
  });

  it("pesquisa tolerante dentro do nível, com nome do país", () => {
    expect(items(run("stage=AO-ESG1&q=quimca"))[0]).toMatchObject({ code: "QUI", match: "typo" });
    expect(items(run("stage=PT-EB1&grade=1&q=portugues"))[0]).toMatchObject({
      code: "LP",
      name: "Português",
      canonicalName: "Língua Portuguesa",
    });
    const sup = items(run("isced=6&track=higher&q=mat")).map((i) => i["name"]);
    expect(sup).toEqual(expect.arrayContaining(["Matemática Discreta", "Métodos Matemáticos"]));
  });

  it("recusa disciplinas sem nível e contextos que não existem", () => {
    expect(run("type=subjects&q=mat")).toMatchObject({ status: 400 });
    expect(String(run("type=subjects").body["error"])).toMatch(/nível de ensino/);
    expect(run("stage=XX-NADA")).toMatchObject({ status: 400 });
    expect(String(run("stage=AO-EP&grade=10").body["error"])).toMatch(/não pertence/);
    expect(run("stage=AO-EP&grade=abc")).toMatchObject({ status: 400 });
    expect(run("isced=9&track=general")).toMatchObject({ status: 400 });
    expect(run("isced=2&track=outra")).toMatchObject({ status: 400 });
  });

  it("cursos por país, etapa, tipo e pesquisa", () => {
    const pt = items(run("type=courses&stage=PT-SEC")).map((i) => i["code"]);
    expect([...pt].sort()).toEqual(["SEC-AV", "SEC-CSE", "SEC-CT", "SEC-LH"]);
    const enf = items(run("type=courses&q=enf")).map((i) => i["name"]);
    expect(enf).toEqual(expect.arrayContaining(["Enfermagem Geral", "Enfermagem"]));
    expect(items(run("type=courses&kind=master")).every((i) => i["kind"] === "master")).toBe(true);
    expect(run("type=courses&kind=nada")).toMatchObject({ status: 400 });
  });

  it("etapas de um país, com rótulos das classes", () => {
    const r = run("type=stages&country=pt");
    const eb1 = items(r).find((i) => i["id"] === "PT-EB1")!;
    expect(eb1["grades"]).toEqual([
      { n: 1, label: "1.º ano" },
      { n: 2, label: "2.º ano" },
      { n: 3, label: "3.º ano" },
      { n: 4, label: "4.º ano" },
    ]);
    expect(run("type=stages")).toMatchObject({ status: 400 });
    expect(items(run("type=stages&country=BR"))).toEqual([]);
  });

  it("limita o tamanho da resposta e do texto", () => {
    expect(items(run("isced=3&track=general&limit=5"))).toHaveLength(5);
    expect(run("isced=3&track=general&limit=500")).toMatchObject({ status: 400 });
    expect(run(`stage=AO-ESG1&q=${"a".repeat(5000)}`).status).toBe(200);
    expect(run("type=outra")).toMatchObject({ status: 400 });
  });
});
