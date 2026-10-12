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
import { globalSubject } from "./data/subjects";
import { countryFromCurrency, reviewSubjects, type SubjectReview } from "./subject-review";

type Db = SupabaseClient<Database>;

async function loadReview(db: Db, schoolId: string): Promise<SubjectReview> {
  const [school, subjects, classLinks, curriculumLinks, teacherLinks] = await Promise.all([
    db.from("schools").select("currency_code").eq("id", schoolId).maybeSingle(),
    // `*`: `catalog_subject_code` só existe depois de 20261012120000; assim a
    // revisão funciona antes e depois da migração e sabe se a ligação está activa.
    db.from("subjects").select("*").eq("school_id", schoolId).is("deleted_at", null),
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
  const rows = (subjects.data ?? []) as Array<Record<string, unknown>>;
  return reviewSubjects(
    rows.map((s) => ({
      id: String(s.id),
      code: String(s.code ?? ""),
      name: String(s.name ?? ""),
      catalogCode: typeof s[CATALOG_COLUMN] === "string" ? (s[CATALOG_COLUMN] as string) : null,
    })),
    usage,
    countryFromCurrency(school.data?.currency_code),
    rows.length > 0 && CATALOG_COLUMN in rows[0]!,
  );
}

const CATALOG_COLUMN = "catalog_subject_code";
const LINK_MIGRATION = "20261012120000_subjects_catalog_link.sql";

/** A coluna ainda não existe na base (migração por aplicar). */
export function isMissingCatalogColumn(
  error: { code?: string | null; message?: string | null } | null,
) {
  return Boolean(
    error &&
    /42703|PGRST204/.test(String(error.code ?? "")) &&
    String(error.message ?? "").includes(CATALOG_COLUMN),
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

export const mergeDuplicateSubjectsInputSchema = z.object({
  keepId: z.string().uuid(),
  mergeIds: z.array(z.string().uuid()).min(1).max(20),
});

type MergeResult = Record<string, number | string>;
type RpcClient = {
  rpc: (
    fn: "merge_school_subjects",
    args: { target_school_id: string; keep_subject_id: string; merge_subject_ids: string[] },
  ) => PromiseLike<{ data: MergeResult | null; error: { code?: string; message?: string } | null }>;
};

/**
 * Junta disciplinas duplicadas numa só (`public.merge_school_subjects`,
 * migração 20261010150000). Só aceita um grupo que a revisão reconhece como
 * a mesma disciplina do catálogo: não junta «Física» com «Matemática» por
 * engano. A função na base volta a exigir 2FA e a permissão, e recusa o que
 * perderia informação (as duas na mesma turma, exames, competências,
 * ensino superior).
 */
export const mergeDuplicateSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => mergeDuplicateSubjectsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    requireAal2(context.claims, "Juntar disciplinas");
    const review = await loadReview(context.supabase, membership.schoolId);
    const group = review.duplicates.find((g) => g.members.some((m) => m.id === data.keepId));
    const members = new Set(group?.members.map((m) => m.id));
    if (!group || data.mergeIds.some((id) => id === data.keepId || !members.has(id))) {
      throw new Error("Só se juntam disciplinas que o catálogo reconhece como a mesma.");
    }
    // A função ainda não está nos tipos gerados (migração por aplicar).
    const db = context.supabase as unknown as RpcClient;
    const { data: result, error } = await db.rpc("merge_school_subjects", {
      target_school_id: membership.schoolId,
      keep_subject_id: data.keepId,
      merge_subject_ids: data.mergeIds,
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        throw new Error(
          "Juntar disciplinas ainda não está activo no servidor: falta aplicar a migração 20261010150000_merge_school_subjects.sql.",
        );
      }
      // Recusas da própria função: a mensagem já diz o que corrigir.
      if (error.code === "22023" && error.message) throw new Error(error.message);
      throw publicDatabaseError(error, "Não foi possível juntar as disciplinas.");
    }
    const keep = group.members.find((m) => m.id === data.keepId)!;
    await recordAuditBatch([
      {
        schoolId: membership.schoolId,
        actorUserId: context.userId,
        action: "academic.subject.merged",
        entityType: "subject",
        entityId: data.keepId,
        metadata: {
          keep: { id: keep.id, code: keep.code, name: keep.name },
          merged: group.members
            .filter((m) => data.mergeIds.includes(m.id))
            .map((m) => ({ id: m.id, code: m.code, name: m.name })),
          moved: result,
          source: "education-catalog",
        },
      },
    ]).catch(() => undefined);
    return { merged: Number(result?.["merged"] ?? 0), keepName: keep.name };
  });

export const linkSubjectsToCatalogInputSchema = z.object({
  /** Sugestões automáticas da revisão (nome exacto) a aplicar. */
  auto: z.array(z.string().uuid()).max(500).default([]),
  /** Disciplinas próprias da escola ligadas à mão a uma disciplina do catálogo. */
  manual: z
    .array(
      z.object({
        subjectId: z.string().uuid(),
        catalogCode: z.string().regex(/^[A-Z][A-Z0-9-]{0,23}$/),
      }),
    )
    .max(50)
    .default([]),
});

/**
 * Grava `subjects.catalog_subject_code`. Como a correcção de nomes, recalcula
 * a revisão no servidor: as automáticas só se a revisão as sugere, as manuais
 * só para disciplinas sem correspondência e com um código que o catálogo
 * conhece. Não substitui uma ligação que já existe (`IS NULL`).
 */
export const linkSubjectsToCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => linkSubjectsToCatalogInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    requireAal2(context.claims, "Ligar disciplinas ao catálogo");
    const db = context.supabase;
    const review = await loadReview(db, membership.schoolId);
    const wanted = new Set(data.auto);
    const unmatched = new Map(review.unmatched.map((u) => [u.id, u]));
    const links = [
      ...review.toLink
        .filter((l) => wanted.has(l.id))
        .map((l) => ({ id: l.id, name: l.name, catalogCode: l.catalogCode, how: "name" })),
      ...data.manual
        .filter((m) => unmatched.has(m.subjectId) && globalSubject(m.catalogCode))
        .map((m) => ({
          id: m.subjectId,
          name: unmatched.get(m.subjectId)!.name,
          catalogCode: m.catalogCode,
          how: "manual",
        })),
    ];
    const applied: typeof links = [];
    for (const link of links) {
      // Sem tipos: a coluna só existe depois de 20261012120000.
      const { data: row, error } = await db
        .from("subjects")
        .update({ catalog_subject_code: link.catalogCode, updated_by: context.userId } as never)
        .eq("id", link.id)
        .eq("school_id", membership.schoolId)
        .is("catalog_subject_code" as never, null)
        .select("id")
        .maybeSingle();
      if (isMissingCatalogColumn(error)) {
        throw new Error(
          `Ligar ao catálogo ainda não está activo no servidor: falta aplicar a migração ${LINK_MIGRATION}.`,
        );
      }
      if (error) throw publicDatabaseError(error, `Não foi possível ligar «${link.name}».`);
      if (row) applied.push(link);
    }
    if (applied.length) {
      await recordAuditBatch(
        applied.map((a) => ({
          schoolId: membership.schoolId,
          actorUserId: context.userId,
          action: "academic.subject.linked_to_catalog",
          entityType: "subject",
          entityId: a.id,
          metadata: { name: a.name, catalogCode: a.catalogCode, how: a.how },
        })),
      ).catch(() => undefined);
    }
    return {
      applied: applied.length,
      skipped: links.length - applied.length,
      ignored: data.auto.length + data.manual.length - links.length,
    };
  });
