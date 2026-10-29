import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient, requireSgaWriterFor, requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { readSettingsDomain, updateSettingsDomainValue } from "@/features/school/settings-domains";
import { parseTeacherDocumentPolicy } from "@/features/people/teacher-documents-policy";

const policyInput = z.object({
  enabled: z.boolean(),
  required: z.array(z.string().max(70)).max(30),
  requiredByLevel: z.record(z.array(z.string().max(70)).max(30)).default({}),
});

/** Configuração da escola activa, nunca global nem inferida pela natureza jurídica. */
export const getTeacherDocumentPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, ["Administrador"]);
    const db = await loadSgaAdminClient();
    return readSettingsDomain(db, membership.schoolId, "teacher_documents");
  });

/** Apenas Administração altera os documentos obrigatórios e os níveis afectados. */
export const setTeacherDocumentPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => policyInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "gestao", context.supabase, context.userId, ["Administrador"],
    );
    const db = await loadSgaAdminClient();
    const policy = parseTeacherDocumentPolicy(data);
    await updateSettingsDomainValue(
      db, membership.schoolId, "teacher_documents", () => policy, context.userId,
    );
    return policy;
  });
