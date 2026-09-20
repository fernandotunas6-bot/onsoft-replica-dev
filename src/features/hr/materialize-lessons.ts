import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { materializeTeacherLessonsInputSchema } from "@/features/hr/schemas";

const HR_MATERIALIZE_ROLES = new Set(["Administrador", "Tesouraria"]);

export const materializeTeacherLessons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => materializeTeacherLessonsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem vínculo activo com uma escola.");
    if (!HR_MATERIALIZE_ROLES.has(membership.appRole)) {
      throw new Error("Sem permissão para sincronizar aulas remuneráveis.");
    }

    const { data: inserted, error } = await context.supabase.rpc("hr_materialize_teacher_lessons", {
      p_from: data.from,
      p_to: data.to,
    });

    if (error) {
      throw publicDatabaseError(
        error,
        "Não foi possível sincronizar o horário com as ocorrências docentes.",
      );
    }

    return {
      from: data.from,
      to: data.to,
      inserted: Number(inserted ?? 0),
    };
  });
