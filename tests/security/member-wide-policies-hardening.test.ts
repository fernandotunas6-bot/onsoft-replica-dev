import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260925190000_harden_member_wide_policies.sql"),
  "utf8",
).replace(/--.*$/gm, "");

/** Cada CREATE POLICY da migração: nome, tabela, comando e expressões. */
const policies = [
  ...sql.matchAll(/CREATE POLICY "([^"]+)" ON public\.(\w+)\s+FOR (\w+)[^;]*;/g),
].map((m) => ({ name: m[1]!, table: m[2]!, cmd: m[3]!, body: m[0] }));

describe("endurecimento das políticas 'qualquer membro'", () => {
  it("nenhuma política nova dá escrita com is_school_member sozinho", () => {
    const writes = policies.filter(
      (p) =>
        p.cmd !== "SELECT" && /is_school_member/.test(p.body) && !/is_school_admin/.test(p.body),
    );
    expect(writes.map((p) => `${p.table}:${p.name}`)).toEqual([]);
  });

  it("convites e integrações ficam só com o servidor", () => {
    for (const table of ["school_invitations", "school_integrations"]) {
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON public\\.${table} FROM PUBLIC, anon, authenticated`),
      );
      expect(policies.some((p) => p.table === table)).toBe(false);
    }
  });

  it("permissões de módulo exigem administrador da escola da própria linha", () => {
    const manage = policies.find((p) => p.table === "staff_module_grants" && p.cmd === "ALL");
    expect(manage?.body).toMatch(/USING \(public\.is_school_admin\(school_id\)\)/);
    expect(manage?.body).toMatch(/WITH CHECK \(public\.is_school_admin\(school_id\)\)/);
    expect(sql).toMatch(/sm\.school_id = p_school_id/);
  });

  it("mensagens directas só para remetente e destinatário", () => {
    const read = policies.find((p) => p.table === "siga_direct_messages" && p.cmd === "SELECT");
    expect(read?.body).toMatch(/sender_id/);
    expect(read?.body).toMatch(/recipient_id/);
  });

  it("as tabelas que o dashboard lê com o JWT continuam legíveis por membros", () => {
    for (const table of ["siga_assessment_scores", "siga_attendance_sessions"]) {
      expect(policies.some((p) => p.table === table && p.cmd === "SELECT")).toBe(true);
    }
  });

  it("é idempotente: cada CREATE POLICY tem DROP POLICY IF EXISTS antes", () => {
    for (const p of policies) {
      expect(sql, p.name).toContain(`DROP POLICY IF EXISTS "${p.name}" ON public.${p.table};`);
    }
  });
});
