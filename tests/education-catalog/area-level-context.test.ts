import { describe, expect, it } from "vitest";
import { catalogSearch } from "@/features/education-catalog/api";
import {
  areasForContext,
  CatalogContextError,
  searchSubjects,
  subjectsForContext,
  validateAreaContext,
} from "@/features/education-catalog/catalog";
import { EDUCATION_STAGES } from "@/features/education-catalog/data/stages";
import {
  GLOBAL_SUBJECTS,
  SUBJECT_AREA_LABEL,
  SUBJECT_AREA_LEVELS,
  areaFitsLevel,
} from "@/features/education-catalog/data/subjects";

/**
 * «Seguir sempre o contexto de nível de ensino para cada área»: uma área de
 * formação (Saúde, Informática, Gestão…) só existe nos níveis em que é
 * leccionada, e cada disciplina da área tem de caber nesses níveis.
 */
describe("contexto de nível por área", () => {
  it("todas as áreas têm regra e nenhuma começa antes do ISCED 3", () => {
    expect(Object.keys(SUBJECT_AREA_LEVELS).sort()).toEqual(Object.keys(SUBJECT_AREA_LABEL).sort());
    for (const rule of Object.values(SUBJECT_AREA_LEVELS)) {
      expect(Math.min(...rule.levels)).toBeGreaterThanOrEqual(3);
    }
  });

  it("cada disciplina de uma área só tem níveis e vias que a área admite", () => {
    const fora = GLOBAL_SUBJECTS.filter((s) => s.area).flatMap((s) =>
      s.levels.flatMap((l) =>
        s.tracks
          .filter((t) => !areaFitsLevel(s.area!, l, t))
          .map((t) => `${s.code} (${s.area}) ISCED ${l} ${t}`),
      ),
    );
    expect(fora).toEqual([]);
  });

  it("nenhuma etapa do pré-escolar, primário ou I ciclo sugere disciplinas de especialidade", () => {
    for (const stage of EDUCATION_STAGES.filter((s) => s.isced <= 2)) {
      expect(areasForContext({ stageId: stage.id }), stage.id).toEqual([]);
      const comArea = subjectsForContext({ stageId: stage.id }).filter((s) => s.subject.area);
      expect(comArea.map((s) => `${stage.id}:${s.subject.code}`)).toEqual([]);
    }
  });

  it("o técnico-profissional angolano tem as áreas técnicas, com disciplinas de cada uma", () => {
    const areas = areasForContext({ stageId: "AO-ETP" });
    expect(areas.map((a) => a.area)).toEqual(
      expect.arrayContaining(["saude", "informatica", "gestao", "engenharia"]),
    );
    expect(areas.every((a) => a.subjects > 0)).toBe(true);
    const saude = subjectsForContext({ stageId: "AO-ETP" }, { area: "saude" });
    expect(saude.length).toBeGreaterThan(0);
    expect(saude.every((s) => s.subject.area === "saude")).toBe(true);
  });

  it("recusa uma área fora do nível e explica de onde começa", () => {
    expect(() => subjectsForContext({ stageId: "AO-EP" }, { area: "saude" })).toThrow(
      CatalogContextError,
    );
    const r = validateAreaContext("saude", { stageId: "AO-EP" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/Saúde não existe em «Ensino Primário.*ISCED 3/);
    expect(validateAreaContext("saude", { stageId: "AO-ETP" })).toEqual({ ok: true });
    // Via geral do secundário: Gestão não, Artes sim (Desenho, História da Arte).
    expect(validateAreaContext("gestao", { isced: 3, track: "general" }).ok).toBe(false);
    expect(validateAreaContext("artes", { isced: 3, track: "general" }).ok).toBe(true);
  });

  it("a pesquisa dentro da área não sai da área nem do nível", () => {
    const enf = searchSubjects("enf", { isced: 6, track: "higher" }, 20, "saude");
    expect(enf.length).toBeGreaterThan(0);
    expect(enf.every((s) => s.subject.area === "saude" && s.subject.levels.includes(6))).toBe(true);
    expect(searchSubjects("mat", { isced: 6, track: "higher" }, 20, "saude")).toEqual([]);
  });

  it("API: type=areas e area= respeitam o nível", () => {
    const run = (q: string) => catalogSearch(new URLSearchParams(q));
    expect(run("type=areas&stage=AO-EP").body["items"]).toEqual([]);
    const etp = run("type=areas&stage=AO-ETP");
    expect(etp.status).toBe(200);
    expect((etp.body["items"] as Array<{ area: string }>).map((a) => a.area)).toContain("saude");
    const ok = run("type=subjects&stage=AO-ETP&area=informatica");
    expect(ok.status).toBe(200);
    expect(
      (ok.body["items"] as Array<{ area: string }>).every((i) => i.area === "Informática"),
    ).toBe(true);
    const fora = run("type=subjects&stage=AO-EP&area=saude");
    expect(fora.status).toBe(400);
    expect(String(fora.body["error"])).toMatch(/não existe/);
    expect(run("type=subjects&stage=AO-ETP&area=xpto").status).toBe(400);
    expect(run("type=areas").status).toBe(400);
  });
});
