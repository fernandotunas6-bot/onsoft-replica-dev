import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

/** Salary references are read through the server only; public catalog tables have no direct client grants. */
const HR_SALARY_ROLES = new Set(["Administrador", "Tesouraria"]);

async function requireSalaryReader(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership || !HR_SALARY_ROLES.has(membership.appRole)) {
    throw new Error("Sem permissão para consultar tabelas salariais.");
  }
  return membership;
}

export const listApprovedSalaryScales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSalaryReader(context.userId);
    const db = await loadSgaAdminClient();
    const { data: scales, error: scaleError } = await db
      .from("hr_salary_scales")
      .select("id, code, name, sector, jurisdiction, source_title, source_reference, source_url")
      .order("name");
    if (scaleError) throw publicDatabaseError(scaleError, "Não foi possível carregar tabelas salariais.");
    if (!scales?.length) return [];

    const { data: versions, error: versionError } = await db
      .from("hr_salary_scale_versions")
      .select("id, scale_id, version_label, effective_from, effective_until")
      .eq("status", "approved")
      .order("effective_from", { ascending: false });
    if (versionError) throw publicDatabaseError(versionError, "Não foi possível carregar versões salariais.");
    const luandaParts = new Intl.DateTimeFormat("en", {
      timeZone: "Africa/Luanda", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const part = (type: string) => luandaParts.find((item) => item.type === type)?.value ?? "";
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    // Include approved future versions so HR can schedule a lawful future-dated amendment.
    const currentVersions = (versions ?? []).filter((v) => !v.effective_until || v.effective_until >= today);
    if (!currentVersions.length) return [];

    const { data: steps, error: stepsError } = await db
      .from("hr_salary_scale_steps")
      .select("id, version_id, category_code, category_name, grade, monthly_base_kz")
      .in("version_id", currentVersions.map((v) => v.id))
      .order("category_name")
      .order("grade");
    if (stepsError) throw publicDatabaseError(stepsError, "Não foi possível carregar escalões salariais.");
    const stepsByVersion = new Map<string, typeof steps>();
    for (const step of steps ?? []) {
      const list = stepsByVersion.get(step.version_id) ?? [];
      list.push(step);
      stepsByVersion.set(step.version_id, list);
    }
    return scales.map((scale) => ({
      ...scale,
      versions: currentVersions.filter((v) => v.scale_id === scale.id).map((version) => ({
        ...version,
        steps: stepsByVersion.get(version.id) ?? [],
      })),
    })).filter((scale) => scale.versions.length > 0);
  });
