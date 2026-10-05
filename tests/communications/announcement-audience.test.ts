import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("comunicados: cada um lê os do seu público", () => {
  const server = readFileSync("src/features/communications/server.ts", "utf8");
  const sql = readFileSync(
    "supabase/migrations/20261003070000_announcements_audience_rls.sql",
    "utf8",
  );

  it("o servidor filtra por público para quem não é pessoal (já não «tudo menos o corpo docente»)", () => {
    expect(server).not.toContain('.neq("audience", "teaching_staff")');
    expect(server).toContain('.in("audience", audiences)');
  });

  it("aviso de cobrança só para encarregado com factura vencida", () => {
    expect(server).toContain('audiences.add("guardians_with_debt")');
    expect(server).toContain('.lt("due_date"');
    expect(sql).toContain("fi.due_date < current_date");
  });

  it("a base deixa de usar is_school_member na leitura dos comunicados", () => {
    const policy = sql.slice(sql.indexOf('CREATE POLICY "Read school announcements"'));
    expect(policy).not.toContain("is_school_member");
    expect(policy).toContain("private.is_school_staff(school_id)");
    expect(policy).toContain("private.announcement_audiences_for(school_id)");
  });
});
