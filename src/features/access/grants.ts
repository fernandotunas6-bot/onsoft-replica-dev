import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { accessModules } from "@/features/auth/access-policy";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { requireSgaWriter, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { recordAccessAudit } from "@/features/audit/record-audit";

/**
 * Este módulo lê e escreve com o cliente do utilizador (`context.supabase`),
 * não com o service role. É a primeira fatia do ARQ-01.
 *
 * A troca só é segura com evidência da base, não do SQL versionado — o
 * repositório não descreve o esquema de produção. Consultado a 2026-09-14,
 * `staff_module_grants` tinha, para `authenticated`, uma política `ALL` com
 * `USING is_school_member(school_id)`. Isso deixava QUALQUER membro (alunos
 * incluídos) conceder-se permissões pela API. A migração
 * `20260925190000_harden_member_wide_policies.sql` troca-a por
 * `is_school_admin(school_id)` — administrador da escola da própria linha —,
 * que continua a cobrir o select, o upsert e o delete deste ficheiro.
 * `npm run siga:rls-readiness` reproduz a consulta.
 *
 * O `requireSgaWriter(["Administrador"])` continua por cima: a política
 * restringe à escola, a aplicação restringe ao cargo. Uma protege da outra
 * falhar.
 *
 * Sem cast de tipos: esta fatia precisou de um durante algumas horas, porque os
 * tipos gerados descreviam 40 das 149 tabelas e `staff_module_grants` era uma
 * das que faltavam. Com os tipos repostos a partir da produção (OPS-01), o
 * `context.supabase` está tipado para esta tabela e o cast saiu — o que também
 * significa que as colunas passam a ser verificadas em compilação.
 */

export const setStaffModuleGrantInputSchema = z.object({
  userId: z.string().uuid(),
  moduleKey: z.enum(accessModules.map((item) => item.key) as [string, ...string[]]),
  level: z.enum(["Nenhum", "Leitura", "Escrita", "Total"]),
});

export const listStaffModuleGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    const { data, error } = await context.supabase
      .from("staff_module_grants")
      .select("user_id, module_key, level")
      .eq("school_id", membership.schoolId);
    // Tabela em falta continua a devolver lista vazia — é o estado de um SGA
    // sem o SQL aplicado. Qualquer outro erro passa a ser visível: com RLS,
    // "não consegui ler" e "não há sobreposições" deixaram de ser a mesma
    // coisa, e engolir tudo mostraria permissões vazias a um administrador que
    // as tem.
    if (error && /schema cache|does not exist|42P01|PGRST/i.test(error.message)) {
      return [] as Array<{ user_id: string; module_key: string; level: string }>;
    }
    if (error) throw publicDatabaseError(error, "Não foi possível ler as permissões.");
    return (data ?? []) as Array<{ user_id: string; module_key: string; level: string }>;
  });

export const setStaffModuleGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setStaffModuleGrantInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    // A permissão só se dá a pessoal desta escola. No servidor ela pode abrir
    // funções a quem não tem o cargo; a um aluno ou encarregado, nunca.
    const target = await resolveSgaMembershipAdmin(data.userId, membership.schoolId);
    if (!target || target.schoolId !== membership.schoolId) {
      throw new Error("Esta conta não pertence à escola.");
    }
    if (target.appRole === "Aluno" || target.appRole === "Encarregado") {
      throw new Error("Permissões por módulo são só para pessoal da escola.");
    }
    const { error } = await context.supabase.from("staff_module_grants").upsert(
      {
        school_id: membership.schoolId,
        user_id: data.userId,
        module_key: data.moduleKey,
        level: data.level,
        updated_by: context.userId,
        created_by: context.userId,
      },
      { onConflict: "school_id,user_id,module_key" },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível guardar a permissão.");
    await recordAccessAudit({
      schoolId: membership.schoolId,
      actorUserId: context.userId,
      action: "access.module_grant_set",
      entityType: "auth_user",
      entityId: data.userId,
      metadata: { module: data.moduleKey, level: data.level },
    });
    return { ok: true };
  });

export const clearStaffModuleGrantInputSchema = z.object({
  userId: z.string().uuid(),
  moduleKey: z.enum(accessModules.map((item) => item.key) as [string, ...string[]]),
});

/** Remove a sobreposição — a conta volta a usar a predefinição do cargo. */
export const clearStaffModuleGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => clearStaffModuleGrantInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    const { error } = await context.supabase
      .from("staff_module_grants")
      .delete()
      .eq("school_id", membership.schoolId)
      .eq("user_id", data.userId)
      .eq("module_key", data.moduleKey);
    if (error) throw publicDatabaseError(error, "Não foi possível repor a predefinição.");
    await recordAccessAudit({
      schoolId: membership.schoolId,
      actorUserId: context.userId,
      action: "access.module_grant_cleared",
      entityType: "auth_user",
      entityId: data.userId,
      metadata: { module: data.moduleKey },
    });
    return { ok: true };
  });
