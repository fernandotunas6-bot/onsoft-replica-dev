import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { updateSettingsDomainValue } from "@/features/school/settings-domains";
import { requireSchoolWebStorage, schoolWebStorageReady } from "./storage-guard";
import {
  BLOG_PREFIX,
  blogSlugSchema,
  changeSchoolBlogSchema,
  changeSchoolBlogState,
  publicSchoolBlogPost,
  schoolBlogStateSchema,
  type PublicSchoolBlogPost,
} from "./blog-model";

import { requireAal2 } from "@/features/hr/require-aal2";
import { requireSchoolWebsiteAdministrator } from "./editor-access";

export const listSchoolBlog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ page: z.number().int().min(0).max(1000).default(0) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const member = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    requireSchoolWebsiteAdministrator(member.appRole);
    const db = await loadSgaAdminClient();
    await requireSchoolWebStorage(db);
    const result = await db
      .from("school_settings")
      .select("value", { count: "exact" })
      .eq("school_id", member.schoolId)
      .like("domain", BLOG_PREFIX.replaceAll("_", "\\_") + "%")
      .order("value->>updatedAt", { ascending: false })
      .range(data.page * 20, data.page * 20 + 19);
    if (result.error) throw new Error("Não foi possível carregar o blog da escola.");
    return {
      posts: result.data.map((row) => schoolBlogStateSchema.parse(row.value)),
      total: result.count ?? 0,
    };
  });
export const changeSchoolBlog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => changeSchoolBlogSchema.parse(input))
  .handler(async ({ data, context }) => {
    const member = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    requireSchoolWebsiteAdministrator(member.appRole);
    requireAal2(context.claims, "Alterar blog institucional");
    const db = await loadSgaAdminClient();
    await requireSchoolWebStorage(db);
    const audit = await db.from("audit_logs").insert({
      school_id: member.schoolId,
      actor_user_id: context.userId,
      action: `school.blog.${data.action}_requested`,
      entity_type: "school_settings",
      metadata: { slug: data.slug, expected_revision: data.expectedRevision },
    });
    if (audit.error) throw new Error("Não foi possível registar a alteração na auditoria.");
    return updateSettingsDomainValue(
      db,
      member.schoolId,
      BLOG_PREFIX + data.slug,
      (current) => changeSchoolBlogState(current, data),
      context.userId,
    );
  });

/** Only published snapshots cross this boundary; filtering also happens in the database. */
export async function loadPublishedSchoolBlog(
  schoolId: string,
  page = 0,
  slug?: string,
): Promise<{ posts: PublicSchoolBlogPost[]; total: number }> {
  const db = await loadSgaAdminClient();
  if (!(await schoolWebStorageReady(db))) return { posts: [], total: 0 };
  let query = db
    .from("school_settings")
    .select("value", { count: "exact" })
    .eq("school_id", schoolId)
    .eq("value->>isPublished", "true");
  query = slug
    ? query.eq("domain", BLOG_PREFIX + blogSlugSchema.parse(slug))
    : query.like("domain", BLOG_PREFIX.replaceAll("_", "\\_") + "%");
  const result = await query
    .order("value->>publishedAt", { ascending: false })
    .order("domain", { ascending: true })
    .range(page * 12, page * 12 + 11);
  if (result.error) throw new Error("Não foi possível carregar os artigos publicados.");
  return {
    posts: result.data
      .map((row) => publicSchoolBlogPost(row.value))
      .filter((post): post is PublicSchoolBlogPost => post !== null),
    total: result.count ?? 0,
  };
}
