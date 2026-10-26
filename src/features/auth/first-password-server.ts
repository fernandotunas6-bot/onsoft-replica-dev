/**
 * Primeiro acesso com senha provisória (contas de aluno criadas pela Secretaria):
 * a pessoa define a sua senha e o sinal `must_change_password` desliga-se na
 * mesma escrita. O sinal está em `app_metadata`, que só o servidor escreve.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { PASSWORD_POLICY_HINT, passwordMeetsPolicy } from "@/lib/password-policy-error";
import { mustChangePassword } from "@/features/students/student-accounts";

export const completeFirstPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ password: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    if (!passwordMeetsPolicy(data.password)) throw new Error(PASSWORD_POLICY_HINT);
    const db = await loadSgaAdminClient();
    const { data: current, error: readError } = await db.auth.admin.getUserById(context.userId);
    if (readError || !current.user) throw new Error("Não foi possível ler a conta.");
    if (!mustChangePassword(current.user.app_metadata)) {
      throw new Error("Esta conta já tem senha própria. Use «Alterar senha».");
    }
    const { error } = await db.auth.admin.updateUserById(context.userId, {
      password: data.password,
      app_metadata: { ...current.user.app_metadata, must_change_password: false },
    });
    if (error) {
      throw new Error(
        /weak|pwned|leaked/i.test(error.message)
          ? "Esta senha é fraca ou aparece em fugas de dados. Escolha outra."
          : "Não foi possível guardar a senha.",
      );
    }
    return { ok: true };
  });
