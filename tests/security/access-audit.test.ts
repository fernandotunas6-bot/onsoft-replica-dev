import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const body = (source: string, name: string) => {
  const start = source.indexOf(`export const ${name} `);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

describe("acções sobre contas e acessos ficam em audit_logs", () => {
  const cases: Array<[string, string, string]> = [
    ["src/features/access/server.ts", "inviteSystemUser", "access.user_invited"],
    ["src/features/access/server.ts", "updateSystemAccountCargo", "access.cargo_changed"],
    ["src/features/access/server.ts", "setSystemAccountDisabled", "access.account_disabled"],
    ["src/features/access/server.ts", "resetStaffPasswordDirect", "access.password_reset_direct"],
    ["src/features/access/server.ts", "resendSystemInvite", "access.link_copied"],
    ["src/features/access/server.ts", "createSchoolInvitation", "access.invitation_created"],
    ["src/features/access/server.ts", "revokeSchoolInvitation", "access.invitation_revoked"],
    ["src/features/access/server.ts", "acceptSchoolInvitation", "access.invitation_accepted"],
    ["src/features/access/grants.ts", "setStaffModuleGrant", "access.module_grant_set"],
    ["src/features/access/grants.ts", "clearStaffModuleGrant", "access.module_grant_cleared"],
    ["src/features/students/server.ts", "assignGuardian", "students.guardian_linked"],
    ["src/features/students/server.ts", "removeGuardian", "students.guardian_unlinked"],
  ];
  for (const [file, fn, action] of cases) {
    it(`${fn} → ${action}`, () => {
      const source = body(read(file), fn);
      expect(source).toMatch(/recordAccessAudit\(\{/);
      expect(source).toContain(`"${action}"`);
    });
  }
});
