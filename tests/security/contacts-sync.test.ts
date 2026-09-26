import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/communications/contacts-sync-server.ts"),
  "utf8",
);

describe("sincronização de contactos com o Resend", () => {
  it("a audiência é única por escola (a conta Resend é partilhada)", () => {
    expect(source).toMatch(/membership\.schoolId\.slice\(0, 8\)/);
  });

  it("respeita quem desligou os comunicados", () => {
    expect(source).toMatch(/user_communication_preferences/);
    expect(source).toMatch(/\.eq\("announcements_enabled", false\)/);
  });

  it("só lê fichas desta escola e não mostra erros técnicos", () => {
    expect(source).toMatch(
      /\.eq\("school_id", membership\.schoolId\)\s*\.in\("user_id", userIds\)/,
    );
    expect(source).not.toMatch(/\$\{err\.message\}|\$\{e\.message\}/);
  });
});
