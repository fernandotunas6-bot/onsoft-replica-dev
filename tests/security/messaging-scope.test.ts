import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/sga-admin", () => ({}));

const { isMessagingStaff } = await import("@/features/messages/server");
const source = readFileSync(join(process.cwd(), "src/features/messages/server.ts"), "utf8");
const body = (name: string) => {
  const start = source.indexOf(`export const ${name} `);
  return source.slice(start, source.indexOf("export const ", start + 1));
};

describe("mensagens directas: quem fala com quem", () => {
  it("pessoal da escola é reconhecido; alunos e encarregados não", () => {
    for (const role of ["Administrador", "Secretaria", "Tesouraria", "Professor"]) {
      expect(isMessagingStaff([role])).toBe(true);
    }
    for (const role of ["Aluno", "Encarregado", "Utilizador", ""]) {
      expect(isMessagingStaff([role])).toBe(false);
    }
    expect(isMessagingStaff(["Encarregado", "Professor"])).toBe(true);
  });

  it("alunos e encarregados só vêem o pessoal no directório", () => {
    expect(body("listSchoolColleagues")).toMatch(
      /viewerIsStaff\s*\?\s*userIds\s*:\s*userIds\.filter/,
    );
  });

  it("alunos e encarregados só enviam mensagens ao pessoal (cargo nesta escola)", () => {
    const send = body("sendDirectMessage");
    expect(send).toMatch(/schoolRolesOf\(db, membership\.schoolId, data\.peerId\)/);
    expect(send).toMatch(/Só pode enviar mensagens ao pessoal da escola/);
  });
});

describe("mensagens directas: só o servidor grava", () => {
  it("a migração retira a política de inserção e os privilégios de escrita", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260926100000_direct_messages_server_only_insert.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS "Send school direct messages" ON public\.siga_direct_messages;/,
    );
    expect(sql).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON public\.siga_direct_messages FROM anon, authenticated;/,
    );
  });

  it("o browser não insere mensagens directamente", () => {
    for (const file of [
      "src/features/messages/StaffMessenger.tsx",
      "src/features/messages/use-inbox-unread.ts",
    ]) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      expect(text, file).not.toMatch(
        /from\("siga_direct_messages"\)\s*\.(insert|update|upsert|delete)/,
      );
    }
  });
});
