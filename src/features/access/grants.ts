import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { accessModules } from "@/features/auth/access-policy";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { sgaClient } from "@/integrations/supabase/sga";
import { requireSgaWriter } from "@/integrations/supabase/sga-admin";

/**
 * Este módulo lê e escreve com o cliente do utilizador (`context.supabase`),
 * não com o service role. É a primeira fatia do ARQ-01.
 *
 * A troca só é segura com evidência da base, não do SQL versionado — o
 * repositório não descreve o esquema de produção. Consultado a 2026-09-14,
 * `staff_module_grants` tem, para `authenticated`, uma política `ALL` com
 * `USING is_school_member(school_id)` e o mesmo `CHECK`: cobre o select, o
 * upsert e o delete que este ficheiro faz. `npm run siga:rls-readiness`
 * reproduz a consulta.
 *
 * O `requireSgaWriter(["Administrador"])` continua por cima: a política
 * restringe à escola, a aplicação restringe ao cargo. Uma protege da outra
 * falhar.
 *
 * O `sgaClient()` aqui é só tipos, não privilégio: devolve o **mesmo** cliente
 * com a tipagem relaxada. É necessário porque `src/integrations/supabase/types.ts`
 * descreve 40 tabelas e a produção tem 149 — `staff_module_grants` é uma das
 * que faltam, e `context.supabase` vem tipado com esses tipos gerados. É o
 * mesmo `sgaClient()` que `loadSgaAdminClient()` já usava pela mesma razão. O
 * OPS-01 (esquema sob controlo de versões) é o que dispensa este cast.
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
    const db = sgaClient(context.supabase);
    const { data, error } = await db
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
    const db = sgaClient(context.supabase);
    const { error } = await db.from("staff_module_grants").upsert(
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
    const db = sgaClient(context.supabase);
    const { error } = await db
      .from("staff_module_grants")
      .delete()
      .eq("school_id", membership.schoolId)
      .eq("user_id", data.userId)
      .eq("module_key", data.moduleKey);
    if (error) throw publicDatabaseError(error, "Não foi possível repor a predefinição.");
    return { ok: true };
  });
