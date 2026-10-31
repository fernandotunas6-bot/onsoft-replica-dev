import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** As listagens de recibos usam sempre JWT/RLS e restrição explícita à escola. */
const source = readFileSync(
  join(process.cwd(), "src/features/finance/receipt-register-server.ts"),
  "utf8",
);

describe("segurança da pesquisa de recibos", () => {
  it("não utiliza o cliente Supabase privilegiado", () => {
    expect(source).not.toContain("loadSgaAdminClient");
    expect(source).toContain("sgaClient(context.supabase)");
  });
  it("exige sessão, papel financeiro e filtro escolar", () => {
    expect(source).toContain("requireSupabaseAuth");
    expect(source).toContain('requireSgaWriterFor("financeiro"');
    expect(source.match(/\.eq\("school_id", schoolId\)/g)?.length).toBeGreaterThan(5);
    expect(source).toContain('.eq("school_id", membership.schoolId)');
  });
});
