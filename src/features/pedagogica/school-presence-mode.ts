import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { dynamicTablesClient } from "@/integrations/supabase/sga";
import type { SchoolPresenceMode } from "@/features/pedagogica/school-qr";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/**
 * Modo de presença dos professores na escola: «qr» (só conta a leitura do QR da
 * escola), «button» (botão «Estou na sala», o modo por omissão) ou «off» (desligado).
 * Sem definições, ou com o SQL do QR por aplicar, é «button»: nada muda para a escola.
 */
export async function loadSchoolPresenceMode(
  db: AdminDb,
  schoolId: string,
): Promise<SchoolPresenceMode> {
  try {
    // Tabela de 20261026100000_school_presence_qr.sql, ainda fora dos tipos gerados.
    const { data, error } = await dynamicTablesClient(db as never)
      .from("siga_school_presence_settings")
      .select("mode")
      .eq("school_id", schoolId)
      .maybeSingle();
    if (error || !data) return "button";
    const mode = String((data as { mode?: string }).mode);
    return mode === "qr" || mode === "off" ? mode : "button";
  } catch {
    return "button";
  }
}

export const PRESENCE_MODE_QR_MESSAGE =
  "Nesta escola a presença confirma-se com o QR da escola: abra «Ler QR da escola» e aponte a câmara ao QR da Direcção.";
export const PRESENCE_MODE_OFF_MESSAGE =
  "A confirmação de presença dos professores está desligada nesta escola.";
