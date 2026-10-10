/**
 * Revisão das disciplinas da escola contra o catálogo (leitura) e correcção
 * dos nomes escolhidos (escrita).
 *
 * Lê e escreve com o cliente do utilizador (`context.supabase`), que respeita
 * o RLS (ARQ-01). Políticas da produção (supabase/PRODUCTION_SNAPSHOT.json):
 *   - `subjects_read`: permissão `academic.subjects.read`;
 *   - `subjects_update_authorized`: `is_aal2()` + `academic.subjects.manage`;
 *   - `class_subjects_read`, `teacher_subjects_select_authorized`,
 *     `Read curriculum_subjects in own school`, `schools_select_member`.
 * O `requireSgaWriterFor(…, ["Administrador", "Secretaria"])` continua por
 * cima: a política restringe à escola e à permissão, a aplicação ao cargo.
 *
 * As contagens de uso são só informativas. A leitura de `curriculum_subjects`
 * usa `current_school_id()` (a primeira escola da conta): numa conta com
 * várias escolas pode contar a menos — não muda nenhuma sugestão.
 *
 * A correcção volta a calcular a revisão no servidor e só aplica as
 * sugestões que ela própria faz: o browser escolhe quais, não o texto.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { requireSgaWriterFor, requireSgaWriterForWrite } from "@/integrations/supabase/sga-admin";
import type { Database } from "@/integrations/supabase/types";
import { recordAuditBatch } from "@/features/audit/record-audit";
import { requireAal2 } from "@/features/hr/require-aal2";
import { countryFromCurrency, reviewSubjects, type SubjectReview } from "./subject-review";

type Db = SupabaseClient<Database>;

async function loadReview(db: Db, schoolId: string): Promise<SubjectReview> {
  const [school, subjects, classLinks, curriculumLinks, teacherLinks] = await Promise.all([
    db.from("schools").select("currency_code").eq("id", schoolId).maybeSingle(),
    db.from("subjects").select("id, code, name").eq("school_id", schoolId).is("deleted_at", null),
    db.from("class_subjects").select("subject_id").eq("school_id", schoolId),
    db.from("curriculum_subjects").select("subject_id").eq("school_id", schoolId),
    db.from("teacher_subjects").select("subject_id").eq("school_id", schoolId),
  ]);
  if (subjects.error) {
    throw publicDatabaseError(subjects.error, "Não foi possível ler as disciplinas.");
  }
  // Uso só informa: uma leitura recusada conta zero em vez de travar a revisão.
  const usage: Record<string, number> = {};
  for (const links of [classLinks, curriculumLinks, teacherLinks]) {
    for (const row of links.data ?? []) {
      usage[row.subject_id] = (usage[row.subject_id] ?? 0) + 1;
    }
  }
  return reviewSubjects(
    (subjects.data ?? []).map((s) => ({ id: s.id, code: s.code, name: s.name })),
    usage,
    countryFromCurrency(school.data?.currency_code),
  );
}

export const getSubjectReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    return loadReview(context.supabase, membership.schoolId);
  });

export const normalizeSubjectNamesInputSchema = z.object({
  subjectIds: z.array(z.string().uuid()).min(1).max(200),
});

export const normalizeSubjectNames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => normalizeSubjectNamesInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    // A política de UPDATE exige aal2: sem isto o UPDATE não dá erro, só não muda nada.
    requireAal2(context.claims, "Corrigir nomes de disciplinas");
    const db = context.supabase;
    const review = await loadReview(db, membership.schoolId);
    const wanted = new Set(data.subjectIds);
    const chosen = review.renames.filter((r) => wanted.has(r.id));
    const applied: Array<{ id: string; from: string; to: string }> = [];
    for (const r of chosen) {
      const { data: row, error } = await db
        .from("subjects")
        .update({ name: r.to, updated_by: context.userId })
        .eq("id", r.id)
        .eq("school_id", membership.schoolId)
        // Só se ninguém mudou o nome entretanto.
        .eq("name", r.from)
        .select("id")
        .maybeSingle();
      if (error) throw publicDatabaseError(error, `Não foi possível corrigir «${r.from}».`);
      if (row) applied.push({ id: r.id, from: r.from, to: r.to });
    }
    if (applied.length) {
      await recordAuditBatch(
        applied.map((a) => ({
          schoolId: membership.schoolId,
          actorUserId: context.userId,
          action: "academic.subject.renamed_to_catalog",
          entityType: "subject",
          entityId: a.id,
          metadata: { from: a.from, to: a.to, source: "education-catalog" },
        })),
      ).catch(() => undefined);
    }
    return {
      applied: applied.length,
      skipped: chosen.length - applied.length,
      ignored: data.subjectIds.length - chosen.length,
    };
  });
