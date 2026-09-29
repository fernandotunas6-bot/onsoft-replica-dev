import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// `upsert(..., { onConflict })` só funciona se houver na base um índice único
// (não parcial) exactamente com essas colunas. Sem ele o PostgREST responde 400
// ("there is no unique or exclusion constraint matching the ON CONFLICT
// specification") e a escrita inteira falha. Foi assim que aprovar pedidos de
// acesso falhava: `member_roles` tem a chave (school_id, membership_id, role_id)
// e o código pedia (membership_id, role_id).
//
// Chaves únicas lidas da produção a 2026-09-29 (pg_index, só índices totais),
// com as colunas por ordem alfabética. Um upsert numa tabela nova tem de ter a
// chave confirmada na produção e acrescentada aqui.
const UNICOS_PRODUCAO: Record<string, string[]> = {
  alumni_communication_preferences: ["id", "alumni_id,school_id"],
  alumni_event_registrations: ["id", "alumni_id,event_id"],
  alumni_opportunity_applications: ["id", "alumni_id,opportunity_id"],
  alumni_profiles: ["id", "school_id,student_id"],
  alumni_survey_responses: ["id", "alumni_id,survey_id"],
  curricula: ["id", "id,school_id", "academic_year_id,course_id,grade_level_id,school_id"],
  document_sequences: ["id", "document_type,school_id", "id,school_id"],
  hr_attendance_assurance_policies: ["school_id"],
  member_roles: ["membership_id,role_id,school_id"],
  profiles: ["id"],
  role_permissions: ["permission_id,role_id,school_id"],
  school_branding: ["id", "school_id"],
  school_email_routes: ["id", "school_id,source_address"],
  school_integration_secrets: ["id", "provider,school_id,secret_key"],
  school_integrations: ["id", "provider,school_id"],
  school_shifts: ["id", "id,school_id", "code,school_id"],
  siga_attendance_records: ["id", "session_id,student_id"],
  siga_exam_registrations: ["id", "enrollment_id,session_id,subject_id"],
  siga_lesson_meetings: ["id", "external_meeting_id,provider", "attendance_session_id,provider"],
  siga_lesson_reminder_settings: ["school_id"],
  siga_timetable_slot_details: ["id", "timetable_slot_id"],
  staff_module_grants: ["id", "module_key,school_id,user_id"],
  student_academic_history: ["id", "academic_year_label,grade_level,school_id,student_id"],
  student_risk_cases: ["id", "enrollment_id,school_id"],
  tenant_usage: ["id", "tenant_id"],
};

function upsertsNoCodigo() {
  const files = execSync("git ls-files src painel", { encoding: "utf8" })
    .split("\n")
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes("node_modules"));
  const found: Array<{ file: string; table: string; columns: string }> = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/onConflict:\s*"([^"]+)"/g)) {
      const before = source.slice(Math.max(0, match.index! - 1500), match.index);
      const tables = [...before.matchAll(/\.from\("(\w+)"\)/g)];
      const table = tables.at(-1)?.[1] ?? "?";
      const columns = match[1]!
        .split(",")
        .map((column) => column.trim())
        .sort()
        .join(",");
      found.push({ file, table, columns });
    }
  }
  return found;
}

describe("upsert: a chave de onConflict existe na produção", () => {
  const upserts = upsertsNoCodigo();

  it("encontra os upserts do código", () => {
    expect(upserts.length).toBeGreaterThan(20);
  });

  it("cada onConflict bate com um índice único da produção", () => {
    const wrong = upserts.filter(
      ({ table, columns }) => !(UNICOS_PRODUCAO[table] ?? []).includes(columns),
    );
    expect(wrong).toEqual([]);
  });
});
