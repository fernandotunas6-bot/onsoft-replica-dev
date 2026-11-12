import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";

/** Administração/Secretaria da escola e o cliente da base, para as funções de Alumni. */
export async function adminContext(userId: string, mode: "read" | "write" = "read") {
  const membership = await (mode === "write" ? requireSgaWriterForWrite : requireSgaWriterFor)(
    "pessoas",
    userId,
    ["Administrador", "Secretaria"],
  );
  const db = await loadSgaAdminClient();
  return { membership, db };
}
