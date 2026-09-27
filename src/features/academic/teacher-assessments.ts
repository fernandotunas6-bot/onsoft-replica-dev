/**
 * Painel de avaliações do professor: por turma/disciplina que lecciona, no
 * trimestre em curso — componentes da pauta lançados (MAC, NPP, NPT), provas
 * marcadas e prazo de fecho. Leitura; o lançamento continua em Pedagógica.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { todayInLuanda } from "@/features/calendar/dates";
import {
  PAUTA_COMPONENTS,
  componentState,
  daysUntil,
  pickCurrentTerm,
  type ComponentCode,
} from "./teacher-assessment-board";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const uniq = (values: unknown[]) => [...new Set(values.map(str).filter(Boolean))];

export type TeacherAssessmentRow = {
  classSubjectId: string;
  classGroupId: string;
  subjectId: string;
  className: string;
  subjectName: string;
  enrolled: number;
  components: Record<ComponentCode, number>;
  pendingComponents: number;
  assessments: Array<{
    id: string;
    name: string;
    kind: string;
    component: string | null;
    date: string | null;
    scored: number;
  }>;
};

export type TeacherAssessmentBoard = {
  term: { sequence: number; name: string; endsOn: string; daysLeft: number } | null;
  rows: TeacherAssessmentRow[];
};

/** Montagem partilhada com o lembrete de prazos (cron). */
export async function buildTeacherAssessmentBoard(
  db: Db,
  schoolId: string,
  teacherId: string,
  today = todayInLuanda(),
): Promise<TeacherAssessmentBoard> {
  const { data: classSubjects } = await db
    .from("class_subjects")
    .select("id, class_group_id, subject_id")
    .eq("school_id", schoolId)
    .eq("teacher_id", teacherId)
    .eq("status", "active");
  const cs = (classSubjects ?? []) as Row[];
  if (!cs.length) return { term: null, rows: [] };

  const groupIds = uniq(cs.map((c) => c["class_group_id"]));
  const [{ data: groups }, { data: subjects }] = await Promise.all([
    db.from("class_groups").select("id, name, academic_year_id").in("id", groupIds),
    db
      .from("subjects")
      .select("id, name")
      .in("id", uniq(cs.map((c) => c["subject_id"]))),
  ]);
  const yearIds = uniq((groups ?? []).map((g: Row) => g["academic_year_id"]));
  const { data: terms } = yearIds.length
    ? await db
        .from("terms")
        .select("id, name, sequence, starts_on, ends_on, academic_year_id")
        .eq("school_id", schoolId)
        .in("academic_year_id", yearIds)
    : { data: [] as Row[] };
  const termRows = ((terms ?? []) as Row[]).map((t) => ({
    id: str(t["id"]),
    name: str(t["name"]),
    sequence: Number(t["sequence"]),
    starts_on: str(t["starts_on"]),
    ends_on: str(t["ends_on"]),
  }));
  const term = pickCurrentTerm(termRows, today);

  const [{ data: enrollments }, gradebooksRes, itemsRes] = await Promise.all([
    db
      .from("enrollments")
      .select("class_group_id")
      .eq("school_id", schoolId)
      .in("class_group_id", groupIds)
      .in("status", ["active", "pending"]),
    term
      ? db
          .from("gradebooks")
          .select("id, class_subject_id")
          .eq("school_id", schoolId)
          .eq("term_id", term.id)
          .in(
            "class_subject_id",
            cs.map((c) => str(c["id"])),
          )
      : Promise.resolve({ data: [] as Row[] }),
    term
      ? db
          .from("siga_assessment_items")
          .select("id, class_group_id, subject_id, name, kind, component, assessed_on")
          .eq("school_id", schoolId)
          .eq("term", term.sequence)
          .in("class_group_id", groupIds)
          .order("assessed_on", { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] as Row[] }),
  ]);
  const enrolledByGroup = new Map<string, number>();
  for (const e of (enrollments ?? []) as Row[]) {
    const g = str(e["class_group_id"]);
    enrolledByGroup.set(g, (enrolledByGroup.get(g) ?? 0) + 1);
  }

  const gradebooks = (gradebooksRes.data ?? []) as Row[];
  const gbIds = gradebooks.map((g) => str(g["id"]));
  const { data: gradeItems } = gbIds.length
    ? await db.from("grade_items").select("id, code, gradebook_id").in("gradebook_id", gbIds)
    : { data: [] as Row[] };
  const itemIds = ((gradeItems ?? []) as Row[]).map((i) => str(i["id"]));
  const scoredByItem = new Map<string, number>();
  for (let i = 0; i < itemIds.length; i += 100) {
    const { data: scores } = await db
      .from("grade_scores")
      .select("grade_item_id")
      .eq("school_id", schoolId)
      .in("grade_item_id", itemIds.slice(i, i + 100))
      .not("score", "is", null)
      .neq("status", "reversed");
    for (const s of (scores ?? []) as Row[]) {
      const id = str(s["grade_item_id"]);
      scoredByItem.set(id, (scoredByItem.get(id) ?? 0) + 1);
    }
  }
  const csByGradebook = new Map(gradebooks.map((g) => [str(g["id"]), str(g["class_subject_id"])]));
  const componentScored = new Map<string, Record<ComponentCode, number>>();
  for (const item of (gradeItems ?? []) as Row[]) {
    const code = str(item["code"]).toUpperCase() as ComponentCode;
    if (!PAUTA_COMPONENTS.includes(code)) continue;
    const csId = csByGradebook.get(str(item["gradebook_id"])) ?? "";
    const acc = componentScored.get(csId) ?? { MAC: 0, NPP: 0, NPT: 0 };
    acc[code] = Math.max(acc[code], scoredByItem.get(str(item["id"])) ?? 0);
    componentScored.set(csId, acc);
  }

  const assessments = (itemsRes.data ?? []) as Row[];
  const assessmentScored = new Map<string, number>();
  const aIds = assessments.map((a) => str(a["id"]));
  for (let i = 0; i < aIds.length; i += 100) {
    const { data: scores, error } = await db
      .from("siga_assessment_scores")
      .select("item_id")
      .in("item_id", aIds.slice(i, i + 100))
      .not("score", "is", null);
    if (error) break;
    for (const s of (scores ?? []) as Row[]) {
      const id = str(s["item_id"]);
      assessmentScored.set(id, (assessmentScored.get(id) ?? 0) + 1);
    }
  }

  const groupName = new Map(((groups ?? []) as Row[]).map((g) => [str(g["id"]), str(g["name"])]));
  const subjectName = new Map(
    ((subjects ?? []) as Row[]).map((s) => [str(s["id"]), str(s["name"])]),
  );
  const rows: TeacherAssessmentRow[] = cs
    .map((c) => {
      const classGroupId = str(c["class_group_id"]);
      const subjectId = str(c["subject_id"]);
      const enrolled = enrolledByGroup.get(classGroupId) ?? 0;
      const components = componentScored.get(str(c["id"])) ?? { MAC: 0, NPP: 0, NPT: 0 };
      return {
        classSubjectId: str(c["id"]),
        classGroupId,
        subjectId,
        className: groupName.get(classGroupId) || "Turma",
        subjectName: subjectName.get(subjectId) || "Disciplina",
        enrolled,
        components,
        pendingComponents: PAUTA_COMPONENTS.filter(
          (code) => !["done", "no-students"].includes(componentState(components[code], enrolled)),
        ).length,
        assessments: assessments
          .filter(
            (a) => str(a["class_group_id"]) === classGroupId && str(a["subject_id"]) === subjectId,
          )
          .map((a) => ({
            id: str(a["id"]),
            name: str(a["name"]),
            kind: str(a["kind"]),
            component: a["component"] ? str(a["component"]) : null,
            date: a["assessed_on"] ? str(a["assessed_on"]) : null,
            scored: assessmentScored.get(str(a["id"])) ?? 0,
          })),
      };
    })
    .sort(
      (a, b) =>
        a.className.localeCompare(b.className, "pt") ||
        a.subjectName.localeCompare(b.subjectName, "pt"),
    );

  return {
    term: term
      ? {
          sequence: term.sequence,
          name: term.name || `${term.sequence}.º trimestre`,
          endsOn: term.ends_on,
          daysLeft: daysUntil(term.ends_on, today),
        }
      : null,
    rows,
  };
}

export const getMyTeacherAssessmentBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeacherAssessmentBoard> => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return { term: null, rows: [] };
    const db = await loadSgaAdminClient();
    const { data: teacher } = await db
      .from("teachers")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!teacher?.id) return { term: null, rows: [] };
    return buildTeacherAssessmentBoard(db, membership.schoolId, String(teacher.id));
  });
