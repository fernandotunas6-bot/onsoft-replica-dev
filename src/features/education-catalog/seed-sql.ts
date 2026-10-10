/**
 * Gera o SQL que carrega o catálogo (supabase/seeds/education/catalog.sql) a
 * partir dos dados em `data/`. Uma só fonte: o browser pesquisa sobre os
 * mesmos dados que a base guarda. O teste education-catalog/seed-sql garante
 * que o ficheiro gerado não fica para trás.
 *
 * Idempotente: `ON CONFLICT … DO UPDATE` em tudo; corre as vezes que for
 * preciso. Não apaga linhas que deixaram de existir nos dados — retirar algo
 * do catálogo faz-se mudando o estado para `archived`, nunca apagando.
 */
import { COUNTRIES } from "./data/countries";
import { COURSE_KIND_ISCED, GLOBAL_COURSES } from "./data/courses";
import { ISCED_FIELDS, ISCED_LEVELS } from "./data/isced";
import { CATALOG_SOURCES } from "./data/sources";
import { EDUCATION_STAGES } from "./data/stages";
import { GLOBAL_SUBJECTS } from "./data/subjects";

const lit = (v: string | number | boolean | null | undefined): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${v.replace(/'/g, "''")}'`;
};
const textArr = (xs: readonly string[]) => `ARRAY[${xs.map(lit).join(", ")}]::text[]`;
const intArr = (xs: readonly number[]) => `ARRAY[${xs.join(", ")}]::smallint[]`;
const json = (v: unknown) => `${lit(JSON.stringify(v ?? {}))}::jsonb`;

function upsert(table: string, cols: string[], rows: string[][], key: string[]) {
  if (!rows.length) return "";
  const updates = cols.filter((c) => !key.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);
  return [
    `INSERT INTO public.${table} (${cols.join(", ")}) VALUES`,
    rows.map((r) => `  (${r.join(", ")})`).join(",\n"),
    `ON CONFLICT (${key.join(", ")}) DO UPDATE SET ${updates.join(", ")};`,
    "",
  ].join("\n");
}

export function buildCatalogSeedSql() {
  const parts: string[] = [
    "-- GERADO por scripts/siga/gen-education-catalog-seed.ts a partir de",
    "-- src/features/education-catalog/data/. Não editar à mão.",
    "-- Requer a migração 20261010120000_global_education_catalog.sql.",
    "BEGIN;",
    "",
  ];

  parts.push(
    upsert(
      "catalog_sources",
      [
        "id",
        "title",
        "authority",
        "country_code",
        "url",
        "version",
        "licence",
        "recorded_on",
        "status",
        "notes",
      ],
      CATALOG_SOURCES.map((s) => [
        lit(s.id),
        lit(s.title),
        lit(s.authority),
        lit(s.country),
        lit(s.url),
        lit(s.version),
        lit(s.licence),
        `${lit(s.recordedOn)}::date`,
        lit(s.status),
        lit(s.notes ?? null),
      ]),
      ["id"],
    ),
  );

  parts.push(
    upsert(
      "global_education_levels",
      ["level", "code", "name", "name_en", "source_id"],
      ISCED_LEVELS.map((l) => [
        lit(l.level),
        lit(l.code),
        lit(l.name),
        lit(l.nameEn),
        lit(l.source),
      ]),
      ["level"],
    ),
  );

  // Grandes áreas antes das restritas (chave estrangeira broad_code).
  const fields = [...ISCED_FIELDS].sort(
    (a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code),
  );
  parts.push(
    upsert(
      "global_education_fields",
      ["code", "name", "name_en", "broad_code", "source_id"],
      fields.map((f) => [
        lit(f.code),
        lit(f.name),
        lit(f.nameEn),
        lit(f.broad ?? null),
        lit(f.source),
      ]),
      ["code"],
    ),
  );

  parts.push(
    upsert(
      "catalog_countries",
      ["code", "name", "locale", "currency_code", "grade_unit", "admin_division", "stages_loaded"],
      COUNTRIES.map((c) => [
        lit(c.code),
        lit(c.name),
        lit(c.locale),
        lit(c.currency),
        lit(c.gradeUnit),
        lit(c.adminDivision),
        lit(c.stagesLoaded),
      ]),
      ["code"],
    ),
  );

  parts.push(
    upsert(
      "global_subject_catalog",
      [
        "code",
        "name",
        "short_name",
        "aliases",
        "field_code",
        "isced_levels",
        "tracks",
        "local_names",
        "area",
        "source_id",
        "status",
      ],
      GLOBAL_SUBJECTS.map((s) => [
        lit(s.code),
        lit(s.name),
        lit(s.short),
        textArr(s.aliases),
        lit(s.field),
        intArr(s.levels),
        textArr(s.tracks),
        json(s.localNames),
        lit(s.area ?? null),
        lit("siga-catalogo"),
        lit("institutional_approved"),
      ]),
      ["code"],
    ),
  );

  parts.push(
    upsert(
      "global_course_catalog",
      [
        "code",
        "name",
        "short_name",
        "aliases",
        "kind",
        "isced_level",
        "field_code",
        "typical_years",
        "source_id",
        "status",
      ],
      GLOBAL_COURSES.map((c) => [
        lit(c.code),
        lit(c.name),
        lit(c.short),
        textArr(c.aliases),
        lit(c.kind),
        lit(COURSE_KIND_ISCED[c.kind]),
        lit(c.field),
        lit(c.typicalYears ?? null),
        lit("siga-catalogo"),
        lit("institutional_approved"),
      ]),
      ["code"],
    ),
  );

  parts.push(
    upsert(
      "country_education_stages",
      [
        "id",
        "country_code",
        "name",
        "cycle",
        "isced_level",
        "track",
        "grades",
        "grade_unit",
        "period_models",
        "assessment",
        "course_codes",
        "source_id",
        "status",
        "version",
        "effective_from",
        "notes",
      ],
      EDUCATION_STAGES.map((s) => [
        lit(s.id),
        lit(s.country),
        lit(s.name),
        lit(s.cycle ?? null),
        lit(s.isced),
        lit(s.track),
        intArr(s.grades),
        lit(s.gradeUnit),
        textArr(s.periodModels),
        s.assessment ? json(s.assessment) : "NULL",
        textArr(s.courses),
        lit(s.source),
        lit(s.status),
        lit(s.version),
        s.effectiveFrom ? `${lit(s.effectiveFrom)}::date` : "NULL",
        lit(s.notes ?? null),
      ]),
      ["id"],
    ),
  );

  // Plano curricular: uma linha por (etapa, curso, classe, disciplina).
  const entryRows: string[][] = [];
  for (const s of EDUCATION_STAGES) {
    for (const e of s.curriculum) {
      for (const grade of e.grades) {
        const add = (code: string, mandatory: boolean) =>
          entryRows.push([
            lit(s.id),
            lit(e.course),
            lit(grade),
            lit(code),
            lit(mandatory),
            lit(s.version),
            lit(s.source),
            lit(s.status),
          ]);
        e.core.forEach((c) => add(c, true));
        (e.optional ?? []).filter((c) => !e.core.includes(c)).forEach((c) => add(c, false));
      }
    }
  }
  if (entryRows.length) {
    parts.push(
      [
        "INSERT INTO public.country_curriculum_entries",
        "  (stage_id, course_code, grade, subject_code, is_mandatory, version, source_id, status) VALUES",
        entryRows.map((r) => `  (${r.join(", ")})`).join(",\n"),
        "ON CONFLICT (stage_id, coalesce(course_code, ''), grade, subject_code, version)",
        "DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, source_id = EXCLUDED.source_id, status = EXCLUDED.status;",
        "",
      ].join("\n"),
    );
  }

  parts.push("COMMIT;", "");
  return parts.join("\n");
}
