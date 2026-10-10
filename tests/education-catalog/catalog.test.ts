import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EDUCATION_LEVELS, SUBJECTS } from "@/features/academic/curriculum-templates";
import {
  CatalogContextError,
  catalogCoverage,
  coursesFor,
  searchCourses,
  searchSubjects,
  subjectsForContext,
  validateSubjectContext,
} from "@/features/education-catalog/catalog";
import { COUNTRIES } from "@/features/education-catalog/data/countries";
import { GLOBAL_COURSES } from "@/features/education-catalog/data/courses";
import { ISCED_FIELDS, ISCED_LEVELS } from "@/features/education-catalog/data/isced";
import { CATALOG_SOURCES } from "@/features/education-catalog/data/sources";
import {
  AO_TEMPLATE_COURSE_MAP,
  AO_TEMPLATE_SUBJECT_MAP,
  EDUCATION_STAGES,
} from "@/features/education-catalog/data/stages";
import { GLOBAL_SUBJECTS, globalSubject } from "@/features/education-catalog/data/subjects";
import { buildCatalogSeedSql } from "@/features/education-catalog/seed-sql";

describe("integridade dos dados do catálogo", () => {
  it("tem os 9 níveis ISCED 2011 e as 11 grandes áreas ISCED-F (+ desconhecida)", () => {
    expect(ISCED_LEVELS.map((l) => l.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const broad = ISCED_FIELDS.filter((f) => !f.broad).map((f) => f.code);
    expect(broad).toEqual(["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "99"]);
    for (const f of ISCED_FIELDS.filter((x) => x.broad)) {
      expect(broad, f.code).toContain(f.broad);
    }
  });

  it("não repete códigos de disciplinas, cursos, etapas nem países", () => {
    for (const list of [GLOBAL_SUBJECTS, GLOBAL_COURSES, EDUCATION_STAGES, COUNTRIES] as Array<
      ReadonlyArray<{ code?: string; id?: string }>
    >) {
      const codes = list.map((x) => x.code ?? x.id);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("cada disciplina e curso aponta para uma área ISCED-F restrita que existe", () => {
    const narrow = new Set(ISCED_FIELDS.filter((f) => f.broad).map((f) => f.code));
    for (const s of GLOBAL_SUBJECTS) expect(narrow.has(s.field), s.code).toBe(true);
    for (const c of GLOBAL_COURSES) expect(narrow.has(c.field), c.code).toBe(true);
  });

  it("os planos só usam disciplinas e cursos do registo, compatíveis com o nível da etapa", () => {
    for (const st of EDUCATION_STAGES) {
      for (const course of st.courses) {
        expect(
          GLOBAL_COURSES.some((c) => c.code === course),
          `${st.id} → ${course}`,
        ).toBe(true);
      }
      for (const entry of st.curriculum) {
        if (entry.course) expect(st.courses, `${st.id}`).toContain(entry.course);
        for (const g of entry.grades) expect(st.grades, `${st.id} classe ${g}`).toContain(g);
        for (const code of [...entry.core, ...(entry.optional ?? [])]) {
          const s = globalSubject(code);
          expect(s, `${st.id}: ${code}`).toBeTruthy();
          expect(s!.levels, `${code} em ${st.id} (ISCED ${st.isced})`).toContain(st.isced);
          expect(s!.tracks, `${code} em ${st.id} (${st.track})`).toContain(st.track);
        }
      }
    }
  });

  it("cada etapa e cada país com etapas usam uma fonte registada", () => {
    const ids = new Set(CATALOG_SOURCES.map((s) => s.id));
    for (const st of EDUCATION_STAGES) expect(ids.has(st.source), st.id).toBe(true);
    for (const c of COUNTRIES) {
      expect(c.stagesLoaded, c.code).toBe(EDUCATION_STAGES.some((s) => s.country === c.code));
    }
  });

  it("não marca como oficial verificado o que ainda não foi conferido", () => {
    // Só as classificações internacionais estão conferidas; os planos nacionais
    // ficam em revisão até alguém os conferir com o documento publicado.
    for (const st of EDUCATION_STAGES) expect(st.status, st.id).not.toBe("official_verified");
  });
});

describe("Angola: o catálogo cobre os modelos de estrutura já usados", () => {
  it("todas as disciplinas e cursos dos modelos têm equivalente global", () => {
    for (const code of Object.keys(SUBJECTS)) {
      const global = AO_TEMPLATE_SUBJECT_MAP[code] ?? code;
      expect(globalSubject(global), `${code} → ${global}`).toBeTruthy();
    }
    for (const level of EDUCATION_LEVELS) {
      if (level.courses.length < 2 && level.kind !== "undergraduate") continue;
      for (const c of level.courses) {
        expect(AO_TEMPLATE_COURSE_MAP[c.code], `${level.id}/${c.code}`).toBeTruthy();
      }
    }
  });

  it("10ª classe de CFB tem Física; 1ª classe do primário não", () => {
    const cfb = subjectsForContext(
      { stageId: "AO-ESG2", course: "SEC-CFB", grade: 10 },
      { planOnly: true },
    );
    expect(cfb.map((s) => s.subject.code)).toContain("FIS");
    const ep1 = subjectsForContext({ stageId: "AO-EP", grade: 1 }, { planOnly: true });
    expect(ep1.map((s) => s.subject.code)).toEqual(expect.arrayContaining(["LP", "MAT", "EM"]));
    expect(ep1.map((s) => s.subject.code)).not.toContain("FIS");
  });
});

describe("contexto de nível obrigatório", () => {
  it("recusa etapa, curso ou classe que não existem", () => {
    expect(() => subjectsForContext({ stageId: "XX-NADA" })).toThrow(CatalogContextError);
    expect(() => subjectsForContext({ stageId: "AO-EP", course: "LIC-DIR" })).toThrow(/não existe/);
    expect(() => subjectsForContext({ stageId: "AO-EP", grade: 10 })).toThrow(/não pertence/);
  });

  it("não sugere disciplinas de outro nível", () => {
    const primario = subjectsForContext({ stageId: "AO-EP" }).map((s) => s.subject.code);
    expect(primario).not.toContain("TERM");
    expect(primario).not.toContain("FIS");
    const superior = subjectsForContext({ isced: 6, track: "higher" }).map((s) => s.subject.code);
    expect(superior).toContain("TERM");
    expect(superior).not.toContain("EM");
  });

  it("explica porque uma disciplina não cabe no contexto", () => {
    expect(validateSubjectContext("FIS", { stageId: "AO-EP" })).toEqual({
      ok: false,
      reason: "Física não é uma disciplina de «Ensino Primário».",
    });
    expect(validateSubjectContext("FIS", { stageId: "AO-ESG2" })).toEqual({ ok: true });
    expect(validateSubjectContext("TLP", { stageId: "AO-ESG2" })).toMatchObject({ ok: false });
    expect(validateSubjectContext("NADA", { stageId: "AO-EP" })).toMatchObject({ ok: false });
  });

  it("põe as disciplinas do plano primeiro e marca-as", () => {
    const list = subjectsForContext({ stageId: "PT-SEC", course: "SEC-CT", grade: 10 });
    expect(list[0]!.inPlan).toBe("core");
    const fqa = list.find((s) => s.subject.code === "FQA");
    expect(fqa?.inPlan).toBe("optional");
    expect(list.some((s) => s.inPlan === null)).toBe(true);
  });

  it("usa o nome do país: Português em Portugal, Língua Portuguesa em Angola", () => {
    const pt = subjectsForContext({ stageId: "PT-EB1", grade: 1 }, { planOnly: true });
    expect(pt.find((s) => s.subject.code === "LP")?.displayName).toBe("Português");
    const ao = subjectsForContext({ stageId: "AO-EP", grade: 1 }, { planOnly: true });
    expect(ao.find((s) => s.subject.code === "LP")?.displayName).toBe("Língua Portuguesa");
  });
});

describe("pesquisa", () => {
  const names = (rs: Array<{ displayName?: string; course?: { name: string } }>) =>
    rs.map((r) => r.displayName ?? r.course!.name);

  it("«mat» no superior sugere as matemáticas", () => {
    const rs = names(searchSubjects("mat", { isced: 6, track: "higher" }));
    expect(rs).toEqual(
      expect.arrayContaining([
        "Matemática Aplicada",
        "Matemática Financeira",
        "Matemática Discreta",
        "Métodos Matemáticos",
      ]),
    );
  });

  it("«mat» no I Ciclo angolano põe Matemática primeiro", () => {
    expect(searchSubjects("mat", { stageId: "AO-ESG1" })[0]!.subject.code).toBe("MAT");
  });

  it("«enf» sugere cursos e disciplinas de enfermagem", () => {
    expect(names(searchCourses("enf"))).toEqual(
      expect.arrayContaining(["Enfermagem Geral", "Enfermagem"]),
    );
    expect(names(searchSubjects("enf", { isced: 5, track: "technical" }))).toEqual(
      expect.arrayContaining([
        "Enfermagem Fundamental",
        "Enfermagem Comunitária",
        "Enfermagem Médico-Cirúrgica",
      ]),
    );
  });

  it("ignora acentos, aceita iniciais, códigos e erros de uma letra", () => {
    const ctx = { stageId: "AO-ESG1" } as const;
    expect(searchSubjects("matematica", ctx)[0]!.subject.code).toBe("MAT");
    expect(searchSubjects("EMC", ctx)[0]!.subject.code).toBe("EMC");
    expect(searchSubjects("emc", ctx)[0]!.subject.code).toBe("EMC");
    expect(searchSubjects("Quimca", ctx)[0]!.subject.code).toBe("QUI");
    expect(searchSubjects("geografai", ctx)[0]!.subject.code).toBe("GEO");
    expect(searchSubjects("english", ctx)[0]!.subject.code).toBe("ING");
  });

  it("filtra cursos por país e etapa", () => {
    const ao = coursesFor({ country: "AO" }).map((c) => c.course.code);
    expect(ao).toContain("SEC-CFB");
    expect(ao).not.toContain("SEC-CT");
    const ptSec = coursesFor({ stageId: "PT-SEC" }).map((c) => c.course.code);
    expect(ptSec.sort()).toEqual(["SEC-AV", "SEC-CSE", "SEC-CT", "SEC-LH"]);
    // País sem etapas carregadas: mostra o registo genérico todo.
    expect(coursesFor({ country: "BR" }).length).toBe(GLOBAL_COURSES.length);
  });
});

describe("cobertura real", () => {
  it("diz que Moçambique tem etapas mas nenhum plano, e o Brasil nada", () => {
    const cov = Object.fromEntries(catalogCoverage().map((c) => [c.country, c]));
    expect(cov.MZ!.stages).toBeGreaterThan(0);
    expect(cov.MZ!.planEntries).toBe(0);
    expect(cov.BR!.stages).toBe(0);
    expect(cov.AO!.stagesWithPlan).toBeGreaterThanOrEqual(4);
    expect(cov.PT!.stagesWithPlan).toBeGreaterThanOrEqual(4);
  });
});

describe("carga SQL gerada", () => {
  it("supabase/seeds/education/catalog.sql está em dia com os dados (npm run siga:catalog-seed)", () => {
    const file = readFileSync(join(process.cwd(), "supabase/seeds/education/catalog.sql"), "utf8");
    expect(file).toBe(buildCatalogSeedSql());
  });
});
