import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A base reconhece o professor da conta por `teachers.user_id` OU `people.user_id`
// (current_teacher_id); o servidor só por `teachers.user_id` (ownTeacherId e afins).
// Quem liga uma conta a uma ficha de pessoa tem de a ligar também ao professor dela.

const access = readFileSync("src/features/access/server.ts", "utf8");
const invite = access.slice(
  access.indexOf("// Vinculação com a ficha de pessoa da escola com este e-mail"),
  access.indexOf("// Entrega do link de acesso por e-mail institucional"),
);
const people = readFileSync("src/features/people/server.ts", "utf8");
const mergeSteps = people.slice(people.indexOf("async function mergePeopleInSteps"));
const mergeSql = readFileSync(
  "supabase/migrations/20261010110000_teacher_number_and_merge_people.sql",
  "utf8",
);

describe("conta ligada à pessoa e ao professor", () => {
  it("o convite só liga uma ficha sem conta, sem distinguir maiúsculas no e-mail", () => {
    expect(invite).toContain('.ilike("email"');
    expect(invite.match(/\.is\("user_id", null\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("o convite liga também o registo de professor dessa pessoa", () => {
    expect(invite).toContain('.from("teachers")');
    expect(invite).toContain('.eq("person_id", existingPerson.id)');
  });

  it("a fusão de pessoas leva a conta também ao professor (passos e transacção)", () => {
    expect(mergeSteps).toMatch(/if \(moveLogin\) \{[\s\S]*?\.from\("teachers"\)/);
    expect(mergeSql).toMatch(
      /if v_move_login then\s+update public\.teachers set user_id = v_duplicate\.user_id/,
    );
  });
});
